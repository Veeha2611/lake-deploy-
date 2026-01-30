#!/usr/bin/env bash
# Load Intacct env vars from a local file (no secrets committed).
# Usage: ./intacct_env_from_file.sh /path/to/intacct.env

set -euo pipefail

ENV_FILE="${1:-}"
if [[ -z "$ENV_FILE" || ! -f "$ENV_FILE" ]]; then
  echo "Usage: $0 /path/to/intacct.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Loaded INTACCT_* variables from $ENV_FILE"
