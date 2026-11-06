# Painel administrativo da Aurevi (Fase 8) — design

Data: 2026-11-06. Estado: rascunho para aprovação da dona do projeto.

Legenda: **[decidido]** foi dito pela dona do projeto; **[minha escolha]** foi decidido por quem escreveu este documento, para ela conferir; **[deixado ao construtor]** pode ser resolvido no plano.

## 1. Intenção

A Aurevi é uma loja de moda pequena, com a vitrine, o carrinho, o checkout, a reserva de estoque, o pagamento (Mercado Pago) e o frete (Melhor Envio) já construídos. Hoje não existe nenhum jeito de operar a loja sem mexer no banco de dados: não há como cadastrar produto, ver pedido, ajustar estoque ou criar cupom.

O painel admin é a ferramenta do dia a dia da dona da loja. O critério de sucesso é ela conseguir, sem ajuda técnica: cadastrar e manter o catálogo, acompanhar e despachar pedidos, saber quanto vendeu, e registrar vendas fechadas fora do site.

**Referência visual [decidido]:** ela gosta do painel da Nuvemshop e quer inspiração nele. Inspiração significa organização do menu, densidade das telas e fluxos (lista, filtro, detalhe), nunca cópia de marca, textos, ícones ou imagens. As capturas da pesquisa estão fora do repositório, em uma pasta temporária, e podem sumir; este documento descreve o que importa.

## 2. Objetivos, não objetivos e anti-objetivos

**Objetivos**
- Login seguro para a dona da loja.
- Tela Início com os números de venda e o que precisa de ação.
- Gestão de pedidos, incluindo criar pedido manual e reembolsar pedido (no painel e no Mercado Pago).
- Gestão de produtos (com variações e fotos), estoque, cupons, clientes e carrinhos abandonados, estatísticas, configurações da loja, e exportar/importar produtos.

**Não objetivos desta fase [decidido]**
- Mensagens automáticas (e-mails de pedido, lembrete de carrinho): ficam para a Fase 9 ou depois.
- Frete grátis e promoções como telas próprias: as regras atuais continuam funcionando pelas configurações já existentes; só não há tela dedicada.
- Controle de loja (mensagem para clientes, página em construção, redirecionamentos): depois que a loja estiver em funcionamento.
- Enviar lembrete de carrinho abandonado [minha escolha]: depende de e-mail/WhatsApp; a lista basta.
- Vários usuários com perfis de acesso, compra de etiqueta de frete, domínio personalizado, multi-idioma, assinaturas, atacado, blog, ponto de venda.

**Anti-objetivos**
- Qualquer ação do painel que quebre o estoque ou os valores já consistentes do checkout, mesmo que "funcione" na tela.
- Segredos (tokens do Mercado Pago e Melhor Envio) aparecendo no navegador ou no painel.
- Um painel que pareça uma cópia da Nuvemshop.

## 3. Restrições

- Monorepo existente: `apps/api` (NestJS + Prisma + Postgres), `apps/web` (Next.js), `packages/shared` (Zod e tipos). Reaproveitar o que existe; nenhuma dependência nova sem necessidade.
- Dinheiro em centavos; toda entrada validada com Zod no servidor.
- Toda mudança de estoque passa pelo `StockService` e gera `stock_movements` (já existe o campo `adminUserId` para auditoria).
- A segurança do admin segue `docs/ARCHITECTURE.md` §10: cookie HttpOnly, Secure e SameSite=Lax, senha com argon2, limite de tentativas no login, checagem de Origin nas escritas.
- Uma instância da API (jobs em instância única, como na arquitetura atual).
- Interface em português do Brasil, usável no celular (a dona provavelmente abrirá pedidos pelo telefone) [minha escolha].

## 4. Situação atual (levantada no código)

- `AdminUser` e `AdminSession` existem no schema e o seed cria o primeiro admin. **Não existe** módulo de login, guard ou sessão na API.
- `ProductImage` guarda uma `storageKey`; a URL é montada no web (`NEXT_PUBLIC_IMAGE_BASE_URL`). **Não existe** upload nem storage. A arquitetura prevê R2 em produção e pasta local em desenvolvimento.
- `Setting` já tem chaves validadas em `packages/shared/src/settings.ts`: parcelas sem juros, mínimo por parcela, desconto Pix, limite de frete grátis, frete fixo por UF, origem do frete, mensagens de aviso, destaques da home e dados da loja.
- O web já tem a rota interna de revalidação de cache (`/internal/revalidate`, com segredo); nada na API a chama ainda. Ao mudar produto, categoria ou configuração, o painel precisa disparar essa revalidação.
- `OrdersService.createFromCart` cria pedidos a partir de um carrinho; não há criação a partir de linhas soltas. `Order` não tem campo de origem/canal de venda.
- Rastreio fica em `Shipment` (transportadora, serviço, código, datas).

## 5. Decisões

### 5.1 Onde mora o painel [minha escolha]
Dentro do mesmo site Next.js, em `/admin`, com login próprio, falando com rotas protegidas novas da API (`/api/admin/*`). Evita um segundo app para hospedar e mantém os tipos compartilhados. Rotas do admin ficam fora de indexação (robots) e fora do cache público.

### 5.2 Menu
Início, Pedidos, Produtos, Estoque, Clientes, Carrinhos abandonados, Cupons, Estatísticas, Configurações. Ao final, **itens apagados marcados "Em breve" [decidido]**: Frete grátis, Promoções, Mensagens automáticas, Controle da loja. Eles não abrem tela funcional; servem de lembrete.

### 5.3 Início [decidido: opção B]
Três cartões lado a lado: **Esta semana** em destaque, **Este mês** e **Total desde o início**. Abaixo, uma lista "Para resolver agora": pedidos pagos aguardando envio, pedidos aguardando pagamento (Pix), produtos com estoque baixo [minha escolha para os três itens; o limite de "estoque baixo" é do construtor].

Definições [minha escolha, confirmar]:
- "Vendido" = soma de `totalCents` dos pedidos que chegaram a **pago** (`paid`, `preparing`, `shipped`, `delivered`), excluindo `canceled` e `refunded`, agrupados pela data de pagamento (`paidAt`).
- Semana = segunda a domingo; mês = mês civil; fuso America/Sao_Paulo. "Total" = desde o primeiro pedido pago.
- Pedido manual conta como venda quando marcado como pago.

### 5.4 Estatísticas
Página própria com, no mínimo, vendido por período e por dia, número de pedidos e ticket médio. **Produtos mais vendidos e cupons usados** são minha sugestão, de baixo custo [minha escolha]. Visitas e tempo real **não entram** (não há coleta de visitas).

### 5.5 Pedidos
Lista com filtros (status, período, busca por número, nome ou e-mail), detalhe (itens, cliente, endereço, pagamento, frete, histórico), mudança de status e código de rastreio. Transições de status seguem as regras que já existem (`markPaid`, cancelamentos) e acrescentam as que faltam (`preparing`, `shipped`, `delivered`); o painel não pode, por exemplo, marcar como enviado um pedido que não foi pago [minha escolha].

**Reembolso [decidido que fica no painel]:** pedido pago tem um botão **Reembolsar**. Em um pedido do site, ele pede o reembolso ao Mercado Pago pela API (com chave de idempotência), e só depois de o Mercado Pago confirmar marca o pedido como `refunded`, registra o pagamento como reembolsado e devolve as peças ao estoque (`StockMovementType.return`). Em um pedido manual, que não passou pelo Mercado Pago, o botão só marca como `refunded` e devolve ao estoque; o dinheiro é devolvido por fora. Detalhes [minha escolha, confirmar]:
- **Reembolso total apenas.** Reembolso parcial fica fora desta fase.
- Pede confirmação antes de executar, mostrando valor e forma de pagamento; o botão fica desabilitado enquanto a chamada está em andamento, e repetir o clique nunca gera dois reembolsos.
- Se o Mercado Pago recusar ou não responder, o pedido **não** muda de status, e a tela mostra o motivo em português. O webhook do Mercado Pago que informar o reembolso deve ser tratado de forma idempotente: se o painel já reembolsou, nada acontece em dobro, e se o reembolso foi feito fora do painel (no site do Mercado Pago), o pedido também passa a `refunded` e devolve o estoque uma única vez.
- Pedido enviado ou entregue pode ser reembolsado; a devolução ao estoque só acontece quando a dona confirmar que a peça voltou (opção na própria confirmação) [minha escolha].
- Registra quem reembolsou (`adminUserId`) e quando.
- O token do Mercado Pago continua só na API.

### 5.6 Pedido manual [decidido que entra]
Para vendas fechadas pelo WhatsApp ou Instagram. A dona escolhe cliente (existente ou novo), itens (variação e quantidade), frete (valor informado ou cotado) e a forma de pagamento recebida fora do site (Pix direto, dinheiro, outro).

**Decidido pela dona:**
- O pedido manual **pode ficar aguardando pagamento** ou já nascer pago.
- Só o **nome e um contato** (WhatsApp ou e-mail) são obrigatórios no cliente; o **endereço é opcional** (retirada ou entrega em mãos).

**Minha escolha:**
- Aguardando pagamento reserva o estoque por um prazo escolhido na criação (padrão sugerido: 24 horas) e, vencido o prazo, é cancelado pelo job existente como os pedidos do site, liberando a reserva. Marcar como pago antes disso baixa o estoque de imediato.
- Cria um método novo no `OrdersService` que recebe linhas em vez de carrinho, reaproveitando a transação, `StockService.reserve`/`commitSale` e os cálculos de preço do servidor; registra o `adminUserId` nas movimentações.
- A forma de pagamento recebida vira um registro de pagamento com provedor "manual" (novos valores em `PaymentMethod` e `provider`), para o pedido, o reembolso e as estatísticas tratarem tudo igual.
- Novo campo de **origem da venda** em `Order` (site, WhatsApp, Instagram, outro) via migração; pedidos existentes ficam como "site".
- Cliente sem e-mail: como `Customer.email` é obrigatório e único hoje, o construtor decide a modelagem (e-mail opcional ou chave alternativa), sem usar e-mail inventado. O link público de acompanhamento (`/pedido/[token]`) só é gerado e mostrado quando houver e-mail.
- Um pedido manual pago entra nos números do Início; não passa pelo Mercado Pago.

### 5.7 Produtos
Cadastro com nome, descrição, categoria, status (`ProductStatus`), opções e variações (tamanho, cor), preço, SKU, peso e dimensões (necessários para o frete), composição, tabela de medidas e dados da modelo (campos já previstos), e fotos. **Upload de imagens [minha escolha]:** a API recebe o arquivo, valida tipo e tamanho, gera a `storageKey` e grava em pasta local no desenvolvimento e em R2 em produção, atrás de uma interface simples de storage; reordenar fotos e associar foto a uma cor (já suportado por `optionValueId`).
Mudanças disparam a revalidação do cache da vitrine.

### 5.8 Estoque
Tela por variação com quantidade em estoque, reservado e disponível; ajuste manual com motivo, sempre pelo `StockService`, e histórico de `stock_movements` com o usuário que fez o ajuste.

### 5.9 Cupons
Criar, editar, ativar/desativar e ver usos, sobre o modelo `Coupon` existente (percentual, valor fixo, frete grátis, pedido mínimo, validade, limite de usos).

### 5.10 Clientes
Lista com busca e detalhe com histórico de pedidos e total gasto [minha escolha]. Somente leitura nesta fase, mais um botão para criar cliente no fluxo do pedido manual. Dados pessoais (CPF, telefone) só aparecem no detalhe, não na lista [minha escolha, por LGPD].

### 5.11 Carrinhos abandonados
Lista somente de leitura, sem envio de lembrete. Dois grupos [decidido: seguir a sugestão]:
- **Pedidos criados no checkout e nunca pagos** (cancelados ou expirados), que têm nome e contato.
- **Carrinhos parados com itens**, com idade e valor, quase sempre anônimos.

Não muda o checkout para capturar o e-mail mais cedo: isso fica para depois, porque altera a vitrine. Como o job existente apaga carrinhos expirados, a lista mostra só os que ainda existem; guardar histórico é decisão do construtor.

### 5.12 Exportar e importar produtos [decidido que entra]
Exportar para planilha (CSV) com os campos do cadastro, uma linha por variação [minha escolha]. Importar valida cada linha com os mesmos schemas Zod do cadastro, mostra um resumo (criados, atualizados, com erro e o motivo) **antes** de aplicar, e nunca altera estoque sem passar pelo `StockService` [minha escolha]. O SKU da variação identifica a linha a atualizar; a importação **nunca apaga nem arquiva** o que ficou fora da planilha [minha escolha]. O formato exato é do construtor.

### 5.13 Configurações
Editar as chaves de `Setting` que já existem e são relevantes: parcelas sem juros e mínimo por parcela, desconto Pix, frete fixo por UF, limite de frete grátis e dados da loja. As chaves de aviso e destaques da home podem entrar junto, se baratas [deixado ao construtor]. Conexão com Melhor Envio e Mercado Pago **não** é editada aqui (segredos ficam em variáveis de ambiente e no comando `shipping:connect`).

### 5.14 Login e sessão
Login por e-mail e senha para o `AdminUser` existente; sessão em `AdminSession` com cookie HttpOnly; logout; expiração; limite de tentativas. Um único usuário por ora, com tela para **trocar a senha** [minha escolha]. A recuperação de senha por e-mail fica para a Fase 9, quando houver envio de e-mail; até lá, uma senha esquecida é redefinida por quem tem acesso ao banco. Verificação em duas etapas fica como melhoria futura recomendada antes de abrir o painel para a internet [minha escolha].

## 6. Divisão sugerida em etapas [minha escolha]

Cada etapa deve funcionar sozinha antes da próxima.
1. **Base:** login, sessão, troca de senha, estrutura do painel (menu com itens "Em breve"), Início com os três números e Pedidos (lista, detalhe, status, rastreio).
2. **Catálogo:** Produtos (com variações e upload de fotos), Estoque, revalidação do cache.
3. **Vendas e regras:** Pedido manual (com a migração de origem), Reembolso, Cupons, Configurações.
4. **Gestão:** Clientes, Carrinhos abandonados, Estatísticas, Exportar/importar produtos.

## 7. Deixado ao construtor

Escolha de biblioteca de componentes e de gráficos (preferir o que o `apps/web` já usa), formato exato do CSV, limite de "estoque baixo", paginação e ordenação das listas, estrutura interna de módulos da API, estratégia de testes (com o Postgres de teste já usado pela API) e o desenho visual detalhado, respeitando a opção B do Início e a identidade da Aurevi.

## 8. Pendências fora deste documento

As Fases 5 (pagamento) e 7 (frete) ainda têm código sem commit e validações reais pendentes (webhook, Pix pago e expirado, parcelamento, cotações reais). O painel não depende delas para ser construído, mas o pedido manual e os números de venda devem ser conferidos com pedidos reais quando elas estiverem fechadas. O **reembolso** depende da Fase 5: ele só pode ser testado de ponta a ponta com as credenciais de teste do Mercado Pago e o webhook em um endereço público, que ainda não existe; até lá, é testado com o gateway simulado, como nos testes de pagamento atuais.
