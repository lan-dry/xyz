#!/usr/bin/env bash
# Wrapper for demo:up (local stack: normal API, real timers, no demo mode)
set -euo pipefail
exec node "$(dirname "$0")/demo-up.mjs" "$@"
