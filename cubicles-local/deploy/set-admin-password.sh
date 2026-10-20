#!/usr/bin/env bash
set -euo pipefail
if [ "${EUID}" -ne 0 ]; then echo '请通过 sudo 运行。' >&2; exit 1; fi
set -a
source /etc/3d-wikibook.env
set +a
cd /srv/3d-wikibook/cubicles-local
systemctl stop 3d-wikibook.service
trap 'systemctl start 3d-wikibook.service' EXIT
runuser -u wikibook3d -- /usr/bin/node scripts/admin-password.mjs --username "${DEFAULT_ADMIN_USERNAME:-lzy}"
