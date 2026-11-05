#!/usr/bin/env bash
# Points BETTER_AUTH_URL / NEXT_PUBLIC_APP_URL at the current quick-tunnel hostname
# and restarts the web service when it changed. Rerun after the tunnel restarts.
set -euo pipefail

env_file="$HOME/.config/mrm/production.env"
url=""
for _ in $(seq 1 30); do
  invocation="$(systemctl --user show -p InvocationID --value mrm-tunnel.service)"
  url="$(journalctl --user _SYSTEMD_INVOCATION_ID="$invocation" -o cat 2>/dev/null |
    grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"
  [[ -n "$url" ]] && break
  sleep 2
done
if [[ -z "$url" ]]; then
  echo "No trycloudflare hostname found in mrm-tunnel logs." >&2
  exit 1
fi

if grep -qxF "BETTER_AUTH_URL=$url" "$env_file" && grep -qxF "NEXT_PUBLIC_APP_URL=$url" "$env_file"; then
  echo "Already pointing at $url"
else
  sed -i -e "s|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=$url|" \
    -e "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=$url|" "$env_file"
  systemctl --user restart mrm-web.service
  echo "Web now serves $url"
fi
