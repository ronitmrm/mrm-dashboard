#!/usr/bin/env bash
# Installs and (re)starts the MRMPL user services: HTTPS proxy and nightly snapshot.
# User-level systemd with lingering enabled, so services start at boot without login.
# The web (mrm-web@<port>) and worker (mrm-worker@prod) units are installed and started
# by deploy.sh, which also decides which web port is live.
#
#   bash deploy/local/install-services.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
units=(mrm-caddy.service mrm-snapshot.service mrm-snapshot.timer mrm-web@.service mrm-worker@.service)

mkdir -p ~/.config/systemd/user
for unit in "${units[@]}"; do
  install -m 644 "$here/systemd/$unit" ~/.config/systemd/user/
done
systemctl --user daemon-reload
systemctl --user enable mrm-caddy.service mrm-snapshot.timer
systemctl --user restart mrm-caddy.service
systemctl --user start mrm-snapshot.timer
systemctl --user --no-pager status mrm-caddy.service 'mrm-web@*' 'mrm-worker@*' | grep -E '●|Active:'
