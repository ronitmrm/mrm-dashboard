#!/usr/bin/env bash
# On-disk snapshot of the production database and retained files.
#
#   bash deploy/local/snapshot.sh [label]      (default: nightly)
#
# SNAPSHOT_ROOT and SNAPSHOT_DATABASE override the destination and the database (rehearsals).
#
# Database: custom-format pg_dump. Files: hard-linked copy of the artifact
# directory (files are immutable, so unchanged ones cost no extra space).
# Keeps the newest 14 nightly and 5 pre-deploy snapshots.
set -euo pipefail
shopt -s nullglob

label="${1:-nightly}"
artifacts="${ARTIFACT_STORAGE_DIRECTORY:-$HOME/srv/mrm-artifacts}"
root="${SNAPSHOT_ROOT:-$HOME/srv/backups}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="$stamp-$label"
umask 077
mkdir -p "$root/database" "$root/artifacts"

pg_dump -d "${SNAPSHOT_DATABASE:-mrmpl}" -Fc -Z zstd:3 -f "$root/database/$name.dump.partial"
mv "$root/database/$name.dump.partial" "$root/database/$name.dump"

previous_snapshots=("$root"/artifacts/*/)
latest=""
((${#previous_snapshots[@]})) && latest="${previous_snapshots[-1]}"
rsync -a --delete ${latest:+--link-dest="$latest"} "$artifacts/" "$root/artifacts/$name/"

prune() {
  local entries=("$1"/$2)
  local excess=$((${#entries[@]} - $3))
  ((excess > 0)) && rm -rf "${entries[@]:0:excess}"
  return 0
}
for kind in database artifacts; do
  prune "$root/$kind" "*-nightly*" 14
  prune "$root/$kind" "*-pre-deploy-*" 5
done
echo "Snapshot $name written to $root."
