#!/bin/sh
set -eu
: "${ARIA2_RPC_SECRET:?Set ARIA2_RPC_SECRET to a random secret of at least 32 characters}"
if [ "${#ARIA2_RPC_SECRET}" -lt 32 ]; then echo 'ARIA2_RPC_SECRET must contain at least 32 characters' >&2; exit 1; fi
umask 077
touch /config/session.txt
exec aria2c \
  --enable-rpc=true --rpc-listen-all=true --rpc-listen-port=6800 \
  --rpc-allow-origin-all=false --rpc-secret="$ARIA2_RPC_SECRET" \
  --dir=/downloads --input-file=/config/session.txt \
  --save-session=/config/session.txt --save-session-interval=15 \
  --continue=true --file-allocation=none --allow-overwrite=false \
  --auto-file-renaming=true --max-concurrent-downloads=3 \
  --max-connection-per-server=3 --split=3 \
  --max-overall-download-limit="${ARIA2_DOWNLOAD_LIMIT:-0}" \
  --seed-time=0 --seed-ratio=0.0 \
  --log-level=warn --console-log-level=warn
