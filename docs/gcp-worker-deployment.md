# Temporary GCP worker deployment

The production worker runs in Cloud Run worker pool `mrm-worker`, in
`us-east5` (Columbus), under project `project-b3e69f72-3e13-4f13-98b`
(`oone-general`). It uses one instance with 2 vCPU and 4 GiB RAM.

## Existing services

Vercel, Neon, and Upstash keep their existing environment variables. Vercel
writes jobs to PostgreSQL; the worker listens to that queue and publishes
invalidations to the same Upstash database. There is no worker URL to configure
on the web service.

The worker uses Neon's `staging` branch in AWS Ohio. Its login role,
`mrmpl_staging_worker`, has a connection limit of 8 to allow temporary overlap
with Railway. Each process has a query pool capped at 2 and one direct listener
connection. Refresh job and outbox row locks coordinate concurrent workers.

Only the user pauses or resumes Railway. GCP deployments do not alter Railway.

## Runtime secrets

The dedicated runtime account is
`mrm-worker@project-b3e69f72-3e13-4f13-98b.iam.gserviceaccount.com`.
It can access these Secret Manager secrets:

| Environment variable           | Secret                             |
| ------------------------------ | ---------------------------------- |
| `WORKER_DATABASE_URL`          | `mrm-worker-database-url`          |
| `WORKER_LISTENER_DATABASE_URL` | `mrm-worker-listener-database-url` |
| `UPSTASH_REDIS_REST_URL`       | `mrm-worker-upstash-url`           |
| `UPSTASH_REDIS_REST_TOKEN`     | `mrm-worker-upstash-token`         |

The deployment uses secret version `1`. After rotating a value, update the
worker pool's reference to its new version. Keep `MRM_MANAGED_RUNTIME=1` and
`WORKER_DATABASE_POOL_MAX=2` in the worker configuration.

## GitHub deployment

`Worker CI` verifies pull requests to `staging` and `main`. After verification
succeeds on a push to `main`, including a merge from `staging`, it builds and
deploys the worker. To redeploy manually, select **Actions → Worker CI → Run
workflow → main**. Manual runs on other branches only run verification.

The workflow builds `packages/runtime/Dockerfile` using its restricted build
context. It retains `tsx`, runs the runtime dependency build, pushes an image
tagged with the commit SHA, then deploys its immutable digest. `GIT_COMMIT_SHA`
and a deployment-specific `REFRESH_WORKER_ID` identify the running revision.

GitHub authenticates through Workload Identity Federation. No GCP key or
database/Redis credential is stored in GitHub Actions. The provider accepts
only this repository's `worker-ci.yml` workflow on `main`. The dedicated
deployment account has access to the worker pool, its container repository,
and the runtime service account.

Configure these repository **variables**, not secrets:

| Variable                              | Value                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GCP_WORKER_DEPLOY_ENABLED`           | `true`                                                                                             |
| `GCP_WORKER_PROJECT_ID`               | `project-b3e69f72-3e13-4f13-98b`                                                                   |
| `GCP_WORKER_REGION`                   | `us-east5`                                                                                         |
| `GCP_WORKER_POOL`                     | `mrm-worker`                                                                                       |
| `GCP_WORKER_WIF_PROVIDER`             | `projects/185282230283/locations/global/workloadIdentityPools/mrm-github-actions/providers/github` |
| `GCP_WORKER_DEPLOYER_SERVICE_ACCOUNT` | `mrm-worker-deployer@project-b3e69f72-3e13-4f13-98b.iam.gserviceaccount.com`                       |

Deployment preserves the pool's existing instance count, CPU, memory, and
runtime secret references. A paused GCP pool stays paused after a code merge.
Main-branch runs are serialized so a newer merge cannot cancel a deployment
halfway through.

When returning to Railway, set `GCP_WORKER_DEPLOY_ENABLED=false` in repository
variables and scale the GCP pool to zero. CI will then skip GCP deployment,
so removing the temporary GCP resources will not block Railway's CI gate.

## Check or pause GCP

```sh
gcloud run worker-pools describe mrm-worker \
  --project=project-b3e69f72-3e13-4f13-98b --region=us-east5

gcloud run worker-pools update mrm-worker --instances=0 \
  --project=project-b3e69f72-3e13-4f13-98b --region=us-east5
```

Set `--instances=1` to resume it. Check the Cloud Run logs for a ready listener,
successful safety sweeps, and no pending or failed jobs. A deployment marked
ready does not by itself establish that application startup succeeded.
