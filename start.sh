#!/bin/sh
set -eu
cd "$(dirname "$0")"
command -v node >/dev/null || { echo 'Install Node.js 24 LTS from nodejs.org first'; exit 1; }
test -d node_modules/pg || npm ci --omit=dev
exec node scripts/shop/cli.mjs start
