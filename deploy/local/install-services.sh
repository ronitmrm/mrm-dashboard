#!/usr/bin/env bash
# Installs and starts the MRMPL web + worker systemd services.
# Run: sudo bash deploy/local/install-services.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

here="$(cd "$(dirname "$0")" && pwd)"

install -m 644 "$here/systemd/mrm-web.service" "$here/systemd/mrm-worker.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable mrm-web mrm-worker
systemctl restart mrm-web mrm-worker
sleep 8
systemctl --no-pager --lines=5 status mrm-web mrm-worker
