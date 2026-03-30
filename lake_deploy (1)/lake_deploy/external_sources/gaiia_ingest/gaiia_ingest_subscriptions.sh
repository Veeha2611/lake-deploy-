#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/gaiia_ingest_common.sh"
source "${SCRIPT_DIR}/gaiia_ingest_runner.sh"

OBJECT_NAME="subscriptions"
init_run "$OBJECT_NAME"
confirm_connectivity
log "Running ${OBJECT_NAME} ingest pipeline"
run_gaiia_ingest "$OBJECT_NAME"
