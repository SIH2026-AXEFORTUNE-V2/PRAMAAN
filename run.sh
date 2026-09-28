#!/usr/bin/env bash
# One-command local start: Python venv + web build, then serves PRAMAAN on :8000.
set -euo pipefail
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
[ -f .env ] || cp .env.example .env
if [ ! -f web/dist/index.html ] || [ "${REBUILD_WEB:-0}" = "1" ]; then
  command -v npm >/dev/null || { echo "Node.js 20+ is required to build the web app (web/)."; exit 1; }
  (cd web && npm install --no-audit --no-fund && npm run build)
fi
exec .venv/bin/uvicorn app.main:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
