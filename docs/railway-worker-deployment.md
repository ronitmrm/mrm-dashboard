# Railway worker deployment

## Contract

- GitHub deployment branch: `main`.
- Railway service type: private background worker; no domain or volume.
- Railway replicas: one.
- Neon database branch: `staging` in both production and development.
- PostgreSQL remains the durable queue. Redis remains disposable acceleration.

The free Railway plan is suitable for initial low-stakes operation, not an
availability guarantee. This repository uses `ON_FAILURE` with ten retries so
the configuration remains free-plan compatible. Move to Hobby and use an
unbounded `ALWAYS` restart policy when missed processing windows become
unacceptable. Durable PostgreSQL jobs remain available for later processing if
the worker is offline.

## Source-controlled gates

`.github/workflows/worker-ci.yml` runs on every push to `main`, every pull
request targeting `main`, and manual dispatch. It intentionally has no path
filter: Railway's **Wait for CI** gate must receive a conclusive workflow result
for every production commit. The job provisions disposable PostgreSQL 16 and
Redis 7 service containers for integration tests; they are not deployment
resources.

`railway.toml` selects Railpack, builds the runtime workspace and its local
dependencies, starts the continuous worker, disables application sleeping, and
limits the service to one replica. Zero deployment overlap reduces temporary
pressure on the Neon worker role's four-connection limit.

Railpack reads the exact pnpm version from the root `packageManager` field and
Node 22 from `.nvmrc`.

## One-time Railway setup

1. In Railway, create a project and choose **Deploy from GitHub repo**.
2. Select `ronitmrm/mrm-dashboard` and create one service named `worker`.
3. Set the service source branch to `main` and leave the root directory at the
   repository root.
4. Enable **Wait for CI** for the service.
5. Disable **Serverless**, keep one replica, and do not create a public domain,
   health check, cron schedule, or persistent volume.
6. Confirm Railway detects `/railway.toml` as the config-as-code file.

The native GitHub integration owns deployment authentication. Do not create a
GitHub `RAILWAY_TOKEN` secret for this flow.

## Railway production variables

Store these only in Railway's production environment:

| Variable                       | Value contract                                                  |
| ------------------------------ | --------------------------------------------------------------- |
| `MRM_MANAGED_RUNTIME`          | `1`                                                             |
| `WORKER_DATABASE_URL`          | Pooled Neon URL for the `staging` branch's worker login role    |
| `WORKER_LISTENER_DATABASE_URL` | Direct Neon URL for the same branch and role; no `-pooler` host |
| `WORKER_DATABASE_POOL_MAX`     | `2`                                                             |
| `UPSTASH_REDIS_REST_URL`       | Server-only HTTPS REST URL                                      |
| `UPSTASH_REDIS_REST_TOKEN`     | Server-only REST token                                          |

Optional tuning already has safe defaults:

| Variable                            | Default |
| ----------------------------------- | ------: |
| `REFRESH_WORKER_BATCH_SIZE`         |    `10` |
| `REFRESH_WORKER_SWEEP_MS`           | `30000` |
| `REFRESH_WORKER_MAX_RETRY_DELAY_MS` | `30000` |

Do not add `NEXT_PUBLIC_` prefixes. The Neon branch choice is encoded in both
connection URLs; there is no separate runtime branch variable. Railpack sets
`NODE_ENV=production` automatically.

## First deployment and verification

1. Merge or push the reviewed files to GitHub `main`.
2. Confirm the **Worker CI / Verify worker** check succeeds.
3. Confirm Railway starts deployment only after that check succeeds.
4. Inspect worker logs for a connected PostgreSQL listener and successful
   safety sweeps; secrets and connection strings must not appear in logs.
5. Trigger one reversible dashboard write and confirm its durable refresh job
   reaches a terminal state and the Upstash dashboard version advances.
6. Confirm Railway shows one continuously running replica and no public URL.

For rollback, redeploy the previous Railway deployment. Do not roll back or
delete PostgreSQL jobs: the durable queue is the recovery source.
