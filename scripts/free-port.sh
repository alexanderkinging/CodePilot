#!/bin/bash

# Safe port cleanup script
# Only kills processes in LISTEN state, not client connections (ESTABLISHED)

PORT=${1:-3000}

echo "🔍 Checking for processes listening on port $PORT..."

# Find PIDs of processes listening on the port
PIDS=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null)

if [ -z "$PIDS" ]; then
  echo "✅ No process is listening on port $PORT"
  exit 0
fi

echo "⚠️  Found process(es) listening on port $PORT:"
lsof -nP -iTCP:$PORT -sTCP:LISTEN

echo ""
echo "🛑 Attempting to gracefully stop process(es)..."
for PID in $PIDS; do
  echo "  Sending SIGTERM to PID $PID..."
  kill $PID 2>/dev/null
done

# Wait a moment for graceful shutdown
sleep 2

# Check if any processes are still listening
REMAINING=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null)

if [ -z "$REMAINING" ]; then
  echo "✅ Port $PORT is now free"
  exit 0
fi

echo "⚠️  Some processes are still running, forcing shutdown..."
for PID in $REMAINING; do
  echo "  Sending SIGKILL to PID $PID..."
  kill -9 $PID 2>/dev/null
done

sleep 1

# Final check
FINAL_CHECK=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null)

if [ -z "$FINAL_CHECK" ]; then
  echo "✅ Port $PORT is now free"
  exit 0
else
  echo "❌ Failed to free port $PORT"
  exit 1
fi
