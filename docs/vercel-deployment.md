# Vercel deployment

The application is one Next.js project on Vercel, backed by managed Postgres. The deployable pieces are:

1. **`web`** — Next.js UI and API routes. Project root: `app/`.
2. **`platform-db`** — Postgres for Better Auth and the `platform_state` JSONB document.
3. **`indexer`** — Vercel Cron calls `GET /api/platform/indexer/tick` every five minutes.
4. **`chain functions`** — Next.js serverless routes for launch, identity writes, merge proof, and private disclosure. These use the deployer/oracle keys and run with `maxDuration = 300`.
5. **`wasm`** — `app/wasm/bounty_board.wasm` and `app/wasm/sputnikdao2.wasm`, bundled into the functions with Next.js output file tracing.

The previous local JSON file is still supported through `PLATFORM_STORE=file`. The Docker/local default is `postgres` whenever `DATABASE_URL` exists; on first boot the app imports `/data/platform.json` into Postgres if the `platform_state` table is empty.

## 1. Create Postgres

Use Vercel Postgres, Neon, Supabase, or any pooled Postgres. Set `DATABASE_URL` to the pooled connection string. Better Auth and the platform JSONB state share the database.

Set `PLATFORM_PG_SSL=true` when the provider requires SSL and the URL does not already configure it.

## 2. Configure Vercel

- Import the repository.
- Set **Root Directory** to `app`.
- Framework preset: Next.js.
- Install command: `npm ci`.
- Build command: `npm run build`.

Add the variables from `app/.env.vercel.example`. At minimum:

- `DATABASE_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEAR_NETWORK`
- `PLATFORM_ROOT_ACCOUNT`
- `PLATFORM_DEPLOYER_ACCOUNT`
- `PLATFORM_DEPLOYER_PRIVATE_KEY`
- `PLATFORM_ORACLE_PUBLIC_KEY`
- `PLATFORM_ORACLE_PRIVATE_KEY`
- `CRON_SECRET`

Set the GitHub OAuth callback URL to:

```text
https://<your-domain>/api/auth/callback/github
```

## 3. Cron

`app/vercel.json` registers:

```json
{
  "crons": [
    { "path": "/api/platform/indexer/tick", "schedule": "0 0 * * *" }
  ]
}
```

Vercel sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set. The cron route also has a `maxDuration` of 300 seconds.

Vercel Hobby plans have limited cron frequency and function duration. Use Pro for five-minute indexing and long launches.

## 4. Database initialization

`app/src/instrumentation.ts` runs Better Auth migrations and creates the `platform_state` table on startup. It also imports `PLATFORM_DATA_FILE` when the table is empty and the file exists. On Vercel, the file does not exist, so the first launch creates the state.

To move an existing local installation, point `DATABASE_URL` at the target Postgres, keep `PLATFORM_DATA_FILE` pointing at the JSON file for the first local startup, then verify the state and remove the file path.

## 5. Long-running launch

`POST /api/platform/launch` performs GitHub admin verification, founder-derived funding checks, three NEAR account deployments, DAO setup, and policy transfer. It exports `maxDuration = 300`. If launches exceed the plan limit, move launch orchestration to a job runner while keeping the same service boundary.

## 6. Operational notes

- Use a pooled Postgres endpoint. Each serverless instance keeps a small `pg` pool (`PLATFORM_PG_POOL_MAX`, default 5).
- Use KMS-backed deployer/oracle signing before mainnet. Raw keys in Vercel environment variables are a local/testnet escape hatch.
- The indexer is state reconciliation over RPC, not an event stream. Keep the cron interval in mind when tuning freshness.
- Private security bounties are filtered from public APIs and pages; private issue pages require a linked maintainer or the credited researcher.
