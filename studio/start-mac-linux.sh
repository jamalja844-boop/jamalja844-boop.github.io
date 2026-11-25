#!/usr/bin/env bash
# Start AI Video Ads Studio (macOS / Linux). Usage: ./start-mac-linux.sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js ontbreekt / is missing. Install Node.js 22 LTS from https://nodejs.org and run again."
  exit 1
fi
exec node scripts/start.mjs
