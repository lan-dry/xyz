#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${AEGIS_DEMO_APPROVAL_PASSWORD:-}" ]]; then
  echo "Set AEGIS_DEMO_APPROVAL_PASSWORD (min 10 chars). No default." >&2
  exit 1
fi
export AEGIS_DEMO_MODE=true
exec node "$(dirname "$0")/demo-up.mjs"
