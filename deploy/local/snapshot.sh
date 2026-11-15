#!/usr/bin/env bash
# On-disk snapshot of the production database and retained files.
#
#   bash deploy/local/snapshot.sh [label]      (default: nightly)
#
# Database: custom-format pg_dump. Files: hard-linked copy of the artifact
# directory (files are immutable, so unchanged ones cost no extra space).
# Keeps the newest 14 nightly and 5 pre-deploy snapshots.
set -euo pipefail

label="${1:-nightly}"
artifacts="${ARTIFACT_STORAGE_DIRECTORY:-$HOME/srv/mrm-artifacts}"
root="$HOME/srv/backups"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="$stamp-$label"
umask 077
mkdir -p "$root/database" "$root/artifacts"

pg_dump -d mrmpl -Fc -Z zstd:3 -f "$root/database/$name.dump.partial"
mv "$root/database/$name.dump.partial" "$root/database/$name.dump"

latest="$(ls -1d "$root"/artifacts/*/ 2>/dev/null | tail -1 || true)"
rsync -a --delete ${latest:+--link-dest="$latest"} "$artifacts/" "$root/artifacts/$name/"

prune() {
  local directory="$1" pattern="$2" keep="$3"
  ls -1d "$directory"/$pattern 2>/dev/null | sort | head -n "-$keep" | xargs -r rm -rf
}
for kind in database artifacts; do
  prune "$root/$kind" "*-nightly*" 14
  prune "$root/$kind" "*-pre-deploy-*" 5
done
echo "Snapshot $name written to $root."
