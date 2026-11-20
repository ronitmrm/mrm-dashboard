# Releasing to production

The runbook an agent on the server PC follows when asked to deploy a release. A release is
a commit on `main`, deployed by `deploy.sh` with zero downtime (blue-green on ports 3001/3002;
see the header of `deploy.sh` for the mechanics).

Rules that apply throughout:

- Running `deploy.sh` is the only permitted way to change `~/srv`. A release request is
  permission for that. Do not edit, move, or delete anything in `~/srv` yourself.
- Never print secrets: read only variable *names* from `~/.config/mrm/*.env`.
- Production Postgres is read-only for agents; `deploy.sh` alone applies migrations.
- Never restart `mrm-caddy` or run `deploy/local/refresh-from-neon.sh`.
- Stop and ask the requester whenever a check below fails. Do not work around it.

## 1. The request

Have the requesting agent provide:

- the commit to release: a SHA on `main`, or `main` (resolve it to a SHA once, in step 2)
- the PRs it brings in, and whether they add migrations or new environment variables

## 2. Pre-checks

```bash
cd ~/Code/mrm && git fetch -q origin
target=$(git rev-parse origin/main)            # or the requested SHA
git merge-base --is-ancestor "$target" origin/main && echo "on main"
live=$(basename "$(readlink -f ~/srv/mrm-erp)")
port=$(sed -n 's/^to 127\.0\.0\.1://p' ~/srv/upstream.caddy)
echo "live $live on :$port"
```

All of these must hold before deploying:

1. **The target is on `main`** and differs from `$live`.
2. **Production is healthy now**: `systemctl --user is-active mrm-caddy mrm-web@$port mrm-worker@prod`
   prints `active` three times, and `curl -fsS http://127.0.0.1:$port/api/auth/ok` succeeds.
   If production is already unhealthy, report that instead of deploying over it.
3. **CI passed** on the PRs that brought the change to `main` (`gh pr view <n> --json statusCheckRollup`).
4. **The migrations are safe to run under the live release.** List them:
   `git diff --name-status "$live" "$target" -- packages/db/migrations`.
   Read each new file. The live release keeps serving after they run, so stop and ask if one:
   - drops or renames a table, column, view, or function
   - adds `NOT NULL` without a default to an existing table, or tightens a constraint that live code may break
   - rewrites or locks a large table (type changes, full-table `UPDATE`s, non-concurrent index builds on large tables)

   Edited (`M`) or deleted (`D`) migrations are never safe: stop.
5. **No new environment variable is missing.** This lists names that added lines read
   (`process.env.X`, `env.X`, or a quoted name such as `required("X")`) and that aren't configured:
   ```bash
   comm -23 \
     <(git diff "$live" "$target" -- apps packages ':!*.test.*' | grep '^+' \
         | grep -oE '(\benv\.[A-Z][A-Z0-9_]+|"[A-Z][A-Z0-9]*_[A-Z0-9_]+")' | tr -d '"' | sed 's/^env\.//' | sort -u) \
     <(grep -oE '^[A-Z0-9_]+' ~/.config/mrm/production.env | sort -u)
   ```
   Check each printed name in the diff. One the release needs at runtime and that has no default
   must be added to `production.env` by the human first. Agents never invent values.
6. **Resources**: `df -h ~` shows at least 5 GB free and `free -g` at least 4 GB available (the build needs about 3 GB).

## 3. Deploy

Run the script from `main`, not from this checkout's working tree (it may hold unreleased work):

```bash
mkdir -p ~/.local/state/mrm/deploys
log=~/.local/state/mrm/deploys/$(date -u +%Y%m%dT%H%M%SZ)-${target:0:8}.log
bash <(git show origin/main:deploy/local/deploy.sh) "$target" 2>&1 | tee "$log"
```

Pass the SHA, not `main`, so a push during the deploy can't change what is released. A build
takes 1–3 minutes. Redeploying one of the 3 newest releases skips the build.

How it ends:

| Output | Meaning | Next |
|---|---|---|
| `Deployed <sha> on :<port>.` | Live on the new port | Step 4 |
| `Already running <sha>.` | Nothing changed | Report it |
| `Another deploy is running.` | A deploy holds the lock | Wait for it; never delete the lock file |
| Fails before `==> Promoting` | The live release kept serving. Migrations that already ran stay applied | Report the log tail; do not retry until the cause is understood |
| Fails after `==> Promoting` | The new release is live, but the worker restart or the drain didn't finish | Finish by hand (below), then step 4 |

Finishing a deploy that failed after promotion (`$old` is the previous port, `$port` the new one):

```bash
systemctl --user restart mrm-worker@prod
systemctl --user disable --now mrm-web@$old
```

## 4. Verify

```bash
port=$(sed -n 's/^to 127\.0\.0\.1://p' ~/srv/upstream.caddy)
systemctl --user is-active mrm-caddy mrm-web@$port mrm-worker@prod   # active ×3
systemctl --user is-active mrm-web@3001 mrm-web@3002                 # exactly one active
curl -fsS --resolve erp.mayankrawmint.com:9443:127.0.0.1 \
  https://erp.mayankrawmint.com:9443/sign-in | grep -o 'data-dpl-id="[^"]*"'   # first 12 of $target
journalctl --user -u mrm-web@$port -u mrm-worker@prod --since "-10 min" -p err --no-pager
```

The last command should print no new errors. If it shows a spike of errors, or users report
breakage, roll back.

## 5. Report back

Send the requester: the SHA released and the SHA it replaced, the live port, the migrations
applied (file names), the pre-deploy snapshot name (`~/srv/backups/database/*-pre-deploy-<sha8>.dump`),
the verification results, and the log path.

## Rollback

Code rollback is a deploy of the previous SHA. It takes about 15 s while that release is
among the 3 newest:

```bash
bash <(git show origin/main:deploy/local/deploy.sh) <previous-sha>
```

Migrations are forward-only and stay applied; the expand-first rule keeps the previous release
compatible with them. Restoring the pre-deploy database snapshot discards every write made since
the deploy, so it is the human's call: never restore one on your own.
