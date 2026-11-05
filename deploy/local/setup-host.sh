#!/usr/bin/env bash
# One-time host bootstrap for the MRMPL local production server (WSL Ubuntu 24.04).
# Run once: sudo bash deploy/local/setup-host.sh
set -euo pipefail

if [[ $EUID -ne 0 || -z "${SUDO_USER:-}" ]]; then
  echo "Run with sudo from the operator account: sudo bash $0" >&2
  exit 1
fi

here="$(cd "$(dirname "$0")" && pwd)"

apt-get update
apt-get install -y postgresql-16 postgresql-client-16 postgresql-contrib redis-server

install -m 644 "$here/postgresql.conf" /etc/postgresql/16/main/conf.d/mrm.conf
install -m 644 "$here/redis.conf" /etc/redis/mrm.conf
grep -qxF 'include /etc/redis/mrm.conf' /etc/redis/redis.conf ||
  echo 'include /etc/redis/mrm.conf' >> /etc/redis/redis.conf

systemctl enable postgresql redis-server
systemctl restart postgresql redis-server

# Local superuser for the operator account (Unix-socket peer auth only).
sudo -u postgres psql -v ON_ERROR_STOP=1 -v owner="$SUDO_USER" <<'SQL'
SELECT format('CREATE ROLE %I SUPERUSER LOGIN', :'owner')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'owner') \gexec
SQL

sudo -u postgres psql -tAc "SHOW shared_buffers"
redis-cli ping
echo "Host bootstrap complete."
