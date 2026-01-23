#!/usr/bin/env bash
set -euo pipefail

TODAY="$(date -u '+%F')"
TRIAGE_ROOT="$HOME/intacct_triage/$TODAY"
mkdir -p "$TRIAGE_ROOT"
OUTPUT="$TRIAGE_ROOT/cron_context.txt"

{
  echo "Cron diff snapshot: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "Hostname: $(hostname)"
  echo

  echo "Intacct environment:"
  echo "  INTACCT_ENDPOINT_URL=${INTACCT_ENDPOINT_URL:-<unset>}"
  echo "  INTACCT_SENDER_ID=${INTACCT_SENDER_ID:-<unset>}"
  echo "  INTACCT_COMPANY_ID=${INTACCT_COMPANY_ID:-<unset>}"
  echo "  INTACCT_WS_USER_ID=${INTACCT_WS_USER_ID:-<unset>}"
  echo
  echo "AWS caller identity:"
  aws sts get-caller-identity --output text || true
  echo

  LOG_DIR="$HOME/intacct_ingest/logs"
  if [[ -d "$LOG_DIR" ]]; then
    echo "Tail of the last two cron logs (last 50 lines each):"
    mapfile -t LOG_FILES < <(ls -1t "$LOG_DIR"/ingest_*.log 2>/dev/null | head -n 2)
    if [[ ${#LOG_FILES[@]} -eq 0 ]]; then
      echo "  (no ingest logs found under $LOG_DIR)"
    else
      for log in "${LOG_FILES[@]}"; do
        echo "---- tail of $(basename "$log") ----"
        tail -n 50 "$log"
        echo
      done
    fi
  else
    echo "Log directory missing: $LOG_DIR"
  fi

  CRON_SCRIPT="$HOME/intacct_ingest.sh"
  echo "Cron script path: $CRON_SCRIPT"
  if [[ -f "$CRON_SCRIPT" ]]; then
    echo "Script SHA256: $(shasum -a 256 "$CRON_SCRIPT" | awk '{print $1}')"
    echo "First 20 lines:"
    head -n 20 "$CRON_SCRIPT"
    echo
    if git -C "$HOME" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      echo "Git status for script:"
      git -C "$HOME" status --short "$CRON_SCRIPT"
      echo "Recent commits affecting script:"
      git -C "$HOME" log -n 5 -- "$CRON_SCRIPT"
    else
      echo "Not inside a git working tree; skipping git diagnostics."
    fi
  else
    echo "Cron script not found at $CRON_SCRIPT"
  fi
} | tee "$OUTPUT"

echo "Cron context saved to $OUTPUT"
