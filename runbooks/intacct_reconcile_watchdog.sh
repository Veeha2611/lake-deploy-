#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-2}"
BUCKET="gwi-raw-us-east-2-pc"
S3_BASE="s3://${BUCKET}"

DATA_PREFIX="raw/intacct_json/gl_entries/data"
EVID_PREFIX="curated_recon/intacct_self_audit"

log() {
  printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"
}

list_run_dates() {
  aws s3 ls "${S3_BASE}/${DATA_PREFIX}/" --region "$AWS_REGION" 2>/dev/null \
    | awk '{print $2}' | sed 's:/$::' | awk -F= '{print $2}' \
    | sort
}

evidence_exists() {
  local rd="$1"
  aws s3 ls "${S3_BASE}/${EVID_PREFIX}/dt=${rd}/status.json" --region "$AWS_REGION" >/dev/null 2>&1
}

SCRIPT_S3="s3://gwi-raw-us-east-2-pc/orchestration/intacct/intacct_reconcile_on_arrival.sh"
SCRIPT_LOCAL="/tmp/intacct_reconcile_on_arrival.sh"
aws s3 cp "$SCRIPT_S3" "$SCRIPT_LOCAL" --region "$AWS_REGION" >/dev/null 2>&1
chmod +x "$SCRIPT_LOCAL"

for rd in $(list_run_dates); do
  if evidence_exists "$rd"; then
    log "OK: evidence present for ${rd}"
    continue
  fi
  log "Reconciling run_date=${rd}"
  "$SCRIPT_LOCAL" "$rd"
done

log "Recon watchdog complete"
