# Painel admin, Etapa 1 (base, login e pedidos) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o painel em `/admin` com login, troca de senha, menu, tela Início (opção B) e gestão de pedidos (lista, detalhe, status e rastreio).

**Architecture:** Rotas novas `/api/admin/*` na API NestJS, protegidas por sessão server-side (cookie HttpOnly + `AdminSession`), e telas novas em `/admin` no Next.js, em um route group próprio, sem o cabeçalho e o rodapé da loja. Os tipos de entrada e saída ficam em `packages/shared`.

**Tech Stack:** NestJS 12 (Express), Prisma 7 (`@prisma/adapter-pg`), Zod 4, argon2, `node:test` com tsx na API; Next 16, React 19, Tailwind 4 no web. Nenhuma dependência nova.

**Spec:** [docs/superpowers/specs/2026-11-06-admin-design.md](../specs/2026-11-06-admin-design.md), seções 5.1 a 5.3, 5.5, 5.14 e 6 (Etapa 1). Este é o primeiro de quatro planos; produtos/estoque, vendas e regras, e gestão têm planos próprios depois.

## Global Constraints

- Dinheiro em centavos (`formatBRL` de `@aurevi/shared` para exibir); fuso **America/Sao_Paulo (UTC-3 fixo, sem horário de verão)**; interface em português do Brasil, usável no celular.
- Toda entrada validada com Zod no servidor, via `parseOrBadRequest(schema, body)` (`apps/api/src/common/parse.ts`).
- Sessão: cookie `aurevi_admin`, `HttpOnly`, `SameSite=Lax`, `Secure` em produção, `path=/`; token aleatório de 32 bytes em base64url; só o **SHA-256** vai para `admin_sessions.token_hash`; validade de **7 dias**.
- Senha com argon2 (opções padrão, como no seed), **mínimo 10 caracteres**. Resposta de login igual para e-mail inexistente, senha errada e usuário inativo.
- Escritas (`POST`) em `/api/admin/*` exigem cabeçalho `Origin` dentro de `ADMIN_ALLOWED_ORIGINS` (lista separada por vírgulas; padrão `http://localhost:3000`).
- Login: no máximo **5 falhas por 15 minutos** por chave `ip|email`, em memória (uma instância da API).
- "Vendido" = soma de `totalCents` dos pedidos com status `paid`, `preparing`, `shipped` ou `delivered`, agrupados por `paidAt`. Semana = segunda 00:00 a domingo 23:59:59 (São Paulo); mês = mês civil; total = tudo.
- Estoque baixo = variante ativa com `stockOnHand - stockReserved <= 2`.
- Segredos nunca no navegador. Rotas `/admin` com `noindex` e sem cache.
- **Git:** executar em uma branch nova (`fase-8-admin`) a partir do estado commitado das Fases 5 e 7; não misturar com as mudanças ainda não commitadas dessas fases. Commits só com o ok da dona do projeto (ao fim de cada task, pedir confirmação ou agrupar).
- Skills a usar na execução: `superpowers:test-driven-development`, `superpowers:verification-before-completion`; para as telas, `ui-ux-pro-max` e `vercel-react-best-practices`.

## Review Focus

- Pedido pago às 01:30 UTC de uma segunda-feira (domingo 22:30 em São Paulo) conta na semana **anterior**; às 03:00 UTC, na semana atual.
- Sessão expirada, revogada (logout, troca de senha) ou de usuário desativado é recusada na hora.
- `POST` sem `Origin`, ou com `Origin` fora da lista, é recusado com 403 e não executa nada.
- Troca de senha encerra as **outras** sessões e mantém a atual.
- Marcar como enviado um pedido não pago, cancelado ou reembolsado é recusado; clicar duas vezes na mesma transição não duplica o rastreio nem muda nada.
- Busca por texto com `%`, `_`, aspas ou texto muito longo não quebra nem vaza resultados; página fora do intervalo devolve lista vazia, não erro.
- A lista de pedidos não traz CPF, telefone nem endereço (só número, nome, total, status, data).

---

## Estrutura de arquivos

- `packages/shared/src/admin.ts` (novo): schemas Zod e tipos do admin (login, senha, filtros de pedido, status, dashboard).
- `apps/api/src/admin/admin-auth.service.ts` (novo): login, logout, validação de sessão, troca de senha.
- `apps/api/src/admin/admin-auth.guard.ts` (novo): `AdminSessionGuard` e `AdminOriginGuard`.
- `apps/api/src/admin/login-rate-limit.ts` (novo): limite de tentativas de login.
- `apps/api/src/admin/admin.cookie.ts` (novo): ler, gravar e limpar o cookie.
- `apps/api/src/admin/admin-auth.controller.ts` (novo): `/api/admin/auth/*`.
- `apps/api/src/admin/dashboard.service.ts` e `dashboard.controller.ts` (novos).
- `apps/api/src/admin/admin-orders.service.ts` e `admin-orders.controller.ts` (novos).
- `apps/api/src/app.module.ts`, `env.ts`, `.env.example` (alterados).
- `apps/api/test/admin-auth.test.ts`, `admin-dashboard.test.ts`, `admin-orders.test.ts` (novos).
- `apps/web/src/app/layout.tsx` (reduzido a html/body/fontes), `apps/web/src/app/(loja)/layout.tsx` (novo, com o que sai do raiz) e as pastas da loja movidas para `(loja)/` (URLs não mudam).
- `apps/web/src/app/admin/...`, `apps/web/src/components/admin/*`, `apps/web/src/lib/admin-api.ts`, `apps/web/src/proxy.ts` (novos).

---

### Task 1: Tipos e schemas compartilhados

**Files:**
- Create: `packages/shared/src/admin.ts`, `packages/shared/src/admin.test.ts`
- Modify: `packages/shared/src/index.ts` (reexportar)

**Interfaces:**
- Produces (todos exportados de `@aurevi/shared`):
  - `adminLoginSchema` = `{ email: string (e-mail, minúsculo, trim), password: string (1..200) }`
  - `adminPasswordChangeSchema` = `{ currentPassword: string, newPassword: string (10..200) }`
  - `adminOrderListQuerySchema` = `{ status?: OrderStatus, from?: string (AAAA-MM-DD), to?: string (AAAA-MM-DD), q?: string (trim, max 80), page: number (padrão 1, min 1) }`
  - `adminOrderStatusSchema` = `{ status: 'preparing' | 'shipped' | 'delivered', carrier?: string (max 60), trackingCode?: string (1..60) }` com regra: `shipped` exige `trackingCode`.
  - `adminTransitions: Record<OrderStatus, OrderStatus[]>` com `paid → [preparing, shipped]`, `preparing → [shipped]`, `shipped → [delivered]`, demais `[]`.
  - Tipos `AdminProfile {id; email}`, `AdminOrderListItem {number; customerName; totalCents; status; createdAt; paidAt}`, `AdminOrderList {items; page; pageSize; total}`, `AdminOrderDetail`, `AdminDashboard {weekCents; monthCents; totalCents; toShipCount; pendingPaymentCount; lowStockCount}`.

- [ ] **Step 1: Write the failing test** em `admin.test.ts` (mesmo estilo de `checkout.test.ts`): senha de 9 caracteres falha e de 10 passa; `adminOrderStatusSchema` rejeita `{status:'shipped'}` sem `trackingCode` e aceita com ele; `page` ausente vira 1; `adminTransitions.canceled` é `[]` e `adminTransitions.paid` contém `shipped`.
- [ ] **Step 2: Run** `pnpm --filter @aurevi/shared test` — esperado: FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `admin.ts` com os schemas e tipos acima e reexportar em `index.ts`. `OrderStatus` já vem de `index.ts`.
- [ ] **Step 4: Run** `pnpm --filter @aurevi/shared test && pnpm --filter @aurevi/shared build` — esperado: PASS (o pacote aponta para `dist/`, então o build é obrigatório antes da API e do web usarem os tipos).

---

### Task 2: Serviço de autenticação, guards e limite de login (API)

**Files:**
- Create: `apps/api/src/admin/admin-auth.service.ts`, `admin-auth.guard.ts`, `login-rate-limit.ts`, `admin.cookie.ts`
- Modify: `apps/api/src/env.ts`, `apps/api/.env.example` (nova chave `ADMIN_ALLOWED_ORIGINS`, opcional, padrão `http://localhost:3000`)
- Test: `apps/api/test/admin-auth.test.ts`

**Interfaces:**
- Consumes: `adminLoginSchema`, `adminPasswordChangeSchema`, `AdminProfile` (Task 1); `PrismaService` como nos outros services.
- Produces:
  - `AdminAuthService.login(email: string, password: string): Promise<{ token: string; expiresAt: Date; admin: AdminProfile } | null>` (`null` em qualquer falha; executa uma verificação argon2 contra um hash falso quando o e-mail não existe, para o tempo de resposta ser parecido).
  - `AdminAuthService.authenticate(token: string): Promise<AdminProfile | null>` (recusa sessão expirada, inexistente ou de `isActive=false`).
  - `AdminAuthService.logout(token: string): Promise<void>`
  - `AdminAuthService.changePassword(adminId: string, currentPassword: string, newPassword: string, keepToken: string): Promise<boolean>` (`false` se a senha atual não confere; apaga todas as outras sessões do usuário).
  - `LoginRateLimit.hit(key: string, now?: number): boolean` e `LoginRateLimit.reset(key: string): void` (`hit` retorna `false` quando excedeu 5 falhas em 15 min; o chamador chama `hit` só em falha e `reset` em sucesso; mapa limitado a 5000 chaves).
  - `AdminSessionGuard` (`CanActivate`): lê o cookie, chama `authenticate`, grava `request.admin: AdminProfile`; 401 sem sessão válida.
  - `AdminOriginGuard` (`CanActivate`): passa direto em `GET/HEAD/OPTIONS`; nos demais métodos exige `Origin` em `ADMIN_ALLOWED_ORIGINS`, senão 403.
  - `readAdminToken(request): string | undefined`, `setAdminCookie(response, token, expiresAt): void`, `clearAdminCookie(response): void` em `admin.cookie.ts`, no estilo de `cart/cart.cookie.ts`.

- [ ] **Step 1: Write the failing tests** em `admin-auth.test.ts` (instanciar services direto, como `orders.test.ts`; `beforeEach` trunca `admin_sessions, admin_users CASCADE` e cria um admin com senha de teste): login correto devolve token e grava só o hash (o token em si não aparece em `admin_sessions`); e-mail inexistente, senha errada e `isActive=false` devolvem `null`; `authenticate` aceita o token, recusa depois de `expiresAt` passado (alterar a linha no banco), recusa após `logout`, e recusa se o usuário for desativado depois do login; `changePassword` com senha atual errada devolve `false`, com a certa troca o hash, mantém a sessão `keepToken` e apaga as outras; `LoginRateLimit`: a 6ª falha em 15 min retorna `false`, passada a janela libera, `reset` libera; guards (com contexto Express falso): `AdminOriginGuard` recusa `POST` sem `Origin` e com `Origin` estranho, aceita o permitido e deixa `GET` passar; `AdminSessionGuard` lança 401 sem cookie.
- [ ] **Step 2: Run** `pnpm --filter @aurevi/api exec node --import tsx --test --test-concurrency=1 test/admin-auth.test.ts` — esperado: FAIL.
- [ ] **Step 3: Implement** os quatro arquivos. Token: `randomBytes(32).toString('base64url')`; hash: `createHash('sha256')`. Argon2 com `argon2.verify`/`argon2.hash` padrão. Rate limit: `Map<string, {count, resetAt}>`, no estilo de `shipping/shipping-rate-limit.ts`, com comentário `// ponytail: em memória, uma instância; mover para o banco se a API escalar`.
- [ ] **Step 4: Run** o teste de novo — esperado: PASS. Depois `pnpm --filter @aurevi/api typecheck && pnpm --filter @aurevi/api lint`.

---

### Task 3: Controller de autenticação e registro no módulo (API)

**Files:**
- Create: `apps/api/src/admin/admin-auth.controller.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: tudo da Task 2, `parseOrBadRequest`.
- Produces (rotas, prefixo global `/api` já existe):
  - `POST /api/admin/auth/login` → 200 `{ admin: AdminProfile }` e cookie; 401 `{message:'E-mail ou senha incorretos.'}`; 429 quando `LoginRateLimit` bloquear. Chave: `${request.ip}|${email}`.
  - `POST /api/admin/auth/logout` → 204 e cookie limpo.
  - `GET /api/admin/auth/me` → 200 `{ admin }` (com `AdminSessionGuard`).
  - `POST /api/admin/auth/password` → 204; 400 `{message:'Senha atual incorreta.'}` quando `changePassword` devolver `false`.
  - `AdminOriginGuard` aplicado a todo o controller; `AdminSessionGuard` em tudo menos `login`.

- [ ] **Step 1: Write the failing test** em `admin-auth.test.ts`: chamar os métodos do controller diretamente com `request`/`response` falsos (objetos mínimos com `headers`, `ip`, `cookie`/`clearCookie` espiados): login certo chama `setAdminCookie` com `httpOnly`; login errado lança `UnauthorizedException`; a 6ª tentativa errada lança `HttpException` 429; senha atual errada em `password` lança `BadRequestException`.
- [ ] **Step 2: Run** o arquivo de teste — esperado: FAIL.
- [ ] **Step 3: Implement** o controller fino (validação com Zod, sem regra de negócio) e registrar controller, `AdminAuthService`, `LoginRateLimit` e os guards em `app.module.ts`, seguindo o padrão dos outros.
- [ ] **Step 4: Run** testes, typecheck e lint da API — esperado: PASS. Subir a API (`pnpm --filter @aurevi/api dev`) com o admin do seed (`pnpm --filter @aurevi/api db:seed`) e conferir com `curl -i -X POST localhost:4000/api/admin/auth/login -H "Origin: http://localhost:3000" -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'`: esperado 200 com `Set-Cookie: aurevi_admin=...; HttpOnly`.

---

### Task 4: Dashboard (API)

**Files:**
- Create: `apps/api/src/admin/dashboard.service.ts`, `apps/api/src/admin/dashboard.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/admin-dashboard.test.ts`

**Interfaces:**
- Consumes: `AdminDashboard` (Task 1), `AdminSessionGuard`.
- Produces:
  - `salesPeriods(now: Date): { weekStart: Date; monthStart: Date }` (função pura exportada de `dashboard.service.ts`, datas em UTC já convertidas do fuso UTC-3).
  - `DashboardService.get(now?: Date): Promise<AdminDashboard>`.
  - `GET /api/admin/dashboard` → `AdminDashboard`.
  - `toShipCount` = pedidos `paid` + `preparing`; `pendingPaymentCount` = `pending_payment`; `lowStockCount` pela regra das restrições globais (usar `$queryRaw`, pois o Prisma não compara colunas com aritmética).

- [ ] **Step 1: Write the failing tests**: `salesPeriods` com `2026-11-09T01:30:00Z` (domingo 22:30 em SP) devolve semana começando em `2026-11-02T03:00:00Z`; com `2026-11-09T03:00:00Z` devolve `2026-11-09T03:00:00Z`; mês começa em `2026-11-01T03:00:00Z`. Com pedidos criados no banco (`paid`, `shipped`, `canceled`, `refunded`, `pending_payment`, um pago na semana passada): `weekCents`, `monthCents`, `totalCents` somam só os status válidos e as datas certas; contagens batem; variante com `stockOnHand 5, stockReserved 3` conta como estoque baixo e `5/2` não.
- [ ] **Step 2: Run** o arquivo — esperado: FAIL.
- [ ] **Step 3: Implement** serviço e controller; somas com `order.aggregate` filtrando por status e `paidAt >= início`.
- [ ] **Step 4: Run** testes, typecheck, lint — esperado: PASS.

---

### Task 5: Pedidos do admin (API)

**Files:**
- Create: `apps/api/src/admin/admin-orders.service.ts`, `apps/api/src/admin/admin-orders.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/admin-orders.test.ts`

**Interfaces:**
- Consumes: `adminOrderListQuerySchema`, `adminOrderStatusSchema`, `adminTransitions`, `AdminOrderList`, `AdminOrderDetail` (Task 1).
- Produces:
  - `AdminOrdersService.list(query: AdminOrderListQuery): Promise<AdminOrderList>` — 20 por página, mais recentes primeiro; `q` casa número exato, nome ou e-mail do cliente (`contains`, sem curingas do usuário); `from`/`to` pela data de criação no fuso de São Paulo.
  - `AdminOrdersService.detail(number: number): Promise<AdminOrderDetail | null>` — itens, `customerSnapshot`, `shippingAddress`, `shippingMethod`, totais, pagamentos, `Shipment`, `reviewReason`, `notes`.
  - `AdminOrdersService.changeStatus(number: number, input: AdminOrderStatusInput, adminId: string): Promise<'ok' | 'not_found' | 'invalid_transition'>` — transição condicional com `updateMany({ where: { id, status: <atual> } })` como em `orders.service.ts`; ao enviar, cria ou atualiza o `Shipment` do pedido (`carrier`, `trackingCode`, `shippedAt`); ao entregar, preenche `deliveredAt`. Repetir a mesma transição devolve `'invalid_transition'` sem efeitos.
  - Rotas: `GET /api/admin/orders`, `GET /api/admin/orders/:number` (404 se `null`), `POST /api/admin/orders/:number/status` (409 em `invalid_transition`), todas com os guards da Task 2.

- [ ] **Step 1: Write the failing tests**: `list` filtra por status, por intervalo de datas, por `q` (número, nome, e-mail) e pagina (página 99 devolve `items: []`); `q` com `%` e `_` não casa tudo; a lista não contém CPF, telefone nem endereço (checar as chaves do item); `changeStatus` leva `paid → preparing → shipped (com trackingCode) → delivered` e grava `Shipment` com `shippedAt` e `deliveredAt`; recusa `pending_payment → shipped`, `canceled → shipped`, `refunded → delivered` e `paid → delivered`; repetir `shipped` devolve `'invalid_transition'` e não muda o `trackingCode`.
- [ ] **Step 2: Run** o arquivo — esperado: FAIL. Adicionar `payments, shipments` ao `TRUNCATE` do `beforeEach` desse arquivo, além de `admin_*`.
- [ ] **Step 3: Implement** serviço e controller (controller fino; erros de domínio viram `NotFoundException`/`ConflictException`).
- [ ] **Step 4: Run** `pnpm --filter @aurevi/api test && pnpm --filter @aurevi/api typecheck && pnpm --filter @aurevi/api lint` — esperado: PASS em tudo, incluindo os testes antigos.

---

### Task 6: Estrutura do web e login

**Files:**
- Modify: `apps/web/src/app/layout.tsx` (fica só `<html>`, `<body>`, fontes, `metadata`, `viewport`); `apps/web/next.config.ts` (cabeçalhos `X-Robots-Tag: noindex` e `Cache-Control: no-store` para `/admin/:path*`)
- Create: `apps/web/src/app/(loja)/layout.tsx` (move o `connection()`, `apiGet('catalog/layout')`, `CartProvider`, `SiteHeader`, `<main>`, `SiteFooter`, `CartDrawer`); mover as rotas da loja (`page.tsx` da home, `categoria`, `novidades`, `pedido`, `produto`, `checkout` e demais páginas existentes) para dentro de `(loja)/`; manter `robots.ts`, `sitemap.ts` e `internal/` na raiz de `app/`
- Create: `apps/web/src/lib/admin-api.ts`, `apps/web/src/proxy.ts`, `apps/web/src/app/admin/layout.tsx`, `apps/web/src/app/admin/login/page.tsx`, `apps/web/src/components/admin/login-form.tsx`

**Interfaces:**
- Consumes: rotas `/api/admin/auth/*` (Task 3).
- Produces:
  - `adminGet<T>(path: string): Promise<T>` e `adminPost<T>(path: string, body: unknown): Promise<T>` em `admin-api.ts` (só no servidor): `fetch` com `cache: 'no-store'`, repassando o cookie `aurevi_admin` de `cookies()` e `Origin` igual a `NEXT_PUBLIC_SITE_URL`; em `401` chamam `redirect('/admin/login')`; em outros erros lançam `Error` com a mensagem da API.
  - `proxy.ts`: redireciona qualquer `/admin/*` (menos `/admin/login`) sem o cookie `aurevi_admin` para `/admin/login`. É só atalho; a verificação real é a chamada à API.
  - `/admin/login`: formulário (cliente) que faz `POST /api/admin/auth/login` e, com sucesso, `router.replace('/admin')`; mostra a mensagem da API em português; `autocomplete` correto nos campos; botão desabilitado durante o envio.

- [ ] **Step 1: Mover a loja para `(loja)/` e conferir que nada mudou:** `pnpm --filter @aurevi/web typecheck && pnpm --filter @aurevi/web build` — esperado: PASS e as mesmas rotas no resumo do build.
- [ ] **Step 2: Implement** `admin-api.ts`, `proxy.ts`, o layout do admin (sem header/footer da loja, usando os tokens de `tokens.css`) e a página de login. Visual sóbrio com a identidade Aurevi (cores `--brand-*`, fontes Instrument Serif e DM Sans).
- [ ] **Step 3: Verify no navegador** (API e web rodando): `/admin` sem login redireciona a `/admin/login`; login errado mostra a mensagem; login certo cai em `/admin`; a home `/` continua com cabeçalho e rodapé; `curl -I localhost:3000/admin/login` mostra `x-robots-tag: noindex`. Fechar com `pnpm --filter @aurevi/web lint && typecheck`.

---

### Task 7: Menu, Início e troca de senha (web)

**Files:**
- Create: `apps/web/src/components/admin/admin-shell.tsx` (menu lateral no desktop e gaveta no celular), `apps/web/src/app/admin/(painel)/layout.tsx` (chama `adminGet('auth/me')`, renderiza o shell e traz o botão Sair), `apps/web/src/app/admin/(painel)/page.tsx` (Início), `apps/web/src/app/admin/(painel)/conta/senha/page.tsx` e `apps/web/src/components/admin/password-form.tsx`

**Interfaces:**
- Consumes: `AdminDashboard`, `GET /api/admin/dashboard`, `POST /api/admin/auth/password` e `/logout`, `formatBRL`.
- Produces:
  - Menu: Início, Pedidos, Produtos, Estoque, Clientes, Carrinhos abandonados, Cupons, Estatísticas, Configurações; só Início e Pedidos levam a telas reais nesta etapa. Os demais itens, e **Frete grátis, Promoções, Mensagens automáticas e Controle da loja**, aparecem apagados com a etiqueta "Em breve", sem link.
  - Início (opção B aprovada): três cartões lado a lado — **Esta semana** (destaque, borda mais forte, número maior), **Este mês**, **Total** — e abaixo "Para resolver agora" com três linhas que levam a `/admin/pedidos?status=paid`, `/admin/pedidos?status=pending_payment` (estoque baixo só mostra o número nesta etapa, sem link).
  - Troca de senha com os campos senha atual, nova e confirmação (a confirmação é só do formulário); mostra o erro da API.

- [ ] **Step 1: Implement** shell, Início e senha seguindo os desenhos aprovados no brainstorming (usar a skill `ui-ux-pro-max` para espaçamento, contraste e alvos de toque de 44px; layout testado em 390px e 1440px).
- [ ] **Step 2: Verify no navegador** com o admin do seed: os três cartões batem com os pedidos de teste criados direto no banco; "Em breve" não é clicável; sair leva ao login e `/admin` volta a redirecionar; trocar a senha e entrar com a nova funciona, a antiga não.
- [ ] **Step 3: Run** `pnpm --filter @aurevi/web typecheck && pnpm --filter @aurevi/web lint`.

---

### Task 8: Pedidos (web)

**Files:**
- Create: `apps/web/src/app/admin/(painel)/pedidos/page.tsx` (lista), `apps/web/src/app/admin/(painel)/pedidos/[number]/page.tsx` (detalhe), `apps/web/src/components/admin/order-filters.tsx`, `apps/web/src/components/admin/order-status-form.tsx`

**Interfaces:**
- Consumes: `AdminOrderList`, `AdminOrderDetail`, `adminTransitions`, rotas da Task 5.
- Produces:
  - Lista: filtros por status, período e busca (valores na URL como `searchParams`, para o link do Início funcionar), tabela no desktop e cartões no celular com número, nome, total, status (rótulo em português), data; paginação anterior/próxima; estado vazio com texto claro.
  - Detalhe: itens, cliente, endereço, frete, pagamento, rastreio, motivo de revisão e anotações; formulário de status que mostra só as transições de `adminTransitions[status]`; ao escolher "Enviado", pede o código de rastreio (obrigatório) e a transportadora (opcional); após salvar, `router.refresh()`; duplo clique não envia duas vezes (botão desabilitado); erro da API aparece na tela.

- [ ] **Step 1: Implement** lista e detalhe. Rótulos: pending_payment "Aguardando pagamento", paid "Pago", preparing "Em preparação", shipped "Enviado", delivered "Entregue", canceled "Cancelado", refunded "Reembolsado".
- [ ] **Step 2: Verify no navegador**: criar pedidos de teste (pelo checkout local ou direto no banco) e percorrer `Pago → Em preparação → Enviado (com rastreio) → Entregue`; conferir que um pedido aguardando pagamento não oferece "Enviado"; filtros e link do Início funcionam; telas legíveis em 390px.
- [ ] **Step 3: Run** `pnpm build && pnpm typecheck && pnpm lint && pnpm test` na raiz — esperado: tudo PASS.

---

### Task 9: Documentação e verificação final

**Files:**
- Modify: `docs/ARCHITECTURE.md` (seção do admin: rotas `/api/admin/*`, sessão, Origin, limite de login e a pendência de IP real), `README.md` (como criar o admin e entrar), `apps/api/.env.example`, `apps/web/.env.example` se surgir variável

- [ ] **Step 1:** Registrar a **pendência de produção**: a API não confia em proxy nem lê `CF-Connecting-IP`, então o limite de login por IP não distingue clientes atrás da Cloudflare; resolver junto do `trust proxy` antes de abrir o painel à internet.
- [ ] **Step 2:** Rodar a verificação completa (`superpowers:verification-before-completion`): `pnpm build && pnpm typecheck && pnpm lint && pnpm test`, mais o percurso manual das Tasks 6 a 8 em 390px e 1440px; anotar no PR/resumo o que foi verificado e o que não foi.
- [ ] **Step 3:** Pedir à dona do projeto o ok para commitar a etapa (mensagem sugerida: `feat: admin panel base, login and orders`).

---

## Autoavaliação do plano

- **Cobertura da spec (Etapa 1):** login e sessão (Tasks 2 e 3), troca de senha (2, 3 e 7), estrutura e menu com "Em breve" (7), Início opção B (4 e 7), pedidos com filtros, detalhe, status e rastreio (5 e 8). Fora desta etapa por decisão: produtos, estoque, cupons, configurações, pedido manual, reembolso, clientes, carrinhos, estatísticas e importação (planos 2 a 4).
- **Consistência de nomes:** `AdminProfile`, `AdminDashboard`, `AdminOrderList`, `AdminOrderDetail`, `adminTransitions`, `AdminAuthService`, `LoginRateLimit`, `AdminSessionGuard`, `AdminOriginGuard` definidos na Task 1 ou 2 e usados com os mesmos nomes depois.
- **Lacunas conhecidas do código atual, tratadas no plano:** sem `ValidationPipe` (usa `parseOrBadRequest`), sem `cookie-parser` (cookie lido como em `cart.cookie.ts`), sem script de teste no web (verificação por typecheck, build e navegador), `TRUNCATE` dos testes sem tabelas do admin (incluído nas Tasks 2 e 5), sem IP real atrás da Cloudflare (pendência registrada na Task 9).
