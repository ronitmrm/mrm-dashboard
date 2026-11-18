#!/usr/bin/env bash
# Installs and (re)starts the MRMPL user services: web, worker, HTTPS proxy, nightly snapshot.
# User-level systemd with lingering enabled, so services start at boot without login.
#
#   bash deploy/local/install-services.sh            # production (Caddy on :9443)
#   bash deploy/local/install-services.sh --tunnel   # rehearsal: Cloudflare quick tunnel instead
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
proxy=mrm-caddy.service
[[ "${1:-}" == "--tunnel" ]] && proxy=mrm-tunnel.service
units=(mrm-web.service mrm-worker.service "$proxy" mrm-snapshot.service mrm-snapshot.timer)

mkdir -p ~/.config/systemd/user
for unit in "${units[@]}"; do
  install -m 644 "$here/systemd/$unit" ~/.config/systemd/user/
done
systemctl --user daemon-reload
other=mrm-tunnel.service; [[ "$proxy" == mrm-tunnel.service ]] && other=mrm-caddy.service
systemctl --user disable --now "$other" 2>/dev/null || true
systemctl --user enable mrm-web.service mrm-worker.service "$proxy" mrm-snapshot.timer
systemctl --user restart mrm-web.service mrm-worker.service "$proxy"
systemctl --user start mrm-snapshot.timer
[[ "$proxy" == mrm-tunnel.service ]] && bash "$here/sync-tunnel-url.sh"
systemctl --user --no-pager status "${units[@]:0:3}" | grep -E '●|Active:'
