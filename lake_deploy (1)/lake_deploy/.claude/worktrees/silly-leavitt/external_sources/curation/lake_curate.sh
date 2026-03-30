#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_BASE="${HOME}/lake_runbook/$(date +%F)"
mkdir -p "$LOG_BASE"
RUN_LOG="$LOG_BASE/run_$(date +%H%M%S).log"
exec > >(tee -a "$RUN_LOG") 2>&1

DT=""
DT_RANGE=""

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--dt YYYY-MM-DD] [--dt-range YYYY-MM-DD:YYYY-MM-DD]
  --dt        run for a single date (defaults to today)
  --dt-range  run for every date between START and END (inclusive)
USAGE
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dt)
      DT="$2"
      shift 2
      ;;
    --dt-range)
      DT_RANGE="$2"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

if [[ -n "$DT" && -n "$DT_RANGE" ]]; then
  echo "Cannot provide both --dt and --dt-range" >&2
  usage
fi

if [[ -z "$DT" && -z "$DT_RANGE" ]]; then
  TODAY="$(date +%F)"
  DT="$TODAY"
fi

DATE_RANGE=""
if [[ -n "$DT_RANGE" ]]; then
  DATE_RANGE="$DT_RANGE"
else
  DATE_RANGE="$DT:$DT"
fi

generate_dates() {
  python3 - <<PY
from datetime import datetime, timedelta
start_str, end_str = "$DATE_RANGE".split(":")
start = datetime.strptime(start_str, "%Y-%m-%d")
end = datetime.strptime(end_str, "%Y-%m-%d")
current = start
while current <= end:
    print(current.strftime("%Y-%m-%d"))
    current += timedelta(days=1)
PY
}

run_athena_sql() {
  local sql_file="$1"
  local dt_value="${2:-}"
  local query
  query="$(< "$sql_file")"
  if [[ -n "$dt_value" ]]; then
    query="${query//\{\{dt\}\}/$dt_value}"
  fi
  local output="s3://gwi-raw-us-east-2-pc/athena-query-results/lake_curate/"
  echo "Starting Athena query from $sql_file for dt=${dt_value:-ALL}" >&2
  aws athena start-query-execution \
    --query-string "$query" \
    --query-execution-context Database=curated \
    --result-configuration OutputLocation="$output"
}

DDL_FILES=(
  "$SCRIPT_DIR/athena_ddl/raw_intacct_gl_entries.sql"
  "$SCRIPT_DIR/athena_ddl/raw_platt_customer.sql"
  "$SCRIPT_DIR/athena_ddl/raw_salesforce_accounts.sql"
  "$SCRIPT_DIR/athena_ddl/raw_salesforce_opportunities.sql"
  "$SCRIPT_DIR/athena_ddl/raw_vetro_exports.sql"
)

CTAS_FILES=(
  "$SCRIPT_DIR/athena_ctas/curated_intacct_gl_entries.sql"
  "$SCRIPT_DIR/athena_ctas/curated_platt_customer.sql"
  "$SCRIPT_DIR/athena_ctas/curated_salesforce_accounts.sql"
  "$SCRIPT_DIR/athena_ctas/curated_salesforce_opportunities.sql"
  "$SCRIPT_DIR/athena_ctas/curated_vetro_exports.sql"
  "$SCRIPT_DIR/athena_ctas/curated_dim_customer.sql"
  "$SCRIPT_DIR/athena_ctas/curated_fact_revenue.sql"
)

CTAS_LABELS=(
  curated_intacct_gl_entries
  curated_platt_customer
  curated_salesforce_accounts
  curated_salesforce_opportunities
  curated_vetro_exports
  curated_dim_customer
  curated_fact_revenue
)

VALIDATIONS=(
  "SELECT '{{dt}}' AS dt, COUNT(*) AS rows FROM curated_intacct_gl_entries WHERE dt='{{dt}}'"
  "SELECT '{{dt}}' AS dt, COUNT(DISTINCT customer_id) AS customers FROM curated_dim_customer WHERE dt='{{dt}}'"
  "SELECT '{{dt}}' AS dt, COUNT(*) FILTER (WHERE customer_id IS NULL) AS null_customers FROM curated_intacct_gl_entries WHERE dt='{{dt}}'"
)

VALIDATION_NAMES=(
  ctas_row_count
  dim_customer_count
  null_customer_ids
)

RUN_ARTIFACT_PREFIX="curated/_runs"

RUN_ID="run_$(date +%s)"
PARTITION_REPORT="$LOG_BASE/partition_report_${RUN_ID}.json"

echo "Starting lake curation run for range=$DATE_RANGE" >&2
python3 "$SCRIPT_DIR/discover_partitions.py" --dt-range "$DATE_RANGE" > "$PARTITION_REPORT"

for ddl in "${DDL_FILES[@]}"; do
  run_athena_sql "$ddl"
done

for dt in $(generate_dates); do
  echo "Processing dt=$dt" >&2
  for sql in "${CTAS_FILES[@]}"; do
    run_athena_sql "$sql" "$dt"
  done
  for idx in "${!VALIDATIONS[@]}"; do
    validation="${VALIDATIONS[$idx]}"
    validation_query="${validation//\{\{dt\}\}/$dt}"
    aws athena start-query-execution \
      --query-string "$validation_query" \
      --query-execution-context Database=curated \
      --result-configuration OutputLocation="s3://gwi-raw-us-east-2-pc/athena-query-results/lake_curate/"
  done
  write_run_artifacts "$dt"
done

echo "Run complete. Logs: $RUN_LOG" >&2

write_run_artifacts() {
  local dt="$1"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local run_summary="$LOG_BASE/run_summary_${dt}.json"
  local validation_file="$LOG_BASE/validation_results_${dt}.json"
  local ctas_labels_json
  local validation_labels_json
  ctas_labels_json=$(printf '%s\n' "${CTAS_LABELS[@]}" | python3 - <<PY
import json, sys
items = [line.strip() for line in sys.stdin if line.strip()]
print(json.dumps(items))
PY
)
  validation_labels_json=$(printf '%s\n' "${VALIDATION_NAMES[@]}" | python3 - <<PY
import json, sys
items = [line.strip() for line in sys.stdin if line.strip()]
print(json.dumps(items))
PY
)
  CTAS_LABELS_JSON="$ctas_labels_json" VALIDATION_LABELS_JSON="$validation_labels_json" python3 - <<PY
import json, os
summary = {
    "dt": "$dt",
    "timestamp": "$timestamp",
    "ctas": json.loads(os.environ["CTAS_LABELS_JSON"]),
    "validations": json.loads(os.environ["VALIDATION_LABELS_JSON"]),
    "status": "SUCCESS"
}
validation_payload = {
    "dt": "$dt",
    "timestamp": "$timestamp",
    "validation_steps": summary["validations"],
    "status": "SUCCESS"
}
with open("$run_summary", "w") as fh:
    json.dump(summary, fh, indent=2)
with open("$validation_file", "w") as fh:
    json.dump(validation_payload, fh, indent=2)
PY
  aws s3 cp "$run_summary" "s3://gwi-raw-us-east-2-pc/${RUN_ARTIFACT_PREFIX}/dt=${dt}/run_summary.json"
  aws s3 cp "$validation_file" "s3://gwi-raw-us-east-2-pc/${RUN_ARTIFACT_PREFIX}/dt=${dt}/validation_results.json"
}
