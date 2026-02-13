#!/usr/bin/env bash
set -euo pipefail

RUN_DATE="${RUN_DATE:-$(date +%F)}"
LOG_DIR="${LOG_DIR:-/Users/patch/lake_deploy/ssot_audit}"
mkdir -p "$LOG_DIR"

log() {
  printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"
}

log "SSOT global gates start (run_date=${RUN_DATE})"

log "Running source gates"
RUN_DATE="$RUN_DATE" /Users/patch/lake_deploy/runbooks/ssot_source_gates.sh \
  > "$LOG_DIR/ssot_source_gates_${RUN_DATE}_$(date +%H%M%S).log" 2>&1

log "Running Intacct gates"
RUN_DATE="$RUN_DATE" /Users/patch/lake_deploy/runbooks/ssot_intacct_gates.sh \
  > "$LOG_DIR/ssot_intacct_gates_${RUN_DATE}_$(date +%H%M%S).log" 2>&1

log "Running Platt gates"
RUN_DATE="$RUN_DATE" /Users/patch/lake_deploy/runbooks/ssot_platt_gates.sh \
  > "$LOG_DIR/ssot_platt_gates_${RUN_DATE}_$(date +%H%M%S).log" 2>&1

log "SSOT global gates PASS"
