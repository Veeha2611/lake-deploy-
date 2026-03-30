#!/usr/bin/env bash
# Wrapper for production ingest (no secrets). Uses env vars or external env file.

set -euo pipefail

: "${INTACCT_SENDER_ID:?Missing INTACCT_SENDER_ID}"
: "${INTACCT_SENDER_REDACTED INTACCT_SENDER_PASSWORD}"
: "${INTACCT_COMPANY_ID:?Missing INTACCT_COMPANY_ID}"
: "${INTACCT_USER_ID:?Missing INTACCT_USER_ID}"
: "${INTACCT_WS_USER_REDACTED INTACCT_WS_USER_PASSWORD}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Delegate to the canonical ingest script
"$ROOT_DIR/../intacct_ingest.sh"
