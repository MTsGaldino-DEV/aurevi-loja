# Melhor Envio Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans. Preserve the existing uncommitted payment implementation.

**Goal:** Cotar frete com Melhor Envio no produto, sacola e checkout, com origem 35045-120 e fallback por UF.

**Architecture:** ShippingService combina as regras existentes com a cotação por produtos. MelhorEnvioService usa fetch, OAuth2 e a tabela integration_credentials já existente, com AES-256-GCM e renovação diária. A conexão inicial é um comando local; o admin ainda pertence à Fase 8.

**Tech Stack:** NestJS, Prisma/Postgres, Zod, node:crypto, fetch e node:test; nenhuma dependência nova.

**Spec:** [Arquitetura aprovada, seções 6–9](../../ARCHITECTURE.md), Fase 7 de prompt.md e autorização do usuário nesta sessão.

## Global Constraints

- Dinheiro em centavos; CEP, peso, dimensões, preços e quantidades validados no servidor.
- Tokens somente na API, cifrados no banco; ambientes separados; escopo shipping-calculate.
- Frete grátis desligado por padrão; quando ativado, zera só a opção mais barata após cupom.
- Timeout de 4 s, cache de 60 s limitado a 200 consultas; checkout recota sem cache.
- Limite local de 30 consultas/minuto/IP nos dois endpoints públicos, usando o IP da conexão.
- Sem compra de etiquetas, rastreio, contas criadas automaticamente ou instalação de dependências.

## Review Focus

- Respostas parciais ou inválidas não podem gerar frete zero.
- Falha externa mantém as tarifas por UF; serviço que desapareceu impede criar pedido com aquela opção.
- Cache distingue CEP de origem/destino, quantidade, preço e dimensões; não altera descontos por referência.
- Renovação concorrente não perde refresh tokens; segredos não vão ao browser ou aos logs.
- Produto, sacola e pedido usam o mesmo caminho e valores do cadastro.

## Task 1 — Cotação e autenticação

- [x] Criar testes em apps/api/test/shipping.test.ts para custom_price/prazos, fallback, cache, recotação, OAuth/state, criptografia e renovação.
- [x] Rodar os testes e observar falha pela integração ausente.
- [x] Implementar apps/api/src/shipping/melhor-envio.service.ts e configuração em env.ts/.env.example, reutilizando integration_credentials.
- [x] Implementar conexão local em shipping/connect.ts e comando shipping:connect.

## Task 2 — Integrar os consumidores

- [x] Alterar ShippingService.quote para receber { postalCode, eligibleCents, items, forceFree?, fresh? }; buscar os produtos pelo variantId.
- [x] Atualizar ShippingController, CartService, OrdersService e as fixtures/testes existentes.
- [x] Passar a variante da página do produto em ShippingEstimate; manter contrato ShippingOption.
- [x] Proteger os dois endpoints de cotação com ShippingRateLimit.
- [x] Configurar origem 35045120 no banco local e documentar conexão/renovação/fallback em docs/SHIPPING.md.

## Task 3 — Verificação e revisão

- [x] Rodar testes da API e shared, typecheck, lint e build.
- [x] Conferir HTTP local e cotação por UF sem credenciais.
- [x] Solicitar revisão independente da integração e corrigir achados materiais.
- [x] Informar que cotações reais dependem de criar/autorizar o aplicativo; não declarar sandbox validado sem credenciais.

## Execution notes

- Escopo e abordagem já autorizados pela arquitetura e pelo pedido de iniciar a Fase 7; não reabrir aprovação do desenho.
- Trabalho no checkout atual para preservar a Fase 5 ainda sem commit e o servidor usado pelo usuário; sem worktree, commit ou push nesta execução.
- Usuário tem conta Melhor Envio e ainda não criou aplicativo. Não depende disso para implementar e testar localmente; autorização real fica para a conexão posterior.

## Verification ledger

- 52 testes passaram: 39 de API (13 de frete) e 13 de shared. Testes externos simulados; banco real exclusivo de teste.
- Build, TypeScript e lint passaram; HTTP da home, health e cota??o por UF responderam 200. O build gerou aviso de cache/link longo do Turbo no Windows, com sa?da 0.
- Revis?o independente: corrigida reutiliza??o de refresh token ap?s leitura atrasada e aplicado limite compartilhado tamb?m ao checkout. Ambos reproduzidos com testes falhando e depois passando.
- Decis?o: manter o limite pelo IP da conex?o no preview local. O proxy Next preserva X-Forwarded-For fornecido pelo cliente, portanto confiar nesse cabe?alho seria inseguro. Separar clientes reais fica para o ingresso Caddy da implanta??o.
- A busca com find-skills n?o encontrou skill espec?fica para Melhor Envio; nenhuma skill adicional instalada.
- Integra??o real aguarda cadastro/autoriza??o do aplicativo; n?o foi feita compra de frete nem teste real de cota??o nesta execu??o.
