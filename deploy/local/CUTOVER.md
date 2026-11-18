# Cutover: Vercel/Neon/Railway/GCS → this server

Target URL: `https://erp.mayankrawmint.com:9443` (public 80/443 belong to the factory firewall).
One scheduled downtime. Neon `staging` stays untouched as the rollback point.

## Before the downtime

1. **Cloudflare zone for the certificate:** `mrmerp.fyi` (done). API token with *Zone → Zone → Read*
   and *Zone → DNS → Edit*, limited to `mrmerp.fyi`. `~/.config/mrm/caddy.env` (0600):
   ```
   APP_HOST=erp.mayankrawmint.com
   ACME_DELEGATED_DOMAIN=_acme-challenge.erp.mrmerp.fyi
   CLOUDFLARE_API_TOKEN=<token>
   ```
2. **Domain admin, once:** CNAME `_acme-challenge.erp.mayankrawmint.com` → `_acme-challenge.erp.mrmerp.fyi`.
   Does not affect the live site. A day before the downtime: lower the `erp` record TTL to 300.
3. **Windows, once (admin PowerShell):** `deploy/local/windows-setup.ps1`
   (opens 9443 to WSL, starts WSL at boot, disables sleep).
4. **Pre-issue the certificate:** `bash deploy/local/install-services.sh`, then from outside the
   factory: `curl --resolve erp.mayankrawmint.com:9443:203.76.186.224 https://erp.mayankrawmint.com:9443/api/auth/ok`.
5. **Rehearse** steps 3–7 below once and time them
   (`DEPLOY_SOURCE=~/Code/mrm bash deploy/local/deploy.sh migration` deploys without touching GitHub).

## Downtime

1. Freeze writes: pause the Vercel project and disconnect its Git integration; stop the Railway worker
   and disconnect its GitHub source (it redeploys on every push to `main`).
2. `sudo systemctl enable --now postgresql redis-server`
3. `bash deploy/local/refresh-from-neon.sh --replace-local-database` (row counts must match exactly).
4. Merge `migration` into `main`, then `bash deploy/local/deploy.sh main`
   (applies migrations, including the local-disk provider check).
5. Files: refresh the token (`vercel env pull --environment=production` into
   `~/.config/mrm-migration/vercel-production.env`), then from `~/srv/mrm-erp/apps/web` with
   `production.env` and `VERCEL_OIDC_TOKEN` loaded:
   `pnpm artifact:storage:copy-local --mode=copy` then `--mode=switch`. Both must exit 0.
6. `touch ~/.config/mrm/local-authoritative` (refresh-from-neon refuses to run after this).
7. In `~/.config/mrm/production.env` set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to
   `https://erp.mayankrawmint.com:9443`, then `bash deploy/local/install-services.sh`.
8. Domain admin: change `erp` from the Vercel CNAME to `A 203.76.186.224`.
9. Smoke test from mobile data: login, each module, download and upload a file.
   Everyone signs in again; old bookmarks without `:9443` land on the firewall's page.

## Rollback (only before users enter real data locally)

Point `erp` back at the Vercel CNAME, unpause Vercel, start Railway. Anything entered locally is lost.

## After

- Deploys: `bash deploy/local/deploy.sh` after each merge to `main`.
- Snapshots: nightly at 02:30 in `~/srv/backups` (same disk), plus one before every deploy.
- After a stable week or two: downgrade Vercel, Railway, Upstash. Keep Neon longer.
