#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="${HOME}/gaiia_ingest"
S3_BUCKET="s3://gwi-raw-us-east-2-pc"
S3_RAW_PREFIX="raw/gaiia"
S3_HEARTBEAT_PREFIX="${S3_RAW_PREFIX}/heartbeat"
REQUIRED_ENV_VARS=(GAIIA_API_TOKEN GAIIA_BASE_URL)
GAIIA_AUTH_HEADER="${GAIIA_AUTH_HEADER:-X-Gaiia-Api-Key}"
GAIIA_AUTH_PREFIX="${GAIIA_AUTH_PREFIX:-}"
REQUIRED_COMMANDS=(curl jq aws tee date)

log() {
  printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"
}

require_env_vars() {
  for var in "${REQUIRED_ENV_VARS[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      log "Missing required environment variable: $var"
      exit 1
    fi
  done

  if [[ -z "${GAIIA_LYMEFIBER_KEY:-}" || -z "${GAIIA_DVFIBER_KEY:-}" ]]; then
    log "Warning: GAIIA_LYMEFIBER_KEY or GAIIA_DVFIBER_KEY is not set; discovery/tenant scripts expect both."
  fi

  GAIIA_BASE_URL="${GAIIA_BASE_URL%/}"
}

require_commands() {
  for cmd in "${REQUIRED_COMMANDS[@]}"; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      log "Command not found: $cmd"
      exit 1
    fi
  done
}

init_run() {
  local object_name="$1"

  require_env_vars
  require_commands

  RUN_DATE=$(date -u +%F)
  RUN_TS=$(date -u +%Y-%m-%d_%H-%M-%S)
  OBJECT_NAME="$object_name"
  OBJECT_RUN_DIR="${BASE_DIR}/${RUN_DATE}/${OBJECT_NAME}/${RUN_TS}"
  META_DIR="${BASE_DIR}/meta/${OBJECT_NAME}"
  LOG_FILE="${OBJECT_RUN_DIR}/run.log"

  mkdir -p "$OBJECT_RUN_DIR" "$META_DIR"
  exec > >(tee -a "$LOG_FILE") 2>&1

  log "Initialized ingest run for ${OBJECT_NAME}"
  log "Run directory: ${OBJECT_RUN_DIR}"
  log "Log file: ${LOG_FILE}"

  did_fail=0
  trap 'on_failure' ERR
  trap 'finalize_run' EXIT
}

max_iso_timestamp() {
  local current="${1:-}"
  local candidate="${2:-}"
  if [[ -z "$candidate" ]]; then
    printf '%s' "$current"
    return
  fi
  if [[ -z "$current" || "$candidate" > "$current" ]]; then
    printf '%s' "$candidate"
  else
    printf '%s' "$current"
  fi
}

meta_file_path() {
  local name="$1"
  printf '%s/%s.txt' "$META_DIR" "$name"
}

load_meta_value() {
  local name="$1"
  local default="$2"
  local local_file
  local_file=$(meta_file_path "$name")
  if aws s3 cp "${S3_BUCKET}/${S3_RAW_PREFIX}/${OBJECT_NAME}/meta/${name}.txt" "$local_file" >/dev/null 2>&1; then
    cat "$local_file"
  else
    printf '%s' "$default"
  fi
}

save_meta_value() {
  local name="$1"
  local value="$2"
  local local_file
  local_file=$(meta_file_path "$name")
  printf '%s' "$value" > "$local_file"
  aws s3 cp "$local_file" "${S3_BUCKET}/${S3_RAW_PREFIX}/${OBJECT_NAME}/meta/${name}.txt" --only-show-errors >/dev/null
}

load_last_offset() {
  local offset
  offset=$(load_meta_value "last_offset" "0")
  printf '%s' "$offset"
}

save_last_offset() {
  local offset="$1"
  save_meta_value "last_offset" "$offset"
}

load_last_updated() {
  local updated
  updated=$(load_meta_value "last_updated" "1970-01-01T00:00:00Z")
  printf '%s' "$updated"
}

save_last_updated() {
  local timestamp="$1"
  save_meta_value "last_updated" "$timestamp"
}

confirm_connectivity() {
  local connectivity_file="${OBJECT_RUN_DIR}/connectivity.json"
  local url="${GAIIA_BASE_URL}/customers?limit=1"
  log "Confirming connectivity against ${url}"
  local http_code
  http_code=$(curl -sS -H "${GAIIA_AUTH_HEADER}: ${GAIIA_AUTH_PREFIX}${GAIIA_API_TOKEN}" -o "$connectivity_file" -w "%{http_code}" "$url")
  if [[ "$http_code" != "200" ]]; then
    log "Connectivity check failed with HTTP ${http_code}"
    cat "$connectivity_file"
    exit 1
  fi
  log "Connectivity check succeeded; saved sample to ${connectivity_file}"
}

write_heartbeat() {
  local status="$1"
  local message="$2"
  local file="${OBJECT_RUN_DIR}/${status}.txt"
  {
    printf '%s\n' "$(date -u +%FT%TZ)"
    printf '%s\n' "$message"
  } > "$file"
  aws s3 cp "$file" "${S3_BUCKET}/${S3_HEARTBEAT_PREFIX}/${status}_${OBJECT_NAME}_${RUN_TS}.txt" --only-show-errors >/dev/null
}

on_failure() {
  if [[ "${did_fail:-0}" -eq 0 ]]; then
    did_fail=1
    log "Detected error; uploading failure heartbeat"
    write_heartbeat "failure" "Failure detected; see ${LOG_FILE}"
  fi
}

finalize_run() {
  if [[ "${did_fail:-0}" -eq 0 ]]; then
    log "Run complete; uploading success heartbeat"
    write_heartbeat "success" "Data stored for ${OBJECT_NAME}; run directory ${OBJECT_RUN_DIR}"
  fi
}
