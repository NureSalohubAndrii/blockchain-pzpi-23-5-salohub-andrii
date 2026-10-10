#!/bin/bash
PORT=3001 PEERS=http://localhost:3002,http://localhost:3003 npx tsx src/index.ts &
PID1=$!
PORT=3002 PEERS=http://localhost:3001,http://localhost:3003 npx tsx src/index.ts &
PID2=$!
PORT=3003 PEERS=http://localhost:3001,http://localhost:3002 npx tsx src/index.ts &
PID3=$!

trap "kill $PID1 $PID2 $PID3 2>/dev/null" EXIT INT TERM
wait
