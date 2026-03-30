#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-2}"
S3_BUCKET="s3://gwi-raw-us-east-2-pc"
WORKGROUP="${ATHENA_WORKGROUP:-primary}"
OUTPUT="${ATHENA_OUTPUT_LOCATION:-s3://gwi-raw-us-east-2-pc/athena-results/}"
RUN_DATE="${RUN_DATE:-$(date +%F)}"
ALLOW_DAYS="${ALLOW_DAYS:-7}"
REQUIRE_SOURCE_PARITY_PROOF="${REQUIRE_SOURCE_PARITY_PROOF:-true}"

fail() {
  echo "FAIL: $*" >&2
  exit 2
}

latest_dt_from_dt_prefix() {
  local prefix="$1"
  aws s3 ls "${S3_BUCKET}/${prefix}" --region "$AWS_REGION" \
    | awk '{print $2}' \
    | sed 's:/$::' \
    | awk -F= '$1=="dt" {print $2}' \
    | awk '$0 ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/ {print $0}' \
    | sort \
    | tail -n 1
}

latest_dt_size() {
  local prefix="$1" dt="$2"
  aws s3 ls "${S3_BUCKET}/${prefix}dt=${dt}/" --region "$AWS_REGION" \
    | awk 'BEGIN{sum=0} {sum+=$3} END{print sum+0}'
}

check_dt_prefix() {
  local label="$1" prefix="$2"
  local dt
  dt=$(latest_dt_from_dt_prefix "$prefix" 2>/dev/null || true)
  if [ -z "$dt" ]; then
    fail "${label} missing dt partitions at ${prefix}"
  fi
  local size
  size=$(latest_dt_size "$prefix" "$dt")
  if [ "$size" -le 0 ]; then
    fail "${label} latest dt ${dt} at ${prefix}dt= is zero bytes"
  fi
  echo "OK: ${label} latest_dt=${dt} bytes=${size}"
}

run_query_scalar() {
  local sql="$1"
  local qid
  qid=$(aws athena start-query-execution \
    --work-group "$WORKGROUP" \
    --result-configuration OutputLocation="$OUTPUT" \
    --query-string "$sql" \
    --output text --query 'QueryExecutionId')
  local state
  for _ in {1..120}; do
    state=$(aws athena get-query-execution --query-execution-id "$qid" --output text --query 'QueryExecution.Status.State')
    if [ "$state" = "SUCCEEDED" ]; then
      break
    fi
    if [ "$state" = "FAILED" ] || [ "$state" = "CANCELLED" ]; then
      echo "ERROR: Athena query failed (qid=${qid})" >&2
      aws athena get-query-execution --query-execution-id "$qid" --output json >&2
      exit 2
    fi
    sleep 1
  done
  aws athena get-query-results --query-execution-id "$qid" --output text --query 'ResultSet.Rows[1].Data[0].VarCharValue'
}

within_days() {
  local date_val="$1"
  local max_age="$2"
  if [ -z "$date_val" ]; then
    return 1
  fi
  local cutoff
  cutoff=$(date -u -v-"${max_age}"d +%F)
  [[ "$date_val" > "$cutoff" || "$date_val" == "$cutoff" ]]
}

printf 'SSOT Platt gates start: %s\n' "$(date -u +%FT%TZ)"

check_dt_prefix "platt iheader raw" "raw/platt/iheader/"
check_dt_prefix "platt idetail raw" "raw/platt/idetail/"
check_dt_prefix "platt customer raw" "raw/platt/customer/"
check_dt_prefix "platt custrate raw" "raw/platt/custrate/"

ssot_count=$(run_query_scalar "SELECT count(*) FROM curated_platt.iheader")
if [ -z "$ssot_count" ] || [ "$ssot_count" -le 0 ]; then
  fail "curated_platt.iheader count is zero"
fi

ssot_max=$(run_query_scalar "SELECT max(date) FROM curated_platt.iheader")
if ! within_days "$ssot_max" "$ALLOW_DAYS"; then
  fail "curated_platt.iheader max billdate ${ssot_max} older than ${ALLOW_DAYS} days"
fi

cust_count=$(run_query_scalar "SELECT count(*) FROM curated_platt.customer")
if [ -z "$cust_count" ] || [ "$cust_count" -le 0 ]; then
  fail "curated_platt.customer count is zero"
fi

rate_count=$(run_query_scalar "SELECT count(*) FROM curated_platt.custrate")
if [ -z "$rate_count" ] || [ "$rate_count" -le 0 ]; then
  fail "curated_platt.custrate count is zero"
fi

if [ "$REQUIRE_SOURCE_PARITY_PROOF" = "true" ]; then
  proof_key="ssot_proofs/platt/run_date=${RUN_DATE}/source_parity.json"
  if ! aws s3 ls "${S3_BUCKET}/${proof_key}" --region "$AWS_REGION" >/dev/null 2>&1; then
    fail "missing required source parity proof at s3://${proof_key}"
  fi
  echo "OK: source parity proof present at s3://${proof_key}"
fi

printf 'SSOT Platt gates PASS\n'
