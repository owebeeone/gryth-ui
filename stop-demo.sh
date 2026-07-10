#!/usr/bin/env bash
# stop-demo.sh — stop the gryth-ui desktop started by ./start-demo.sh.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE="$HERE/.demo/run.pid"
PORT="${GRYTH_UI_PORT:-5173}"

stopped=0
if [ -f "$PIDFILE" ]; then
  PID="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null; then
    echo "stopped (pid $PID)"; stopped=1
  fi
  rm -f "$PIDFILE"
fi

pids="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
if [ -n "$pids" ]; then
  kill $pids 2>/dev/null || true
  echo "freed port $PORT"; stopped=1
fi

[ "$stopped" -eq 1 ] && echo "gryth-ui stopped." || echo "gryth-ui was not running."
