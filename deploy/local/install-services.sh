#!/usr/bin/env bash
# Installs and (re)starts the MRMPL user services: web, worker, quick tunnel.
# User-level systemd with lingering enabled, so services start at boot without login.
# Run: bash deploy/local/install-services.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
units=(mrm-web.service mrm-worker.service mrm-tunnel.service)

mkdir -p ~/.config/systemd/user
for unit in "${units[@]}"; do
  install -m 644 "$here/systemd/$unit" ~/.config/systemd/user/
done
systemctl --user daemon-reload
systemctl --user enable "${units[@]}"
systemctl --user restart mrm-web.service mrm-worker.service
systemctl --user start mrm-tunnel.service
bash "$here/sync-tunnel-url.sh"
