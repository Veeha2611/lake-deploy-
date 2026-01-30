#!/usr/bin/env bash
set -euo pipefail

run_gaiia_ingest() {
  local object="$1"
  local limit="${2:-100}"
  local last_updated
  local offset
  local records_this_run=0
  local s3_target
  local max_updated

  last_updated=$(load_last_updated)
  offset=$(load_last_offset)
  max_updated="$last_updated"
  local data_file="${OBJECT_RUN_DIR}/${object}.ndjson"
  : > "$data_file"

  log "Beginning ${object} ingest (updated_after=${last_updated}, resume_offset=${offset})"

  while true; do
    local page_file="${OBJECT_RUN_DIR}/${object}_page_${offset}.json"
    local url="${GAIIA_BASE_URL}/${object}?limit=${limit}&offset=${offset}&updated_after=${last_updated}"
    log "Requesting ${url}"
    local http_code
    http_code=$(curl -sS -H "Authorization: Bearer ${GAIIA_API_TOKEN}" -o "$page_file" -w "%{http_code}" "$url")
    if [[ "$http_code" != "200" ]]; then
      log "Non-200 response (${http_code}) when hitting ${url}"
      exit 1
    fi

    local page_count
    page_count=$(jq -r 'if type == "array" then length elif has("data") and (.data|type == "array") then (.data|length) else 0 end' "$page_file")
    if [[ "$page_count" -eq 0 ]]; then
      log "API returned zero records for offset ${offset}"
      break
    fi

    jq -c 'if type == "array" then .[] elif has("data") and (.data|type == "array") then .data[] else empty end' "$page_file" >> "$data_file"

    local page_max
    page_max=$(jq -r 'if type == "array" then .[] elif has("data") and (.data|type == "array") then .data[] else empty end | select(.updated_at != null) | .updated_at' "$page_file" | sort | tail -n1 || true)
    if [[ -n "$page_max" ]]; then
      max_updated=$(max_iso_timestamp "$max_updated" "$page_max")
    fi

    records_this_run=$((records_this_run + page_count))
    offset=$((offset + limit))
    save_last_offset "$offset"

    log "Processed ${page_count} rows in this page (total so far: ${records_this_run})"
    if [[ "$page_count" -lt "$limit" ]]; then
      log "Page count ${page_count} < limit ${limit}; finishing pagination"
      break
    fi
  done

  log "Recording ${records_this_run} total records for ${object}"

  s3_target="${S3_BUCKET}/${S3_RAW_PREFIX}/${object}/${RUN_DATE}/${object}_${RUN_TS}.json"
  aws s3 cp "$data_file" "$s3_target" --only-show-errors >/dev/null
  log "Uploaded ${data_file} to ${s3_target}"

  save_last_updated "$max_updated"
  save_last_offset 0
}
