#!/usr/bin/env bash
# start-demo.sh — start the gryth-ui desktop (vite dev server on :5173).
#
# Runs DETACHED; pid -> .demo/run.pid, output -> .demo/run.log.
# Requires sibling ../grip-core and ../grip-react with built dist/.
# Stop with: ./stop-demo.sh   |   Open http://localhost:5173/
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$HERE/.demo"
PIDFILE="$RUN_DIR/run.pid"
LOG="$RUN_DIR/run.log"
PORT="${GRYTH_UI_PORT:-5173}"
mkdir -p "$RUN_DIR"
cd "$HERE"   # pnpm must run from the gryth-ui dir, not the caller's cwd

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
  echo "gryth-ui already running (pid $(cat "$PIDFILE")). Run ./stop-demo.sh first." >&2
  exit 1
fi

echo "Starting gryth-ui — vite :$PORT…"
nohup pnpm run dev --port "$PORT" --strictPort >"$LOG" 2>&1 &
echo $! >"$PIDFILE"

for _ in $(seq 1 60); do
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Ready → http://localhost:$PORT/"
    echo "Logs:   $LOG"
    exit 0
  fi
  sleep 1
done
echo "Started (pid $(cat "$PIDFILE")) but vite not listening on :$PORT yet — check $LOG" >&2
exit 0
