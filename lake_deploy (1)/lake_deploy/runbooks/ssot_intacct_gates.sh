#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-2}"
S3_BUCKET="s3://gwi-raw-us-east-2-pc"
ROOT_PREFIX="raw/intacct_json"

REQUIRED_OBJECTS=(
  "gl_entries"
  "gl_accounts"
  "customers"
  "vendors"
  "ap_bills"
  "ap_payments"
  "ar_invoices"
  "ar_invoice_items"
  "ar_payments"
)

fail() {
  echo "FAIL: $*" >&2
  exit 2
}

latest_run_date() {
  local obj="$1"
  local prefix
  prefix=$(latest_run_prefix "$obj")
  if [ -z "$prefix" ]; then
    echo ""
    return 0
  fi
  echo "$prefix" | sed 's/^run_date=//'
}

latest_run_prefix() {
  local obj="$1"
  local rows
  rows=$(aws s3 ls "${S3_BUCKET}/${ROOT_PREFIX}/${obj}/" --region "$AWS_REGION" 2>/dev/null \
    | awk '{print $2}' \
    | sed 's:/$::' \
    | awk -F= '{d=$NF; if (d ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) print d" "$0}')
  if [ -z "$rows" ]; then
    echo ""
    return 0
  fi
  while read -r dt prefix; do
    [ -z "$dt" ] && continue
    local size
    size=$(aws s3 ls "${S3_BUCKET}/${ROOT_PREFIX}/${obj}/${prefix}/" --region "$AWS_REGION" \
      | awk 'BEGIN{sum=0} {sum+=$3} END{print sum+0}')
    if [ "$size" -gt 0 ]; then
      echo "$prefix"
      return 0
    fi
    echo "WARN: ${obj} run_date ${dt} is zero bytes; skipping" >&2
  done <<< "$(echo "$rows" | sort -r)"
  echo ""
}

latest_run_size() {
  local obj="$1" dt="$2"
  local prefix
  prefix=$(latest_run_prefix "$obj")
  if [ -z "$prefix" ]; then
    echo 0
    return 0
  fi
  aws s3 ls "${S3_BUCKET}/${ROOT_PREFIX}/${obj}/${prefix}/" --region "$AWS_REGION" \
    | awk 'BEGIN{sum=0} {sum+=$3} END{print sum+0}'
}

zero_runs_last_n_days() {
  local obj="$1" days="$2"
  local cutoff
  cutoff=$(date -u -v-${days}d +%F)
  aws s3 ls "${S3_BUCKET}/${ROOT_PREFIX}/${obj}/" --region "$AWS_REGION" 2>/dev/null \
    | awk '{print $2" "$3}' \
    | sed 's:/$::' \
    | awk -v c="$cutoff" '{d=$1; sub(/^run_date=/,"",d); if (d ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/ && d>=c) print d" "$2}' \
    | awk '$2==0 {print $1}' \
    | sort -u
}

get_gl_entries_metadata() {
  local dt="$1"
  local tmp="/tmp/gl_entries_metadata_${dt}.json"
  if aws s3 cp "${S3_BUCKET}/${ROOT_PREFIX}/gl_entries/_meta/run_date=${dt}/metadata.json" "$tmp" --region "$AWS_REGION" >/dev/null 2>&1; then
    cat "$tmp"
  else
    echo ""
  fi
}

printf 'SSOT Intacct gates start: %s\n' "$(date -u +%FT%TZ)"

for obj in "${REQUIRED_OBJECTS[@]}"; do
  dt=$(latest_run_date "$obj")
  if [ -z "$dt" ]; then
    fail "missing object prefix or no run_date for ${obj}"
  fi
  size=$(latest_run_size "$obj" "$dt")
  if [ "$size" -le 0 ]; then
    fail "latest run_date ${dt} for ${obj} is zero bytes"
  fi
  zeros=$(zero_runs_last_n_days "$obj" 30 || true)
  if [ -n "$zeros" ]; then
    echo "WARN: ${obj} has zero-byte runs in last 30 days: ${zeros}" >&2
  fi
  printf "OK: %s latest=%s bytes=%s\n" "$obj" "$dt" "$size"

done

# GL entries metadata sanity
latest_gl_dt=$(latest_run_date "gl_entries")
meta=$(get_gl_entries_metadata "$latest_gl_dt")
if [ -z "$meta" ]; then
  echo "WARN: gl_entries metadata.json missing for run_date=${latest_gl_dt}" >&2
else
  echo "$meta" | python3 - <<'PY'
import json,sys
try:
    j=json.load(sys.stdin)
except Exception:
    print("WARN: gl_entries metadata not parseable", file=sys.stderr)
    sys.exit(0)
rc=j.get('record_count',0)
status=j.get('status')
if status != 'success' or rc == 0:
    print(f"FAIL: gl_entries metadata status={status} record_count={rc}", file=sys.stderr)
    sys.exit(2)
print(f"OK: gl_entries metadata status={status} record_count={rc}")
PY
fi

printf 'SSOT Intacct gates PASS\n'
