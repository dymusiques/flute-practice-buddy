#!/usr/bin/env bash
# 一键安装依赖并启动前后端，自动打开练习页
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> FluteBuddy 一键启动"

# API Key 由 share.env 提供（不提交 git，向仓库所有者私聊索取）
_has_api_key() {
  local file=$1
  [[ -f "$file" ]] && grep -qE '^GOOGLE_API_KEY=.+' "$file" \
    && ! grep -qE '^GOOGLE_API_KEY=(请粘贴私下收到的密钥|你的密钥|)$' "$file"
}

if _has_api_key .env; then
  : # 已有 .env，直接启动
elif [[ ! -f share.env ]]; then
  if [[ -f share.env.example ]]; then
    cp share.env.example share.env
    echo ""
    echo "已创建 share.env — 请先填入私下收到的 GOOGLE_API_KEY，再重新运行本脚本。"
    echo "  编辑: $ROOT/share.env"
    exit 1
  fi
  echo "错误: 缺少 share.env，且找不到 share.env.example"
  exit 1
fi
elif grep -qE '^GOOGLE_API_KEY=(请粘贴私下收到的密钥|你的密钥|)$' share.env; then
  echo ""
  echo "请先在 share.env 中填写 GOOGLE_API_KEY（向仓库所有者索取），再重新运行本脚本。"
  exit 1
else
  cp share.env .env
  echo "    已从 share.env 生成 .env"
fi

# Python 虚拟环境
if [[ ! -d .venv ]]; then
  echo "==> 创建 Python 虚拟环境..."
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r backend/requirements.txt

# Node（优先 nvm）
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
if ! command -v node >/dev/null 2>&1; then
  echo "错误: 未找到 node。请安装 Node.js 18+：https://nodejs.org"
  exit 1
fi

if [[ ! -d frontend/node_modules ]]; then
  echo "==> 安装前端依赖..."
  (cd frontend && npm install)
fi

# 若已在运行则跳过
if lsof -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "    后端已在 8000 端口运行"
else
  echo "==> 启动后端 http://127.0.0.1:8000 ..."
  nohup .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000 \
    >> /tmp/flutebuddy-backend.log 2>&1 < /dev/null &
  BPID=$!
  disown "$BPID" 2>/dev/null || true
  echo "$BPID" > /tmp/flutebuddy-backend.pid
fi

if lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "    前端已在 3000 端口运行"
else
  echo "==> 启动前端 http://localhost:3000 ..."
  (
    cd "$ROOT/frontend"
    nohup npm run dev >> /tmp/flutebuddy-frontend.log 2>&1 < /dev/null &
    FPID=$!
    disown "$FPID" 2>/dev/null || true
    echo "$FPID" > /tmp/flutebuddy-frontend.pid
  )
fi

echo "==> 等待服务就绪..."
for _ in $(seq 1 60); do
  if curl -sf http://127.0.0.1:8000/api/health >/dev/null 2>&1 \
     && curl -sf http://localhost:3000/ >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

URL="http://localhost:3000/practice"
echo ""
echo "✓ 已就绪: $URL"
if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
else
  echo "  请在浏览器中打开: $URL"
fi
