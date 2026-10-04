#!/usr/bin/env bash
# 在项目根目录启动 FastAPI 后端（8000 端口）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if lsof -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Backend already listening on http://127.0.0.1:8000"
  curl -sf http://127.0.0.1:8000/api/health && echo
  exit 0
fi

echo "Starting backend on http://127.0.0.1:8000 ..."
exec "$ROOT/.venv/bin/uvicorn" backend.main:app --host 127.0.0.1 --port 8000
