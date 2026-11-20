#!/usr/bin/env bash
# Deploys a commit of the ERP to this server without downtime (blue-green).
#
#   bash deploy/local/deploy.sh [branch-or-sha]      (default: main)
#
# 1. Builds the release beside the live one (skipped when that commit was built before,
#    so redeploying an earlier commit is an instant rollback).
# 2. Snapshots the database and applies migrations while the live release keeps serving.
#    Migrations must stay backward compatible with the live release (the repo's expand-first rule).
# 3. Starts the release on the idle web port and health-checks it there.
# 4. Points Caddy at it with a graceful reload, restarts the worker on it, and stops the
#    old web server, which finishes its in-flight requests first.
# If the new release never becomes healthy, it is stopped and the live release is untouched.
#
# Overrides (the defaults are production): DEPLOY_SOURCE (where code is fetched from,
# e.g. a local checkout), MRM_SRV, MRM_ENV_FILE, MRM_PORTS, MRM_STACK, MRM_PROXY_RELOAD.
set -euo pipefail
shopt -s nullglob

ref="${1:-main}"
source="${DEPLOY_SOURCE:-https://github.com/ronitmrm/mrm-dashboard.git}"
srv="${MRM_SRV:-$HOME/srv}"
env_file="${MRM_ENV_FILE:-$HOME/.config/mrm/production.env}"
read -r port_a port_b <<<"${MRM_PORTS:-3001 3002}"
stack="${MRM_STACK:-prod}"
proxy_reload="${MRM_PROXY_RELOAD:-systemctl --user reload mrm-caddy.service}"
repo="$srv/mrm-erp.git"
releases="$srv/releases"
current="$srv/mrm-erp"
upstream_file="$srv/upstream.caddy"
slots="$HOME/srv/slots" # fixed: the systemd unit templates read it
units="$HOME/.config/systemd/user"
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"

mkdir -p "$releases" "$slots" "$units"
exec 9>"$srv/.deploy.lock"
flock -n 9 || { echo "Another deploy is running." >&2; exit 1; }

# The live port is the one Caddy proxies to. Before the first blue-green deploy, that is
# the single-slot mrm-web.service on 3001.
live_port="$(sed -n 's/^to 127\.0\.0\.1:\([0-9]*\)$/\1/p' "$upstream_file" 2>/dev/null || true)"
live_port="${live_port:-$port_a}"
idle_port="$port_a"
[[ "$live_port" == "$port_a" ]] && idle_port="$port_b"
live_unit="mrm-web@$live_port.service"
legacy=false
[[ "$stack" == prod && ! -e "$upstream_file" ]] && legacy=true && live_unit="mrm-web.service"
live_release="$(readlink -f "$slots/$live_port/app" 2>/dev/null || true)"
$legacy && live_release="$(readlink -f "$current")"

[[ -d "$repo" ]] || git init -q --bare "$repo"
git -C "$repo" fetch -q --prune "$source" '+refs/heads/*:refs/heads/*'
sha="$(git -C "$repo" rev-parse --verify "$ref^{commit}")"
release="$releases/$sha"
if ! $legacy && [[ "$live_release" == "$release" ]]; then
  echo "Already running $sha."
  exit 0
fi

# Next.js embeds the Server Actions key in the build; one key for every build keeps actions
# from an open tab working after a deploy.
if ! grep -q '^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=' "$env_file"; then
  echo "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$(openssl rand -base64 32)" >>"$env_file"
fi
deployment_id="${sha:0:12}"

if [[ ! -e "$release/.built" ]]; then
  echo "==> Building $sha"
  [[ -d "$release" ]] || git -C "$repo" worktree add --detach "$release" "$sha"
  cd "$release"
  # Install before loading the env file: NODE_ENV=production would skip build tooling.
  pnpm install --frozen-lockfile
  set -a
  . "$env_file"
  set +a
  # A per-release id makes open tabs hard-reload on their next navigation after a deploy.
  NEXT_DEPLOYMENT_ID="$deployment_id" pnpm build
  touch "$release/.built"
fi
touch "$release" # newest first when pruning, also for a rollback to an older release
cd "$release"
set -a
. "$env_file"
set +a

echo "==> Snapshot and migrate"
SNAPSHOT_ROOT="$srv/backups" bash "$release/deploy/local/snapshot.sh" "pre-deploy-${sha:0:8}"
pnpm migration:database:migrate

point_slot() { # slot-dir release
  mkdir -p "$1"
  ln -sfn "$2" "$1/app"
  ln -sfn "$env_file" "$1/stack.env"
  printf 'GIT_COMMIT_SHA=%s\nNEXT_DEPLOYMENT_ID=%s\n' "$(basename "$2")" "$(basename "$2" | cut -c1-12)" >"$1/slot.env"
}

healthy() { # port
  for _ in $(seq 60); do
    curl -fsS -o /dev/null "http://127.0.0.1:$1/api/auth/ok" && return 0
    sleep 2
  done
  return 1
}

echo "==> Starting $sha on :$idle_port"
install -m 644 "$release"/deploy/local/systemd/mrm-{web,worker}@.service "$units/"
# The Caddy unit carries MRM_SRV for the reload below.
[[ "$stack" == prod ]] && install -m 644 "$release/deploy/local/systemd/mrm-caddy.service" "$units/"
systemctl --user daemon-reload
systemctl --user stop "mrm-web@$idle_port.service"
point_slot "$slots/$idle_port" "$release"
systemctl --user start "mrm-web@$idle_port.service"
if ! healthy "$idle_port"; then
  echo "New release failed its health check on :$idle_port; the live release keeps serving." >&2
  journalctl --user -u "mrm-web@$idle_port.service" -n 30 --no-pager >&2 || true
  systemctl --user stop "mrm-web@$idle_port.service"
  exit 1
fi

echo "==> Pruning old releases (keeping the newest 3)"
mapfile -t kept < <(ls -1t "$releases" | head -n 3)
ls -1t "$releases" | tail -n +4 | while read -r old; do
  [[ "$live_release" == "$releases/$old" ]] && continue
  git -C "$repo" worktree remove --force "$releases/$old"
done
git -C "$repo" worktree prune

# Caddy serves /_next/static from the kept releases combined. Asset names are content
# hashes, so tabs still open on an older release keep loading their chunks.
echo "==> Publishing static assets"
static_next="$srv/static.$sha.$$"
mkdir -p "$static_next/_next/static"
for kept_release in "${kept[@]/#/$releases/}" "$live_release"; do
  assets="$kept_release/apps/web/.next/static"
  [[ -d "$assets" ]] && cp -al --update=none "$assets/." "$static_next/_next/static/"
done
ln -sfn "$static_next" "$srv/static.next"
mv -T "$srv/static.next" "$srv/static"
for old in "$srv"/static.*; do
  [[ "$old" == "$static_next" ]] || rm -rf "$old"
done

echo "==> Promoting :$idle_port"
printf 'to 127.0.0.1:%s\n' "$idle_port" >"$upstream_file.next"
mv "$upstream_file.next" "$upstream_file"
ln -sfn "$release" "$current.next"
mv -T "$current.next" "$current"
if ! eval "$proxy_reload"; then
  echo "Proxy reload failed; pointing back at :$live_port." >&2
  printf 'to 127.0.0.1:%s\n' "$live_port" >"$upstream_file"
  $legacy && rm -f "$upstream_file"
  [[ -n "$live_release" ]] && ln -sfn "$live_release" "$current"
  systemctl --user stop "mrm-web@$idle_port.service"
  exit 1
fi
systemctl --user enable -q "mrm-web@$idle_port.service"

echo "==> Restarting the worker on $sha"
point_slot "$slots/worker-$stack" "$release"
$legacy && systemctl --user disable -q --now mrm-worker.service
systemctl --user enable -q "mrm-worker@$stack.service"
systemctl --user restart "mrm-worker@$stack.service"

echo "==> Draining :$live_port"
# Requests Caddy already sent there finish; Next.js drains in-flight requests on SIGTERM.
sleep 5
systemctl --user disable -q --now "$live_unit"
if $legacy; then
  rm -f "$units/mrm-web.service" "$units/mrm-worker.service" "$HOME/.config/mrm/release.env"
  systemctl --user daemon-reload
fi
echo "Deployed $sha on :$idle_port."
