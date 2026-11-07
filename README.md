# Aurevi: loja virtual

Loja própria de moda feminina. Decisões e fluxos em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Configuração e conexão do Melhor Envio em [docs/SHIPPING.md](docs/SHIPPING.md).

## Requisitos

Node 24, pnpm 12 e Docker.

## Primeira execução

```sh
pnpm install
docker compose up -d
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose exec -T postgres psql -U aurevi -d aurevi -c "CREATE DATABASE aurevi_test;"
pnpm --filter @aurevi/shared build
pnpm --filter @aurevi/api db:migrate
pnpm --filter @aurevi/api build
pnpm --filter @aurevi/api db:seed
pnpm dev
```

Loja em <http://localhost:3000>. Verificação da API em <http://localhost:3000/api/health>.

## Painel admin

Criar o primeiro admin, no banco local:

1. Em `apps/api/.env`, preencher `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`.
2. Rodar `pnpm --filter @aurevi/api db:seed`.

Entrar com a API (`pnpm --filter @aurevi/api dev`) e o web (`pnpm --filter @aurevi/web dev`) rodando, em <http://localhost:3000/admin/login>.

Senha esquecida: por enquanto, quem tem acesso ao banco redefine a senha. A recuperação por e-mail fica para a Fase 9.

## Comandos

| Comando          | Função                           |
| ---------------- | -------------------------------- |
| `pnpm dev`       | Web e API com recarga automática |
| `pnpm build`     | Build de produção                |
| `pnpm lint`      | ESLint                           |
| `pnpm typecheck` | TypeScript                       |
| `pnpm test`      | Testes                           |
| `pnpm format`    | Prettier                         |

O seed cria produtos fictícios. As credenciais de desenvolvimento ficam em `.env`, nunca no Git.
