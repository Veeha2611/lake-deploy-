#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-2}"
BUCKET="gwi-raw-us-east-2-pc"
S3_BASE="s3://${BUCKET}"
ATHENA_WORKGROUP="${ATHENA_WORKGROUP:-primary}"
ATHENA_OUTPUT_LOCATION="${ATHENA_OUTPUT_LOCATION:-s3://gwi-raw-us-east-2-pc/athena-results/orchestration/}"

DATA_PREFIX="raw/intacct_json/gl_entries/data"
META_PREFIX="raw/intacct_json/gl_entries/_meta"
EVID_PREFIX="curated_recon/intacct_self_audit"

RUN_DATE="${1:-}"

log() {
  printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"
}

latest_run_date() {
  aws s3 ls "${S3_BASE}/${DATA_PREFIX}/" --region "$AWS_REGION" 2>/dev/null \
    | awk '{print $2}' | sed 's:/$::' | awk -F= '{print $2}' \
    | sort | tail -n 1
}

ensure_nonzero_prefix() {
  local prefix="$1"
  local out="$2"
  aws s3 ls "${S3_BASE}/${prefix}/" --region "$AWS_REGION" \
    | awk -v p="$prefix" '{print p"\t"$4"\t"$3}' >> "$out"
  local zeros
  zeros=$(aws s3 ls "${S3_BASE}/${prefix}/" --region "$AWS_REGION" \
    | awk '$3==0 {print $4}' | wc -l | tr -d ' ')
  if [ "${zeros}" != "0" ]; then
    log "FAIL: zero-byte objects under ${prefix}"
    exit 2
  fi
}

run_query() {
  local sql="$1"
  local qid
  qid=$(aws athena start-query-execution \
    --work-group "$ATHENA_WORKGROUP" \
    --result-configuration OutputLocation="$ATHENA_OUTPUT_LOCATION" \
    --query-string "$sql" \
    --output text --query 'QueryExecutionId')
  echo "$qid"
}

wait_query() {
  local qid="$1"
  local state
  while true; do
    state=$(aws athena get-query-execution \
      --query-execution-id "$qid" \
      --output text --query 'QueryExecution.Status.State')
    if [ "$state" == "SUCCEEDED" ] || [ "$state" == "FAILED" ] || [ "$state" == "CANCELLED" ]; then
      echo "$state"
      return 0
    fi
    sleep 2
  done
}

get_value() {
  local qid="$1"
  aws athena get-query-results --query-execution-id "$qid" \
    --output text --query 'ResultSet.Rows[1].Data[0].VarCharValue' 2>/dev/null || true
}

get_row_values() {
  local qid="$1"
  aws athena get-query-results --query-execution-id "$qid" \
    --output text --query 'ResultSet.Rows[1].Data[*].VarCharValue' 2>/dev/null || true
}

detect_gl_entries_partition_col() {
  local qid state val
  qid=$(run_query "SELECT column_name FROM information_schema.columns WHERE table_schema='gwi_raw_intacct' AND table_name='gl_entries' AND column_name IN ('run_date','dt') ORDER BY CASE column_name WHEN 'run_date' THEN 1 ELSE 2 END")
  state=$(wait_query "$qid")
  if [ "$state" != "SUCCEEDED" ]; then
    echo ""
    return 0
  fi
  val=$(get_value "$qid")
  echo "$val"
}

is_date_like() {
  local v="$1"
  if [[ "$v" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    return 0
  fi
  return 1
}

fallback_gl_entries_from_json() {
  local rd="$1"
  local json_s3="s3://${BUCKET}/${DATA_PREFIX}/run_date=${rd}/gl_entries.json"
  if ! aws s3 ls "$json_s3" --region "$AWS_REGION" >/dev/null 2>&1; then
    return 1
  fi
  local out
  out=$(aws s3 cp "$json_s3" - --region "$AWS_REGION" | python3 -c '
import sys, json
from datetime import datetime
min_d=None
max_d=None
count=0
for line in sys.stdin:
    line=line.strip()
    if not line:
        continue
    try:
        obj=json.loads(line)
    except Exception:
        continue
    count+=1
    d=obj.get("ENTRY_DATE") or ""
    try:
        dt=datetime.strptime(d, "%m/%d/%Y")
    except Exception:
        continue
    if min_d is None or dt<min_d: min_d=dt
    if max_d is None or dt>max_d: max_d=dt
min_s=min_d.strftime("%m/%d/%Y") if min_d else ""
max_s=max_d.strftime("%m/%d/%Y") if max_d else ""
print(f"{count}|{min_s}|{max_s}")
')
  echo "$out"
  return 0
}

start_crawlers() {
  local crawlers
  crawlers=$(aws glue get-crawlers --region "$AWS_REGION" \
    --query 'Crawlers[?contains(Name, `intacct`) && contains(Name, `json_crawler`)].Name' \
    --output text)
  for c in $crawlers; do
    aws glue start-crawler --name "$c" --region "$AWS_REGION" >/dev/null 2>&1 || true
  done
  echo "$crawlers"
}

wait_crawlers() {
  local crawlers="$1"
  local deadline=$(( $(date +%s) + 3600 ))
  while true; do
    local all_done="yes"
    for c in $crawlers; do
      local state
      state=$(aws glue get-crawler --name "$c" --region "$AWS_REGION" \
        --query 'Crawler.State' --output text)
      if [ "$state" != "READY" ]; then
        all_done="no"
      fi
    done
    if [ "$all_done" == "yes" ]; then
      return 0
    fi
    if [ "$(date +%s)" -gt "$deadline" ]; then
      log "FAIL: crawlers did not reach READY within 1h"
      exit 2
    fi
    sleep 15
  done
}

if [ -z "$RUN_DATE" ]; then
  RUN_DATE=$(latest_run_date)
fi

if [ -z "$RUN_DATE" ]; then
  log "FAIL: could not determine RUN_DATE"
  exit 2
fi

EVID_S3="${S3_BASE}/${EVID_PREFIX}/dt=${RUN_DATE}"
STATUS_KEY="${EVID_S3}/status.json"

if aws s3 ls "$STATUS_KEY" --region "$AWS_REGION" >/dev/null 2>&1; then
  log "OK: evidence already present for ${RUN_DATE}"
  exit 0
fi

WORK_DIR="/tmp/intacct_self_audit_${RUN_DATE}_$(date +%H%M%S)"
mkdir -p "$WORK_DIR"

log "Recon start for run_date=${RUN_DATE}"

# S3 object integrity (gl_entries)
OBJ_TSV="${WORK_DIR}/object_integrity.tsv"
echo -e "prefix\tobject\tbytes" > "$OBJ_TSV"
ensure_nonzero_prefix "${DATA_PREFIX}/run_date=${RUN_DATE}" "$OBJ_TSV"
if aws s3 ls "${S3_BASE}/${META_PREFIX}/run_date=${RUN_DATE}/" --region "$AWS_REGION" >/dev/null 2>&1; then
  ensure_nonzero_prefix "${META_PREFIX}/run_date=${RUN_DATE}" "$OBJ_TSV"
fi

# Glue crawlers
log "Starting Intacct crawlers"
CRAWLERS=$(start_crawlers)
wait_crawlers "$CRAWLERS"
aws glue get-crawlers --region "$AWS_REGION" \
  --query 'Crawlers[?contains(Name, `intacct`) && contains(Name, `json_crawler`)]' \
  --output json > "${WORK_DIR}/glue_crawler_status.json"

# Athena checks
QIDS_TSV="${WORK_DIR}/qids.tsv"
VALUES_JSON="${WORK_DIR}/athena_values.json"
echo -e "name\tqid\tstate" > "$QIDS_TSV"

VAL_GL_ENTRIES_COUNT=""
VAL_GL_ENTRIES_MIN=""
VAL_GL_ENTRIES_MAX=""
VAL_CURATED_COUNT=""
VAL_EXCEPTIONS_COUNT=""

log "Running Athena checks"
PART_COL=$(detect_gl_entries_partition_col)
if [ -z "$PART_COL" ]; then
  log "WARN: could not detect gl_entries partition column (run_date/dt)."
fi

if is_date_like "$RUN_DATE" && [ -n "$PART_COL" ]; then
  qid=$(run_query "SELECT count(*) FROM gwi_raw_intacct.gl_entries WHERE ${PART_COL}='${RUN_DATE}'")
  state=$(wait_query "$qid")
  echo -e "gl_entries_count_run_date\t${qid}\t${state}" >> "$QIDS_TSV"
  if [ "$state" == "SUCCEEDED" ]; then
    VAL_GL_ENTRIES_COUNT=$(get_value "$qid")
  fi

  qid=$(run_query "SELECT min(entry_date), max(entry_date) FROM gwi_raw_intacct.gl_entries WHERE ${PART_COL}='${RUN_DATE}'")
  state=$(wait_query "$qid")
  echo -e "gl_entries_date_range_run_date\t${qid}\t${state}" >> "$QIDS_TSV"
  if [ "$state" == "SUCCEEDED" ]; then
    read -r vmin vmax <<<"$(get_row_values "$qid")"
    VAL_GL_ENTRIES_MIN="$vmin"
    VAL_GL_ENTRIES_MAX="$vmax"
  fi
else
  # Non-date run_date: derive count + date range from JSON file
  log "INFO: run_date=${RUN_DATE} is not date-like; deriving GL entry stats from JSON."
  stats=$(fallback_gl_entries_from_json "$RUN_DATE" || true)
  if [ -n "$stats" ]; then
    VAL_GL_ENTRIES_COUNT=${stats%%|*}
    rem=${stats#*|}
    VAL_GL_ENTRIES_MIN=${rem%%|*}
    VAL_GL_ENTRIES_MAX=${rem##*|}
    echo -e "gl_entries_count_run_date\tlocal_json\tLOCAL" >> "$QIDS_TSV"
    echo -e "gl_entries_date_range_run_date\tlocal_json\tLOCAL" >> "$QIDS_TSV"
  else
    log "WARN: could not derive GL entry stats from JSON for ${RUN_DATE}"
  fi
fi

qid=$(run_query "SELECT count(*) FROM curated_core.intacct_gl_entries_current_ssot")
state=$(wait_query "$qid")
echo -e "curated_current_ssot_count\t${qid}\t${state}" >> "$QIDS_TSV"
if [ "$state" == "SUCCEEDED" ]; then
  VAL_CURATED_COUNT=$(get_value "$qid")
fi

qid=$(run_query "SELECT count(*) FROM curated_recon.intacct_gl_entries_exceptions")
state=$(wait_query "$qid")
echo -e "curated_exceptions_count\t${qid}\t${state}" >> "$QIDS_TSV"
if [ "$state" == "SUCCEEDED" ]; then
  VAL_EXCEPTIONS_COUNT=$(get_value "$qid")
fi

cat > "$VALUES_JSON" <<EOF
{
  "gl_entries_count_run_date": "${VAL_GL_ENTRIES_COUNT}",
  "gl_entries_min_entry_date": "${VAL_GL_ENTRIES_MIN}",
  "gl_entries_max_entry_date": "${VAL_GL_ENTRIES_MAX}",
  "curated_current_ssot_count": "${VAL_CURATED_COUNT}",
  "curated_exceptions_count": "${VAL_EXCEPTIONS_COUNT}"
}
EOF

# Write status marker
cat > "${WORK_DIR}/status.json" <<EOF
{
  "run_date": "${RUN_DATE}",
  "status": "complete",
  "generated_utc": "$(date -u +%FT%TZ)"
}
EOF

log "Uploading evidence to ${EVID_S3}"
aws s3 cp "${WORK_DIR}/" "${EVID_S3}/" --recursive --region "$AWS_REGION" >/dev/null 2>&1 || true

log "Recon complete for ${RUN_DATE}"
