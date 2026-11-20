#!/bin/sh
# Railway volumes mount as root; the app runs as `node`. Fix ownership before start.
set -eu
mkdir -p /data
chown -R node:node /data 2>/dev/null || true
chmod u+rwx /data 2>/dev/null || true
exec gosu node "$@"
