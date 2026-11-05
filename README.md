# Aurevi: loja virtual

Loja própria de moda feminina. Decisões e fluxos em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requisitos

Node 24, pnpm 12 e Docker.

## Primeira execução

```sh
pnpm install
docker compose up -d
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm --filter @aurevi/shared build
pnpm --filter @aurevi/api db:migrate
pnpm --filter @aurevi/api db:seed
pnpm dev
```

Loja em <http://localhost:3000>. Verificação da API em <http://localhost:3000/api/health>.

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
