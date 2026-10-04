#!/usr/bin/env bash
# 停止 start-all.sh 启动的前后端
set -euo pipefail

stop_pid_file() {
  local file=$1
  local label=$2
  if [[ -f "$file" ]]; then
    local pid
    pid=$(cat "$file")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "已停止 $label (pid $pid)"
    fi
    rm -f "$file"
  fi
}

stop_pid_file /tmp/flutebuddy-backend.pid "后端"
stop_pid_file /tmp/flutebuddy-frontend.pid "前端"

# 兜底：按端口结束残留进程
for port in 8000 3000; do
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "结束占用 ${port} 端口的进程: $pids"
    kill $pids 2>/dev/null || true
  fi
done

echo "完成"
