#!/usr/bin/env bash
# Local smoke test: starts the app in mock mode (no keys/network) and drives the
# Twilio webhook flow, printing the TwiML the assistant would return.
set -euo pipefail
cd "$(dirname "$0")"

export LLM_PROVIDER=mock TTS_PROVIDER=twilio
export COMPANY_NAME="${COMPANY_NAME:-Mijn Bedrijf}" ASSISTANT_NAME="${ASSISTANT_NAME:-Sam}"
export OPENING_HOURS="${OPENING_HOURS:-ma-vr 9:00-17:00}" PORT="${PORT:-8080}"

python app.py >/tmp/va_test.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT

for _ in $(seq 1 20); do curl -s "localhost:$PORT/health" >/dev/null 2>&1 && break; sleep 0.5; done

echo "== health =="; curl -s "localhost:$PORT/health"; echo
echo "== greeting =="; curl -s -X POST "localhost:$PORT/voice" -d "CallSid=T1"; echo
echo "== are you human =="; curl -s -X POST "localhost:$PORT/handle" -d "CallSid=T1" --data-urlencode "SpeechResult=ben jij een mens"; echo
echo "== appointment =="; curl -s -X POST "localhost:$PORT/handle" -d "CallSid=T1" --data-urlencode "SpeechResult=ik wil een afspraak"; echo
echo "OK"
