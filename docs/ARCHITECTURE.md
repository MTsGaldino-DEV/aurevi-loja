# Arquitetura: loja Aurevi

MVP enxuto para uma pessoa manter com 5 a 15 h por semana. O escopo aprovado está em [research/analise-nuvemshop.md](research/analise-nuvemshop.md). O modelo de dados está em [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma).

## 1. Ajustes em relação ao briefing

| Ajuste | Motivo |
|---|---|
| Sem `addresses` e sem `carts.customer_id` | Conta de cliente foi para a Fase 2 do produto. O endereço fica no snapshot do pedido. |
| Sem `carts.abandoned_notified_at` | Recuperação de carrinho está fora do MVP. |
| `product_options` e `product_option_values` são globais | Filtros consistentes e valores padronizados entre produtos. |
| `products`: `composition`, `size_chart`, `model_info` | Medidas estruturadas, aprovadas na Fase 0. |
| `orders`: `checkout_key`, `access_token_hash`, `customer_snapshot`, `pix_discount_cents`, `review_reason` | Duplo clique, consulta do pedido sem conta, histórico e casos que exigem ação humana. |
| `product_images`: `width`, `height`, `storage_key` | Evita layout shift e permite trocar o domínio das imagens. |
| Novas: `integration_credentials`, `admin_sessions` | O token do Melhor Envio expira e precisa girar em execução. Sessões no servidor podem ser revogadas. |
| Recusa de cartão não libera a reserva na hora | A cliente pode tentar de novo até `reservation_expires_at`. |

## 2. Stack

Versões estáveis verificadas no npm em 05/11/2026, fixadas sem `^`.

| Pacote | Versão | Nota |
|---|---|---|
| Node | 24 | Imagem Docker `node:24`. |
| `next` | 16.4.5 | App Router, `output: 'standalone'`. |
| `@nestjs/core` | 12.3.3 | `schedule` 12.0.2 e `throttler` 6.7.1 aceitam a v12. |
| `prisma`, `@prisma/client` | 7.10.1 | **Não usar a tag `latest`:** o npm aponta para `8.0.0-rc.30`. Usa `@prisma/adapter-pg` e `prisma.config.ts`. |
| `turbo` | 2.11.10 | Com pnpm workspaces. |
| `tailwindcss` | 4.3.4 | Com shadcn/ui. |
| `zod` | 4.6.7 | Em `packages/shared`. |
| `mercadopago`, `@mercadopago/sdk-react` | 3.6.1, 1.0.7 | |
| `resend` | 6.37.0 | |
| `argon2` | 0.45.2 | |
| PostgreSQL | 16 | |

## 3. Topologia

```text
Navegador -> Cloudflare -> Caddy -> /api/*  -> api (NestJS) -> postgres
                                 -> demais  -> web (Next.js) -> api, pela rede interna
```

- **Mesma origem:** loja e API no mesmo domínio, então não há CORS na operação normal e os cookies ficam simples.
- **Imagens:** upload pela API para o R2. `next/image` otimiza com cache em volume.
- **Revalidação:** a API chama uma rota interna do Next, com segredo, ao mudar produto, categoria ou `settings`.
- **Sem fila externa:** uma única instância da API roda os jobs. Basta enquanto houver um container.
- **Desenvolvimento:** MinIO no lugar do R2 e e-mail apenas em log, para não exigir cadastro em serviços.

## 4. Módulos do NestJS

Catalog, Cart, Checkout, Orders, Payments, Webhooks, Shipping, Coupons, Customers, Notifications, Admin/Auth, Jobs, Settings.

`Checkout` orquestra a criação do pedido. Só `Orders` muda o status do pedido, e estoque só muda por um serviço único que grava `stock_movements` na mesma transação.

## 5. SQL manual da migration inicial

O Prisma não expressa estes itens no schema. `CREATE EXTENSION` vem antes das tabelas; o restante, depois.

```sql
CREATE EXTENSION IF NOT EXISTS citext;

ALTER SEQUENCE orders_number_seq RESTART WITH 1001;

ALTER TABLE product_variants
  ADD CONSTRAINT stock_on_hand_non_negative CHECK (stock_on_hand >= 0),
  ADD CONSTRAINT stock_reserved_non_negative CHECK (stock_reserved >= 0),
  ADD CONSTRAINT stock_reserved_within_on_hand CHECK (stock_reserved <= stock_on_hand),
  ADD CONSTRAINT variant_price_non_negative CHECK (price_cents IS NULL OR price_cents >= 0);
ALTER TABLE products
  ADD CONSTRAINT product_price_non_negative CHECK (price_cents >= 0),
  ADD CONSTRAINT product_dimensions_positive CHECK (weight_grams > 0 AND width_cm > 0 AND height_cm > 0 AND length_cm > 0);
ALTER TABLE cart_items ADD CONSTRAINT cart_quantity_positive CHECK (quantity > 0);
ALTER TABLE order_items
  ADD CONSTRAINT order_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT order_item_price_non_negative CHECK (unit_price_cents >= 0);
ALTER TABLE coupons
  ADD CONSTRAINT coupon_uses_within_limit CHECK (uses_count >= 0 AND (max_uses IS NULL OR uses_count <= max_uses)),
  ADD CONSTRAINT coupon_value_valid CHECK (
    (type = 'percent' AND value BETWEEN 1 AND 100)
    OR (type = 'fixed' AND value > 0)
    OR (type = 'free_shipping' AND value = 0));
ALTER TABLE orders
  ADD CONSTRAINT order_amounts_non_negative CHECK (
    subtotal_cents >= 0 AND discount_cents >= 0 AND pix_discount_cents >= 0 AND shipping_cents >= 0),
  ADD CONSTRAINT order_total_matches CHECK (
    total_cents = subtotal_cents - discount_cents - pix_discount_cents + shipping_cents AND total_cents >= 0);
ALTER TABLE payments
  ADD CONSTRAINT payment_amount_non_negative CHECK (amount_cents >= 0),
  ADD CONSTRAINT payment_installments_positive CHECK (installments >= 1);
```

## 6. Fluxos críticos

### Criação do pedido

Em uma transação, com todos os valores recalculados no servidor:

1. Rejeita ou devolve o pedido existente se `checkout_key` já foi usada.
2. Busca preços atuais, valida o cupom e cota o frete de novo. Se a opção escolhida sumiu, pede nova escolha.
3. Reserva cada item com o `UPDATE` condicional do briefing, em ordem de `variant_id` para evitar deadlock. Se alguma linha não for afetada, faz rollback e informa "sem estoque".
4. Incrementa o cupom com `WHERE max_uses IS NULL OR uses_count < max_uses`.
5. Grava pedido, snapshots, itens e movimentos. O token do link é gerado aleatoriamente e só o hash é salvo.

### Pagamento

- Usa `/v1/payments`, que é o caminho mostrado pelos guias do Payment Brick. A documentação marca essa API como "legacy", mas informa que ela continua funcionando, sem novos recursos. A Orders API não aparece nesses guias.
- Cada tentativa bloqueia o pedido (`SELECT ... FOR UPDATE`), confirma que ele segue em `pending_payment` e cria uma linha em `payments` com `X-Idempotency-Key` nova.
- Ao trocar de método, o Pix pendente é cancelado antes da nova tentativa, porque um QR ativo continuaria pagável.
- O valor vem do pedido. Pix recalcula `pix_discount_cents` e `total_cents`; cartão zera o desconto.
- **Pix:** `expiration_time`/`date_of_expiration` de 30 minutos, o mínimo informado na documentação. A reserva dura esse prazo mais 10 minutos, para absorver atraso de confirmação.

### Webhook

1. Valida com `WebhookSignatureValidator` do SDK oficial, com `xSignature`, `xRequestId`, `dataId` (`data.id` da query) e o segredo. O código do SDK confirma HMAC-SHA256 sobre `id:{dataId};request-id:{requestId};ts:{ts};` e comparação em tempo constante. Assinatura inválida é rejeitada.
2. Grava em `webhook_events` e responde 200. O limite documentado é de 22 s.
3. Processa logo depois, sem segurar a resposta. Um job a cada minuto retoma eventos com `processed_at` nulo.
4. Busca o pagamento no Mercado Pago, atualiza `payments` e aplica a transição de pedido.
5. A transição é condicional (`UPDATE orders SET status = 'paid' WHERE id = $1 AND status = 'pending_payment'`). Baixa de estoque e e-mail só acontecem se uma linha mudou, e a baixa fica na mesma transação. Evento duplicado não tem efeito.

### Status

Provisório: confirmar os valores de `/v1/payments` na Fase 5. A página lida descreve os status da Orders API.

| Status do Mercado Pago | Pagamento | Pedido |
|---|---|---|
| `pending`, `in_process` | aguardando | continua `pending_payment` |
| `approved` | aprovado | `paid` |
| `rejected` | recusado | continua `pending_payment`, permite nova tentativa |
| `cancelled` | cancelado | sem mudança; o job cancela ao expirar a reserva |
| `refunded` | estornado | `refunded`, sem repor estoque automaticamente |
| `charged_back` | contestado | preenche `review_reason` |

### Casos de borda

- **Pagamento aprovado após o cancelamento:** tenta reservar de novo. Se houver estoque, o pedido vira `paid`; se não houver, preenche `review_reason` para reembolso manual.
- **Segundo pagamento aprovado no mesmo pedido:** preenche `review_reason`.
- **Reembolso:** feito no painel do Mercado Pago no MVP. O webhook marca `refunded`. O admin devolve a peça ao estoque por uma ação explícita, porque ela pode voltar danificada.

### Jobs (`@nestjs/schedule`)

| Frequência | Tarefa |
|---|---|
| 1 min | Reprocessa webhooks pendentes, com limite de tentativas. |
| 5 min | Cancela pedidos `pending_payment` com reserva vencida e sem pagamento pendente válido. Libera estoque e cupom. |
| 1 dia | Renova o token do Melhor Envio, que vale 30 dias. O refresh token vale 45. |
| 1 dia | Remove carrinhos e sessões vencidos e limpa `raw`/`payload` antigos. |

## 7. Regras de preço

Ordem de cálculo:

1. Subtotal: preço da variante ou, na falta dele, do produto.
2. Cupom sobre o subtotal, com arredondamento para baixo no desconto.
3. Desconto Pix sobre subtotal menos cupom. **Não incide sobre o frete.**
4. Frete: opções da tabela por UF mais as cotações do Melhor Envio.
5. O frete é pago pela cliente. Frete grátis fica **desligado por padrão** (`free_shipping_threshold_cents` nulo) e a barra de progresso só aparece se ele for ativado. Quando ativado, ou com cupom `free_shipping`, a opção mais barata fica com custo zero, considerando subtotal menos cupom. O desconto Pix não conta para atingir esse valor.

Parcelas exibidas: `min(max_parcelas_sem_juros, floor(total / valor_minimo_parcela))`, com no mínimo 1. O mesmo número vai para `maxInstallments` do Brick e é validado no servidor.

## 8. Frete (Melhor Envio)

- `POST {base}/api/v2/me/shipment/calculate`, com `from`, `to` e `products` (cm, kg, seguro em reais). Base de sandbox: `https://sandbox.melhorenvio.com.br`.
- Usa `custom_price` e `custom_delivery_range`, conforme a documentação.
- Autenticação OAuth2 com escopo `shipping-calculate`. `User-Agent` obrigatório, com nome da aplicação e e-mail de contato.
- Timeout curto e fallback: se a API falhar, a loja oferece só a tabela por UF.
- O limite é de 250 requisições por minuto por usuário, por isso o endpoint público de CEP tem rate limit e cache curto.
- O sandbox só cobre Correios e Jadlog.
- Ainda por confirmar na Fase 7: endpoint de troca do código por token.

## 9. `settings`

Cada chave tem schema Zod em `packages/shared`: `max_interest_free_installments`, `min_installment_cents`, `pix_discount_percent`, `free_shipping_threshold_cents`, `flat_shipping_by_uf`, `shipping_origin`, `announcement_messages`, `home_hero`, `home_collections`, `store_info`.

## 10. Segurança e LGPD

- **Cartão:** tokenizado no navegador pelo Brick. Número e CVV nunca passam pela API. O Access Token fica só na API.
- **Admin:** cookie `HttpOnly`, `Secure`, `SameSite=Lax`; senha com argon2; rate limit no login; checagem de `Origin` em escritas.
- **Público:** rate limit por IP real (`CF-Connecting-IP`), aceito só quando vem do proxy; Zod em toda entrada; CSP com as origens exigidas pelo Mercado Pago, a confirmar na Fase 5.
- **Compra sem conta:** o e-mail nunca revela nem preenche dados de compras anteriores. O pedido só abre com o token do link.
- **Dados:** coleta mínima, com CPF exigido apenas para pagamento e entrega. Backups cifrados antes de ir para bucket privado.
- **Infra:** Postgres sem porta pública. Na Cloudflare, modo SSL Full (strict); forma de certificado no Caddy a confirmar na implantação.
- **Backup:** `pg_dump` diário com retenção de 30 dias e restauração testada antes de abrir a loja.

## 11. Design tokens

Um único arquivo, `apps/web/src/app/tokens.css`, com valores iniciais da `BRANDING-AREIA`. Contraste WCAG calculado:

| Combinação | Contraste | Uso permitido |
|---|---|---|
| Cacau `#66513D` sobre Papel `#F5EFE6` | 6,54 | Texto e botões |
| Cacau sobre Areia `#D2BFA4` | 4,17 | Só texto grande |
| Argila `#8D7459` sobre Papel | 3,85 | Só texto grande e ícones |
| Ouro `#CFB77F` sobre Cacau | 3,82 | Logo e texto grande |
| Duna `#AD977B` sobre Papel | 2,45 | Só decoração |
| Ouro sobre Papel | 1,71 | Nunca para texto. O logo dourado pede fundo Cacau. |

Fontes: Instrument Serif nos títulos e DM Sans na leitura, com `next/font/local` a partir de `Branding/BRANDING-AREIA/05-fontes`. As imagens de `02-imagens` são geradas por IA e servem só para banners institucionais, nunca como foto de produto.

## 12. Ordem das fases

Aprovado: **a Fase 6 (estoque) vem antes da Fase 5 (pagamento)**. A reserva nasce com o pedido, e o Checkpoint 5 testa Pix expirado, que depende do job de liberação. Ordem: 2, 3, 4, 6, 5, 7, 8, 9.

## 13. Riscos em aberto

| Risco | Ação |
|---|---|
| **"Sem juros" não confirmado.** A documentação lida do Brick só limita o número de parcelas e não diz como configurar parcelas sem juros nem quem paga. | Testar no início da Fase 5. Não exibir "sem juros" antes de confirmar o que a cliente vê. |
| Nota fiscal está fora do MVP, mas a venda pode exigi-la desde o primeiro pedido. | Confirmar com o contador como emitir no início. |
| Status de `/v1/payments` e formato exato do evento de webhook. | Confirmar na documentação na Fase 5. |
| API do Payment Brick migrar para a Orders API. | `Payments` isola a chamada; reavaliar quando os guias do Brick mudarem. |
| Cadastro em serviços (Mercado Pago, Melhor Envio, Resend, R2, VPS, domínio). | Pedir aprovação antes de cada um. |
