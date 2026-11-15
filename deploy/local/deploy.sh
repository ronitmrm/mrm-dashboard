#!/usr/bin/env bash
# Deploys a commit of the ERP to this server.
#
#   bash deploy/local/deploy.sh [branch-or-sha]      (default: main)
#
# DEPLOY_SOURCE overrides where code is fetched from (default: GitHub), e.g. a
# local checkout for rehearsals.
#
# Builds the new release beside the running one, snapshots the database, applies
# migrations, switches ~/srv/mrm-erp to the new release, restarts, and health-checks.
# If the new release does not come up, the code is switched back (migrations stay,
# so they must be backward compatible, which is the repo's expand-first rule).
set -euo pipefail

ref="${1:-main}"
source="${DEPLOY_SOURCE:-https://github.com/ronitmrm/mrm-dashboard.git}"
srv="$HOME/srv"
repo="$srv/mrm-erp.git"
releases="$srv/releases"
current="$srv/mrm-erp"
config="$HOME/.config/mrm"
health_url="http://127.0.0.1:3001/api/auth/ok"
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"

mkdir -p "$releases"
exec 9>"$srv/.deploy.lock"
flock -n 9 || { echo "Another deploy is running." >&2; exit 1; }

if [[ -e "$current" && ! -L "$current" ]]; then
  echo "$current is a plain directory; move it aside before the first deploy." >&2
  exit 1
fi

[[ -d "$repo" ]] || git init -q --bare "$repo"
git -C "$repo" fetch -q --prune "$source" '+refs/heads/*:refs/heads/*'
sha="$(git -C "$repo" rev-parse --verify "$ref^{commit}")"
release="$releases/$sha"
previous=""
[[ -L "$current" ]] && previous="$(readlink -f "$current")"
if [[ "$previous" == "$release" ]]; then
  echo "Already running $sha."
  exit 0
fi

echo "==> Building $sha"
[[ -d "$release" ]] || git -C "$repo" worktree add --detach "$release" "$sha"
cd "$release"
# Install before loading production.env: NODE_ENV=production would skip build tooling.
pnpm install --frozen-lockfile
set -a
. "$config/production.env"
set +a
pnpm build

echo "==> Snapshot and migrate"
bash "$release/deploy/local/snapshot.sh" "pre-deploy-${sha:0:8}"
pnpm migration:database:migrate

switch_to() {
  ln -sfn "$1" "$current.next"
  mv -T "$current.next" "$current"
  echo "GIT_COMMIT_SHA=$(basename "$1")" > "$config/release.env"
  install -m 644 "$1"/deploy/local/systemd/mrm-{web,worker}.service ~/.config/systemd/user/
  systemctl --user daemon-reload
  systemctl --user restart mrm-web.service mrm-worker.service
}

healthy() {
  for _ in $(seq 60); do
    curl -fsS -o /dev/null "$health_url" && return 0
    sleep 2
  done
  return 1
}

echo "==> Switching to $sha"
switch_to "$release"
if ! healthy; then
  echo "New release failed its health check." >&2
  if [[ -n "$previous" ]]; then
    echo "Rolling back to $(basename "$previous")." >&2
    switch_to "$previous"
    healthy || echo "Previous release is not healthy either." >&2
  fi
  exit 1
fi

echo "==> Pruning old releases (keeping the newest 3)"
ls -1t "$releases" | tail -n +4 | while read -r old; do
  [[ "$releases/$old" == "$previous" ]] && continue
  git -C "$repo" worktree remove --force "$releases/$old"
done
echo "Deployed $sha."
