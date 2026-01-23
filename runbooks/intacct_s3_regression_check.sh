#!/usr/bin/env bash
set -euo pipefail

TODAY="$(date -u '+%F')"
TRIAGE_ROOT="$HOME/intacct_triage/$TODAY"
mkdir -p "$TRIAGE_ROOT"
REPORT="$TRIAGE_ROOT/s3_regression_report.txt"
SAMPLES_DIR="$TRIAGE_ROOT/s3_samples"
mkdir -p "$SAMPLES_DIR"

AWS_BUCKET="gwi-raw-us-east-2-pc"
BASE_PREFIX="raw/intacct_json"

file_size() {
  local path="$1"
  if [[ "$(uname)" == "Darwin" ]]; then
    stat -f%z "$path"
  else
    stat -c%s "$path"
  fi
}

download_and_report() {
  local object="$1"
  local date="$2"
  local suffix="$3"
  local s3_key="${BASE_PREFIX}/${object}/${date}/${suffix}"
  local tmp_path="/tmp/intacct_${object}_${date}.json"
  local download_key="s3://${AWS_BUCKET}/${s3_key}"

  echo "Checking ${object} ${date}" | tee -a "$REPORT"
  if ! aws s3 cp "$download_key" "$tmp_path" >/dev/null 2>&1; then
    echo "  missing file: $download_key" | tee -a "$REPORT"
    return
  fi

  local bytes
  bytes=$(file_size "$tmp_path")
  local snippet="$SAMPLES_DIR/${object}_${date}.snippet.txt"
  head -c 200 "$tmp_path" > "$snippet"
  cp "$tmp_path" "$SAMPLES_DIR/${object}_${date}.json"

  echo "  downloaded: $download_key" | tee -a "$REPORT"
  echo "  size: ${bytes} bytes" | tee -a "$REPORT"
  echo "  snippet path: $snippet" | tee -a "$REPORT"
  echo "  first 200 bytes:" | tee -a "$REPORT"
  hexdump -C "$tmp_path" | head -n 5 | tee -a "$REPORT" || true
  echo | tee -a "$REPORT"
}

{
  echo "S3 regression check - $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo
  objects=(vendors customers ap_bills ap_payments gl_accounts gl_entries)
  for obj in "${objects[@]}"; do
    download_and_report "$obj" "2026-01-19" "${obj}.json"
    download_and_report "$obj" "2026-01-20" "${obj}.json"
  done
  echo "Additional check: gl_accounts 2026-01-21"
  download_and_report "gl_accounts" "2026-01-21" "gl_accounts.json"
} | tee "$REPORT"

echo "Regression report + snippets saved under $TRIAGE_ROOT"
