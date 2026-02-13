#!/usr/bin/env bash

############################################################
# 0. CRON-SAFE ENVIRONMENT LOADING
############################################################

source $HOME/.bash_profile 2>/dev/null || true
source $HOME/.zshrc 2>/dev/null || true
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Intacct env (shared)
source "$HOME/intacct_env.sh" 2>/dev/null || true

############################################################
# 1. USER-DEFINED CREDENTIALS (FROM ENV FILE)
############################################################

SENDER_ID="${INTACCT_SENDER_ID:?Missing INTACCT_SENDER_ID}"
SENDER_PASSWORD="${INTACCT_SENDER_PASSWORD:?Missing INTACCT_SENDER_PASSWORD}"

WS_USER_ID="${INTACCT_WS_USER_ID:?Missing INTACCT_WS_USER_ID}"
WS_USER_PASSWORD="${INTACCT_WS_USER_PASSWORD:?Missing INTACCT_WS_USER_PASSWORD}"
COMPANY_ID="${INTACCT_COMPANY_ID:?Missing INTACCT_COMPANY_ID}"
LOCATION_ID="${LOCATION_ID:-}"

INTACCT_ENDPOINT="${INTACCT_ENDPOINT_URL:-https://api.intacct.com/ia/xml/xmlgw.phtml}"
S3_BUCKET="s3://gwi-raw-us-east-2-pc"
S3_XML_PREFIX="raw/intacct_xml"
S3_JSON_PREFIX="raw/intacct_json"
S3_HEARTBEAT_PREFIX="raw/intacct/heartbeat"
READ_OBJECT_PAGE_SIZE="${READ_OBJECT_PAGE_SIZE:-1000}"
INTACCT_HTTP_RETRY_MAX="${INTACCT_HTTP_RETRY_MAX:-5}"
INTACCT_HTTP_RETRY_SLEEP_BASE_SECONDS="${INTACCT_HTTP_RETRY_SLEEP_BASE_SECONDS:-5}"
GL_ENTRIES_RESUME_FROM_S3="${GL_ENTRIES_RESUME_FROM_S3:-1}"
GL_ENTRIES_START_RECORDNO="${GL_ENTRIES_START_RECORDNO:-0}"

GL_ENTRIES_LOOKBACK_DAYS="${GL_ENTRIES_LOOKBACK_DAYS:-730}"
GL_ENTRIES_FILTER_DATE="${GL_ENTRIES_FILTER_DATE:-$(python3 - <<'PY'
from datetime import datetime, timedelta
import os

days = int(os.environ.get("GL_ENTRIES_LOOKBACK_DAYS", "730"))
print((datetime.utcnow() - timedelta(days=days)).strftime("%m/%d/%Y"))
PY
)}"
GL_ENTRIES_OBJECT="${GL_ENTRIES_OBJECT:-GLENTRY}"
GL_ENTRIES_GENERAL_LEDGER="${GL_ENTRIES_GENERAL_LEDGER:-}"
GL_ENTRIES_EXTRA_QUERY="${GL_ENTRIES_EXTRA_QUERY:-}"

join_filters() {
  local joined=""
  for part in "$@"; do
    if [ -z "$part" ]; then
      continue
    fi
    if [ -z "$joined" ]; then
      joined="$part"
    else
      joined="${joined} AND ${part}"
    fi
  done
  printf "%s" "$joined"
}

xml_escape() {
  # Escape XML special chars for Intacct query payload
  # Avoid breaking request when query includes <= or >=
  printf '%s' "$1" | sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g' \
    -e "s/\"/\&quot;/g" \
    -e "s/'/\&apos;/g"
}

GL_ENTRIES_DEFAULT_QUERY="ENTRY_DATE >= '${GL_ENTRIES_FILTER_DATE}'"
GL_ENTRIES_FILTERS=("$GL_ENTRIES_DEFAULT_QUERY")
[ -n "$GL_ENTRIES_GENERAL_LEDGER" ] && GL_ENTRIES_FILTERS+=("GENERALLEDGER = '${GL_ENTRIES_GENERAL_LEDGER}'")
[ -n "$LOCATION_ID" ] && GL_ENTRIES_FILTERS+=("LOCATIONID = '${LOCATION_ID}'")
[ -n "$GL_ENTRIES_EXTRA_QUERY" ] && GL_ENTRIES_FILTERS+=("${GL_ENTRIES_EXTRA_QUERY}")

GL_ENTRIES_COMBINED_QUERY="$(join_filters "${GL_ENTRIES_FILTERS[@]}")"
GL_ENTRIES_QUERY="${GL_ENTRIES_QUERY:-${GL_ENTRIES_COMBINED_QUERY}}"
GL_ENTRIES_BASE_QUERY="${GL_ENTRIES_QUERY}"
GL_ENTRIES_QUERY_BLOCK="${GL_ENTRIES_QUERY_BLOCK:-          <query>${GL_ENTRIES_QUERY}</query>}"
PAGINATION_SMOKE_TEST="${PAGINATION_SMOKE_TEST:-0}"
GL_ENTRIES_PAGE_SIZE="${GL_ENTRIES_PAGE_SIZE:-1000}"
GL_ENTRIES_PAGINATION_MODE="${GL_ENTRIES_PAGINATION_MODE:-recordno}"

############################################################
# 2. LOGGING SETUP
############################################################

RUN_DATE="${RUN_DATE:-$(date +%F)}"
RUN_TIMESTAMP=$(date +%F_%H-%M-%S)
S3_GL_ENTRIES_DATA_PREFIX="${S3_BUCKET}/${S3_JSON_PREFIX}/gl_entries/data/run_date=${RUN_DATE}"
S3_GL_ENTRIES_META_PREFIX="${S3_BUCKET}/${S3_JSON_PREFIX}/gl_entries/_meta/run_date=${RUN_DATE}"
S3_GL_ENTRIES_CHECKPOINT_PREFIX="${S3_BUCKET}/${S3_JSON_PREFIX}/gl_entries/run_date=${RUN_DATE}/checkpoints"

BASE_DIR="${BASE_DIR:-$HOME/intacct_ingest/$RUN_DATE}"
LOG_DIR="${LOG_DIR:-$HOME/intacct_ingest/logs}"

mkdir -p "$BASE_DIR"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/ingest_${RUN_TIMESTAMP}.log"
exec > "$LOG_FILE" 2>&1

DATA_QUALITY_FILE="$BASE_DIR/data_quality_summary.txt"

echo "Running Intacct ingest for ${COMPANY_ID} (${INTACCT_ENDPOINT})"
echo "GLENTRY query lookback: last ${GL_ENTRIES_LOOKBACK_DAYS} days (object: ${GL_ENTRIES_OBJECT}, filter: ${GL_ENTRIES_QUERY})"

############################################################
# 3. FAILURE NOTIFICATION
############################################################

notify_failure() {
  echo "Intacct ingest FAILED at $(date)" > "$BASE_DIR/failure.txt"
  aws s3 cp "$BASE_DIR/failure.txt" \
    "${S3_BUCKET}/${S3_HEARTBEAT_PREFIX}/failure_${RUN_TIMESTAMP}.txt"
}

write_gl_entries_metadata() {
  local status="${1:-unknown}"
  local record_count="${2:-0}"
  local message="${3:-}"
  local json_s3_uri="${4:-}"
  local json_s3_status="${5:-}"
  local ts_utc
  ts_utc="$(date -u +%FT%TZ)"

  cat > /tmp/gl_entries_metadata.json <<EOF
{
  "status": "${status}",
  "record_count": ${record_count},
  "run_date": "${RUN_DATE}",
  "generated_utc": "${ts_utc}",
  "general_ledger": "${GL_ENTRIES_GENERAL_LEDGER:-}",
  "object": "${GL_ENTRIES_OBJECT:-}",
  "extra_query": "${GL_ENTRIES_EXTRA_QUERY:-}",
  "lookback_days": "${GL_ENTRIES_LOOKBACK_DAYS:-}",
  "message": "$(printf '%s' "${message}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])')",
  "json_s3_uri": "${json_s3_uri:-}",
  "json_s3_upload_status": "${json_s3_status:-}"
}
EOF

  aws s3 cp /tmp/gl_entries_metadata.json "${S3_GL_ENTRIES_META_PREFIX}/metadata.json" --region "${AWS_REGION}"
}

write_gl_entries_checkpoint() {
  local mode="${1:-recordno}"
  local page_in="${2:-0}"
  local last_recordno_in="${3:-0}"
  local total_rows_in="${4:-0}"
  local max_entry_date_in="${5:-}"
  local resultstart_in="${6:-0}"
  local resultid_in="${7:-}"
  local checkpoint_path="/tmp/gl_entries_checkpoint.json"
  local ts_utc
  ts_utc="$(date -u +%FT%TZ)"

  cat > "${checkpoint_path}" <<EOF
{
  "run_date": "${RUN_DATE}",
  "mode": "${mode}",
  "page": ${page_in},
  "last_recordno": ${last_recordno_in},
  "total_rows": ${total_rows_in},
  "max_entry_date": "${max_entry_date_in}",
  "resultstart": ${resultstart_in},
  "resultid": "${resultid_in}",
  "updated_utc": "${ts_utc}"
}
EOF

  aws s3 cp "${checkpoint_path}" "${S3_GL_ENTRIES_CHECKPOINT_PREFIX}/latest.json" --region "${AWS_REGION}" >/dev/null 2>&1 || true
  if [ "${page_in}" -gt 0 ]; then
    aws s3 cp "${checkpoint_path}" "${S3_GL_ENTRIES_CHECKPOINT_PREFIX}/page_${page_in}.json" --region "${AWS_REGION}" >/dev/null 2>&1 || true
  fi
}

set -e
trap notify_failure ERR


############################################################
# 4. AUTHENTICATE TO SAGE INTACCT
############################################################

LOGIN_XML="$BASE_DIR/login.xml"
LOGIN_RESPONSE="$BASE_DIR/login_response.xml"

cat > "$LOGIN_XML" <<EOF
<request>
  <control>
    <senderid>${SENDER_ID}</senderid>
    <password>${SENDER_PASSWORD}</password>
    <controlid>loginTest</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <login>
        <userid>${WS_USER_ID}</userid>
        <companyid>${COMPANY_ID}</companyid>
        <password>${WS_USER_PASSWORD}</password>
$(if [ -n "$LOCATION_ID" ]; then printf '        <locationid>%s</locationid>\n' "$LOCATION_ID"; fi)
      </login>
    </authentication>
    <content>
      <function controlid="getSession">
        <getAPISession/>
      </function>
    </content>
  </operation>
</request>
EOF

curl -s \
  -H "Content-Type: application/xml" \
  -d @"$LOGIN_XML" \
  "${INTACCT_ENDPOINT}" \
  -o "$LOGIN_RESPONSE"

SESSION_ID=$(sed -n 's:.*<sessionid>\(.*\)</sessionid>.*:\1:p' "$LOGIN_RESPONSE")
if [ -z "$SESSION_ID" ]; then
  echo "Failed to obtain Intacct sessionid; aborting." >&2
  exit 2
fi

############################################################
# 5. PAGINATED READ-BY-QUERY OBJECT PULLS (NDJSON OUTPUT)
############################################################

check_intacct_response() {
  local xml_file="$1"
  if ! looks_like_intacct_xml "$xml_file"; then
    local preview
    preview=$(LC_ALL=C head -c 200 "$xml_file" 2>/dev/null | tr -d '\r' | tr '\n' ' ' || true)
    echo "Intacct API failure: non-XML response (${preview:-empty})" >&2
    return 2
  fi
  local status
  status=$(xq -r '.response.control.status // empty' "$xml_file")
  if [ "$status" = "failure" ]; then
    local err
    err=$(xq -r '.response.errormessage.error[].description2 // .response.errormessage.error[].description // empty' "$xml_file" | paste -sd '; ' -)
    echo "Intacct API failure: ${err:-unknown error}" >&2
    return 2
  fi
  return 0
}

looks_like_intacct_xml() {
  # Intacct XMLGW responses always contain a <response> root element.
  local xml_file="$1"
  [ -s "$xml_file" ] && LC_ALL=C grep -aq '<response' "$xml_file"
}

post_intacct_xml_with_retry() {
  local request_xml="$1"
  local response_xml="$2"
  local label="${3:-request}"

  local attempt=1
  while true; do
    local curl_ec=0
    curl -sS \
      -H "Content-Type: application/xml" \
      -d @"$request_xml" \
      "${INTACCT_ENDPOINT}" \
      -o "$response_xml" || curl_ec=$?

    if looks_like_intacct_xml "$response_xml"; then
      return 0
    fi

    local preview
    preview=$(LC_ALL=C head -c 200 "$response_xml" 2>/dev/null | tr -d '\r' | tr '\n' ' ' || true)
    echo "WARN: non-XML Intacct response for ${label} (attempt ${attempt}/${INTACCT_HTTP_RETRY_MAX}, curl_ec=${curl_ec}): ${preview:-empty}" >&2

    if [ "$attempt" -ge "$INTACCT_HTTP_RETRY_MAX" ]; then
      echo "ERROR: giving up after ${INTACCT_HTTP_RETRY_MAX} non-XML responses for ${label}" >&2
      return 2
    fi

    sleep $((INTACCT_HTTP_RETRY_SLEEP_BASE_SECONDS * attempt))
    attempt=$((attempt + 1))
  done
}

rebuild_gl_entries_json_from_s3_xml_pages() {
  # ResultId runs upload per-page XML to S3. If we have to resume after a failure,
  # we must not lose already-fetched rows. We reconstruct NDJSON from those XML pages.
  #
  # Outputs: "<last_numremaining>|<last_resultid>"
  local run_date="$1"
  local end_page="$2"
  local output_json="$3"

  if [ "$end_page" -le 0 ]; then
    echo "0|"
    return 0
  fi

  local tmpdir
  tmpdir=$(mktemp -d)

  local p=1
  local last_num_remaining=""
  local last_resultid=""

  while [ "$p" -le "$end_page" ]; do
    local s3_uri="${S3_BUCKET}/${S3_XML_PREFIX}/gl_entries/${run_date}/gl_entries_page_${p}.xml"
    local xml_path="${tmpdir}/gl_entries_page_${p}.xml"

    if ! aws s3 cp "$s3_uri" "$xml_path" --region "${AWS_REGION}" >/dev/null 2>&1; then
      echo "ERROR: missing S3 XML page ${p}: ${s3_uri}" >&2
      rm -rf "$tmpdir"
      return 2
    fi

    if ! looks_like_intacct_xml "$xml_path"; then
      local preview
      preview=$(LC_ALL=C head -c 200 "$xml_path" 2>/dev/null | tr -d '\r' | tr '\n' ' ' || true)
      echo "ERROR: S3 XML page ${p} is not valid Intacct XML (${s3_uri}): ${preview:-empty}" >&2
      rm -rf "$tmpdir"
      return 2
    fi

    xq -c '
      .response.operation.result.data
      | .. | arrays | select(length > 0)
      | .[]
    ' "$xml_path" >> "$output_json"

    if [ "$p" -eq "$end_page" ]; then
      local summary
      summary=$(python3 - "$xml_path" <<'PY'
import sys, xml.etree.ElementTree as ET
tree = ET.parse(sys.argv[1])
root = tree.getroot()
data = root.find(".//data")
if data is None:
    print("0|")
else:
    print(f"{data.attrib.get('numremaining','0')}|{data.attrib.get('resultId','')}")
PY
)
      last_num_remaining="${summary%%|*}"
      last_resultid="${summary#*|}"
    fi

    p=$((p + 1))
  done

  rm -rf "$tmpdir"
  echo "${last_num_remaining}|${last_resultid}"
}

pull_object_paginated() {
  local OBJECT_NAME="$1"
  local FILE_BASENAME="$2"
  local QUERY_BLOCK="${3:-          <query/>}"
  local PAGE_SIZE="${4:-${READ_OBJECT_PAGE_SIZE}}"

  local JSON_FILE="$BASE_DIR/${FILE_BASENAME}.json"
  : > "$JSON_FILE"

  local page=1
  local resultid=""

  while true; do
    local PAGE_XML="$BASE_DIR/${FILE_BASENAME}_page_${page}.xml"
    local RAW_XML="$BASE_DIR/${FILE_BASENAME}_page_${page}_response.xml"

    cat > "$PAGE_XML" <<EOF
<request>
  <control>
    <senderid>${SENDER_ID}</senderid>
    <password>${SENDER_PASSWORD}</password>
    <controlid>get${FILE_BASENAME}_page_${page}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <sessionid>${SESSION_ID}</sessionid>
    </authentication>
    <content>
      <function controlid="get${FILE_BASENAME}Page${page}">
        <readByQuery>
          <object>${OBJECT_NAME}</object>
          <fields>*</fields>
$(printf '%s\n' "$QUERY_BLOCK")
          <resultStart>${resultstart}</resultStart>
$(if [ -n "$resultid" ]; then printf '          <resultId>%s</resultId>\n' "$resultid"; fi)
          <pagesize>${PAGE_SIZE}</pagesize>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>
EOF

    curl -s \
      -H "Content-Type: application/xml" \
      -d @"$PAGE_XML" \
      "${INTACCT_ENDPOINT}" \
      -o "$RAW_XML"

    aws s3 cp "$RAW_XML" \
      "${S3_BUCKET}/${S3_XML_PREFIX}/${FILE_BASENAME}/${RUN_DATE}/${FILE_BASENAME}_page_${page}.xml"

    check_intacct_response "$RAW_XML"

    xq -c '
      .response.operation.result.data
      | .. | arrays | select(length > 0)
      | .[]
    ' "$RAW_XML" >> "$JSON_FILE"

    local page_summary
    page_summary=$(python3 - "$RAW_XML" <<'PY'
import sys, xml.etree.ElementTree as ET

tree = ET.parse(sys.argv[1])
root = tree.getroot()
data = root.find(".//data")
if data is None:
    print("0|")
else:
    print(f"{data.attrib.get('numremaining','0')}|{data.attrib.get('resultId','')}")
PY
)

    local num_remaining="${page_summary%%|*}"
    local next_resultid="${page_summary#*|}"

    if [ "$num_remaining" = "0" ] || [ -z "$next_resultid" ]; then
      break
    fi

    resultid="$next_resultid"
    resultstart=$((resultstart + PAGE_SIZE))
    page=$((page + 1))
  done

  aws s3 cp "$JSON_FILE" \
    "${S3_BUCKET}/${S3_JSON_PREFIX}/${FILE_BASENAME}/${RUN_DATE}/${FILE_BASENAME}.json"
}

pull_object_paginated_recordno() {
  local OBJECT_NAME="$1"
  local FILE_BASENAME="$2"
  local BASE_QUERY="${3:-}"
  local PAGE_SIZE="${4:-${READ_OBJECT_PAGE_SIZE}}"

  local JSON_FILE="$BASE_DIR/${FILE_BASENAME}.json"
  : > "$JSON_FILE"

  local page=1
  local last_recordno=0
  local total_rows=0
  local pages=0

  while true; do
    local PAGE_XML="$BASE_DIR/${FILE_BASENAME}_page_${page}.xml"
    local RAW_XML="$BASE_DIR/${FILE_BASENAME}_page_${page}_response.xml"
    local PAGE_JSON="$BASE_DIR/${FILE_BASENAME}_page_${page}.json"

    local cursor_query="RECORDNO > ${last_recordno}"
    local page_query
    if [ -n "$BASE_QUERY" ]; then
      page_query=$(join_filters "${BASE_QUERY}" "$cursor_query")
    else
      page_query="$cursor_query"
    fi
    local page_query_xml
    page_query_xml=$(xml_escape "$page_query")

    cat > "$PAGE_XML" <<EOF
<request>
  <control>
    <senderid>${SENDER_ID}</senderid>
    <password>${SENDER_PASSWORD}</password>
    <controlid>get${FILE_BASENAME}_page_${page}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <sessionid>${SESSION_ID}</sessionid>
    </authentication>
    <content>
      <function controlid="get${FILE_BASENAME}Page${page}">
        <readByQuery>
          <object>${OBJECT_NAME}</object>
          <fields>*</fields>
          <query>${page_query_xml}</query>
          <pagesize>${PAGE_SIZE}</pagesize>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>
EOF

    curl -s \
      -H "Content-Type: application/xml" \
      -d @"$PAGE_XML" \
      "${INTACCT_ENDPOINT}" \
      -o "$RAW_XML"

    aws s3 cp "$RAW_XML" \
      "${S3_BUCKET}/${S3_XML_PREFIX}/${FILE_BASENAME}/${RUN_DATE}/${FILE_BASENAME}_page_${page}.xml"

    check_intacct_response "$RAW_XML"

    xq -c '
      .response.operation.result.data
      | .. | arrays | select(length > 0)
      | .[]
    ' "$RAW_XML" > "$PAGE_JSON"

    local page_stats
    page_stats=$(python3 - "$PAGE_JSON" <<'PY'
import sys, json

path = sys.argv[1]
count = 0
max_record = 0

with open(path, encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        obj = json.loads(line)
        count += 1
        record = int(obj.get("RECORDNO") or 0)
        if record > max_record:
            max_record = record

print(f"{count}|{max_record}")
PY
)

    local page_rows=${page_stats%%|*}
    local page_recordno=${page_stats##*|}

    if [[ "$page_rows" -eq 0 ]]; then
      break
    fi

    echo "PAGE ${page} (${OBJECT_NAME}): rows=${page_rows} last_recordno=${page_recordno}"

    cat "$PAGE_JSON" >> "$JSON_FILE"
    rm -f "$PAGE_JSON"

    total_rows=$((total_rows + page_rows))

    if [ "$page_recordno" -le "$last_recordno" ]; then
      echo "Cursor did not advance for ${OBJECT_NAME} (last_recordno=${last_recordno}, page_recordno=${page_recordno})" >&2
      exit 2
    fi

    last_recordno="$page_recordno"
    pages=$((pages + 1))

    if [ "${PAGINATION_SMOKE_TEST}" -eq 1 ] && [ "$pages" -ge 3 ]; then
      echo "PAGINATION_SMOKE_TEST reached 3 pages for ${OBJECT_NAME}, stopping"
      break
    fi

    page=$((page + 1))
  done

  echo "PAGINATION COMPLETE (${OBJECT_NAME}): total_rows=${total_rows} pages=${pages} last_recordno=${last_recordno}"

  aws s3 cp "$JSON_FILE" \
    "${S3_BUCKET}/${S3_JSON_PREFIX}/${FILE_BASENAME}/${RUN_DATE}/${FILE_BASENAME}.json"
}

pull_paginated_gl_entries_resultid() {
  local GL_JSON="$BASE_DIR/gl_entries.json"
  : > "$GL_JSON"

  local total_rows=0
  local max_entry_date=""
  local last_recordno=0
  local page=1
  local pages=0
  local resultstart=0
  local resultid=""
  local resume_complete=0
  local object_id
  object_id=$(echo "${GL_ENTRIES_OBJECT}" | tr '[:upper:]' '[:lower:]')

  if [ "${GL_ENTRIES_RESUME_FROM_S3}" -eq 1 ]; then
    if aws s3 cp "${S3_GL_ENTRIES_CHECKPOINT_PREFIX}/latest.json" /tmp/gl_entries_checkpoint.json >/dev/null 2>&1; then
      read ck_mode ck_resultid ck_page ck_total_rows ck_max_entry_date ck_last_recordno < <(python3 - <<'PY'
import json
with open("/tmp/gl_entries_checkpoint.json") as fh:
    obj = json.load(fh)
mode = obj.get("mode")
resultid = obj.get("result_id") or obj.get("resultid") or ""
page = int(obj.get("page") or 0) + 1
total_rows = int(obj.get("total_rows") or 0)
max_entry_date = obj.get("max_entry_date") or ""
last_recordno = int(obj.get("last_recordno") or 0)
if not mode:
    mode = "resultid" if resultid else "recordno"
print(mode, resultid, page, total_rows, max_entry_date, last_recordno)
PY
)
      if [ "${ck_mode}" = "resultid" ]; then
        resultid="${ck_resultid}"
        page="${ck_page}"
        total_rows="${ck_total_rows}"
        max_entry_date="${ck_max_entry_date}"
        last_recordno="${ck_last_recordno}"
        local rebuilt_pages=$((page - 1))
        if [ "$rebuilt_pages" -gt 0 ]; then
          echo "RESUME (resultid): rebuilding gl_entries.json from S3 XML pages 1..${rebuilt_pages}"
          local rebuild_summary
          rebuild_summary=$(rebuild_gl_entries_json_from_s3_xml_pages "${RUN_DATE}" "${rebuilt_pages}" "${GL_JSON}")
          local last_num_remaining="${rebuild_summary%%|*}"
          local last_xml_resultid="${rebuild_summary#*|}"
          if [ -n "$last_xml_resultid" ]; then
            resultid="$last_xml_resultid"
          fi
          if [ "$last_num_remaining" = "0" ]; then
            resume_complete=1
          fi
        fi
        echo "RESUME (resultid): resultid=${resultid} next_page=${page} total_rows=${total_rows} max_entry_date=${max_entry_date} resume_complete=${resume_complete}"
      fi
    fi
  fi

  if [ "${resume_complete}" -eq 0 ]; then
  while true; do
    local PAGE_XML="$BASE_DIR/gl_entries_page_${page}.xml"
    local RAW_XML="$BASE_DIR/gl_entries_page_${page}_response.xml"
    local PAGE_JSON="$BASE_DIR/gl_entries_page_${page}.json"

    local page_query_xml
    page_query_xml=$(xml_escape "$GL_ENTRIES_BASE_QUERY")

    if [ -z "$resultid" ] && [ "$page" -eq 1 ]; then
      cat > "$PAGE_XML" <<EOF
<request>
    <control>
      <senderid>${SENDER_ID}</senderid>
      <password>${SENDER_PASSWORD}</password>
      <controlid>get${object_id}_page_${page}</controlid>
      <uniqueid>false</uniqueid>
      <dtdversion>3.0</dtdversion>
    </control>
  <operation>
    <authentication>
      <sessionid>${SESSION_ID}</sessionid>
    </authentication>
    <content>
      <function controlid="get${object_id}Page${page}">
        <readByQuery>
          <object>${GL_ENTRIES_OBJECT}</object>
          <fields>*</fields>
$(printf '          <query>%s</query>\n' "$page_query_xml")
          <pagesize>${GL_ENTRIES_PAGE_SIZE}</pagesize>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>
EOF
    else
      cat > "$PAGE_XML" <<EOF
<request>
    <control>
      <senderid>${SENDER_ID}</senderid>
      <password>${SENDER_PASSWORD}</password>
      <controlid>get${object_id}_page_${page}</controlid>
      <uniqueid>false</uniqueid>
      <dtdversion>3.0</dtdversion>
    </control>
  <operation>
    <authentication>
      <sessionid>${SESSION_ID}</sessionid>
    </authentication>
    <content>
      <function controlid="get${object_id}Page${page}">
        <readMore>
          <resultId>${resultid}</resultId>
        </readMore>
      </function>
    </content>
  </operation>
</request>
EOF
    fi

    if ! post_intacct_xml_with_retry "$PAGE_XML" "$RAW_XML" "GL entries page ${page}"; then
      aws s3 cp "$RAW_XML" \
        "${S3_BUCKET}/${S3_XML_PREFIX}/gl_entries/${RUN_DATE}/gl_entries_page_${page}.xml" >/dev/null 2>&1 || true
      echo "ERROR: failed to fetch valid Intacct XML for GL entries page ${page}; aborting so resume can retry." >&2
      exit 2
    fi

    aws s3 cp "$RAW_XML" \
      "${S3_BUCKET}/${S3_XML_PREFIX}/gl_entries/${RUN_DATE}/gl_entries_page_${page}.xml"

    check_intacct_response "$RAW_XML"

    xq -c '
      .response.operation.result.data
      | .. | arrays | select(length > 0)
      | .[]
    ' "$RAW_XML" > "$PAGE_JSON"

    local page_stats
    page_stats=$(python3 - "$PAGE_JSON" <<'PY'
import sys, json
from datetime import datetime

path = sys.argv[1]
count = 0
max_record = 0
max_entry = None

def parse_date(value):
    try:
        return datetime.strptime(value, "%m/%d/%Y")
    except Exception:
        return None

with open(path, encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        obj = json.loads(line)
        count += 1
        record = int(obj.get("RECORDNO") or 0)
        if record > max_record:
            max_record = record
        entry = parse_date(obj.get("ENTRY_DATE") or "")
        if entry and (max_entry is None or entry > max_entry):
            max_entry = entry

print(f"{count}|{max_record}|{max_entry.strftime('%Y-%m-%d') if max_entry else ''}")
PY
)

    local page_rows=${page_stats%%|*}
    local remainder=${page_stats#*|}
    local page_recordno=${remainder%%|*}
    local page_entry_date=${remainder##*|}

    if [[ "$page_rows" -eq 0 ]]; then
      break
    fi

    echo "PAGE ${page}: rows=${page_rows} last_recordno=${page_recordno} max_entry_date=${page_entry_date}"

    cat "$PAGE_JSON" >> "$GL_JSON"
    rm -f "$PAGE_JSON"

    total_rows=$((total_rows + page_rows))
    last_recordno="$page_recordno"

    if [ -z "$max_entry_date" ] || [[ "$page_entry_date" > "$max_entry_date" ]]; then
      max_entry_date="$page_entry_date"
    fi

    local page_summary
    page_summary=$(python3 - "$RAW_XML" <<'PY'
import sys, xml.etree.ElementTree as ET

tree = ET.parse(sys.argv[1])
root = tree.getroot()
data = root.find(".//data")
if data is None:
    print("0|")
else:
    print(f"{data.attrib.get('numremaining','0')}|{data.attrib.get('resultId','')}")
PY
)

    local num_remaining="${page_summary%%|*}"
    local next_resultid="${page_summary#*|}"

    if [ -n "$next_resultid" ]; then
      resultid="$next_resultid"
    fi

    pages=$((pages + 1))
    write_gl_entries_checkpoint "resultid" "${page}" "${last_recordno}" "${total_rows}" "${max_entry_date}" "0" "${resultid}"

    if [ "${PAGINATION_SMOKE_TEST}" -eq 1 ] && [ "$pages" -ge 3 ]; then
      echo "PAGINATION_SMOKE_TEST reached 3 pages, stopping"
      break
    fi

    if [ "$num_remaining" = "0" ]; then
      break
    fi

    page=$((page + 1))
  done
  fi

  echo "PAGINATION COMPLETE: total_rows=${total_rows} pages=${pages} last_recordno=${last_recordno} max_entry_date=${max_entry_date}"
  write_gl_entries_checkpoint "resultid" "${page}" "${last_recordno}" "${total_rows}" "${max_entry_date}" "0" "${resultid}"

  RECORD_COUNT=$(grep -cvE '^[[:space:]]*$' "$GL_JSON")
  local GL_ENTRIES_JSON_S3_URI="${S3_GL_ENTRIES_DATA_PREFIX}/gl_entries.json"

  if [[ "${RECORD_COUNT:-0}" -eq 0 ]]; then
    write_gl_entries_metadata "failure" "${RECORD_COUNT:-0}" "GL entries returned 0 rows; skipping daily JSON upload and failing run." "${GL_ENTRIES_JSON_S3_URI}" "skipped"
    notify_failure "GL entries returned 0 rows for run_date=${RUN_DATE}"
    exit 2
  fi

  if ! aws s3 cp "$GL_JSON" "${GL_ENTRIES_JSON_S3_URI}"; then
    write_gl_entries_metadata "failure" "${RECORD_COUNT:-0}" "GL entries JSON upload to ${GL_ENTRIES_JSON_S3_URI} failed." "${GL_ENTRIES_JSON_S3_URI}" "failed"
    notify_failure "GL entries upload failed for run_date=${RUN_DATE}"
    exit 2
  fi

  write_gl_entries_metadata "success" "${RECORD_COUNT:-0}" "GL entries succeeded; uploading daily JSON (lookback_days=${GL_ENTRIES_LOOKBACK_DAYS})." "${GL_ENTRIES_JSON_S3_URI}" "uploaded"

  summarize_gl_entries "$GL_JSON"
}

pull_paginated_gl_entries() {
  if [ "${GL_ENTRIES_PAGINATION_MODE}" = "resultid" ]; then
    pull_paginated_gl_entries_resultid
    return
  fi

  local GL_JSON="$BASE_DIR/gl_entries.json"
  : > "$GL_JSON"

  local last_recordno="${GL_ENTRIES_START_RECORDNO}"
  local total_rows=0
  local max_entry_date=""
  local page=1
  local pages=0
  local object_id
  object_id=$(echo "${GL_ENTRIES_OBJECT}" | tr '[:upper:]' '[:lower:]')

  if [ "${GL_ENTRIES_RESUME_FROM_S3}" -eq 1 ] && [ "${last_recordno}" -eq 0 ]; then
    if aws s3 cp "${S3_GL_ENTRIES_CHECKPOINT_PREFIX}/latest.json" /tmp/gl_entries_checkpoint.json >/dev/null 2>&1; then
      read ck_mode ck_last_recordno ck_page ck_total_rows ck_max_entry_date < <(python3 - <<'PY'
import json
with open("/tmp/gl_entries_checkpoint.json") as fh:
    obj = json.load(fh)
mode = obj.get("mode")
last_recordno = int(obj.get("last_recordno") or 0)
page = int(obj.get("page") or 0) + 1
total_rows = int(obj.get("total_rows") or 0)
max_entry_date = obj.get("max_entry_date") or ""
if not mode:
    mode = "recordno"
print(mode, last_recordno, page, total_rows, max_entry_date)
PY
)
      if [ "${ck_mode}" = "recordno" ]; then
        last_recordno="${ck_last_recordno}"
        page="${ck_page}"
        total_rows="${ck_total_rows}"
        max_entry_date="${ck_max_entry_date}"
        echo "RESUME (recordno): last_recordno=${last_recordno} next_page=${page} total_rows=${total_rows} max_entry_date=${max_entry_date}"
      fi
    fi
  fi

  while true; do
    local PAGE_XML="$BASE_DIR/gl_entries_page_${page}.xml"
    local RAW_XML="$BASE_DIR/gl_entries_page_${page}_response.xml"
    local PAGE_JSON="$BASE_DIR/gl_entries_page_${page}.json"

    local cursor_query="RECORDNO > ${last_recordno}"
    local page_query
    if [ -n "$GL_ENTRIES_BASE_QUERY" ]; then
      page_query=$(join_filters "${GL_ENTRIES_BASE_QUERY}" "$cursor_query")
    else
      page_query="$cursor_query"
    fi
    local page_query_xml
    page_query_xml=$(xml_escape "$page_query")

    cat > "$PAGE_XML" <<EOF
<request>
    <control>
      <senderid>${SENDER_ID}</senderid>
      <password>${SENDER_PASSWORD}</password>
      <controlid>get${object_id}_page_${page}</controlid>
      <uniqueid>false</uniqueid>
      <dtdversion>3.0</dtdversion>
    </control>
  <operation>
    <authentication>
      <sessionid>${SESSION_ID}</sessionid>
    </authentication>
    <content>
      <function controlid="get${object_id}Page${page}">
        <readByQuery>
          <object>${GL_ENTRIES_OBJECT}</object>
          <fields>*</fields>
$(printf '          <query>%s</query>\n' "$page_query_xml")
          <pagesize>${GL_ENTRIES_PAGE_SIZE}</pagesize>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>
EOF

    if ! post_intacct_xml_with_retry "$PAGE_XML" "$RAW_XML" "GL entries page ${page}"; then
      aws s3 cp "$RAW_XML" \
        "${S3_BUCKET}/${S3_XML_PREFIX}/gl_entries/${RUN_DATE}/gl_entries_page_${page}.xml" >/dev/null 2>&1 || true
      echo "ERROR: failed to fetch valid Intacct XML for GL entries page ${page}; aborting so resume can retry." >&2
      exit 2
    fi

    aws s3 cp "$RAW_XML" \
      "${S3_BUCKET}/${S3_XML_PREFIX}/gl_entries/${RUN_DATE}/gl_entries_page_${page}.xml"

    check_intacct_response "$RAW_XML"

    xq -c '
      .response.operation.result.data
      | .. | arrays | select(length > 0)
      | .[]
    ' "$RAW_XML" > "$PAGE_JSON"

    local page_stats
    page_stats=$(python3 - "$PAGE_JSON" <<'PY'
import sys, json
from datetime import datetime

path = sys.argv[1]
count = 0
max_record = 0
max_entry = None

def parse_date(value):
    try:
        return datetime.strptime(value, "%m/%d/%Y")
    except Exception:
        return None

with open(path, encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        obj = json.loads(line)
        count += 1
        record = int(obj.get("RECORDNO") or 0)
        if record > max_record:
            max_record = record
        entry = parse_date(obj.get("ENTRY_DATE") or "")
        if entry and (max_entry is None or entry > max_entry):
            max_entry = entry

print(f"{count}|{max_record}|{max_entry.strftime('%Y-%m-%d') if max_entry else ''}")
PY
)

    local page_rows=${page_stats%%|*}
    local remainder=${page_stats#*|}
    local page_recordno=${remainder%%|*}
    local page_entry_date=${remainder##*|}

    if [[ "$page_rows" -eq 0 ]]; then
      break
    fi

    echo "PAGE ${page}: rows=${page_rows} last_recordno=${page_recordno} max_entry_date=${page_entry_date}"

    cat "$PAGE_JSON" >> "$GL_JSON"
    rm -f "$PAGE_JSON"

    total_rows=$((total_rows + page_rows))

    if [ "$page_recordno" -le "$last_recordno" ]; then
      echo "Cursor did not advance (last_recordno=${last_recordno}, page_recordno=${page_recordno})" >&2
      exit 2
    fi

    last_recordno="$page_recordno"

    if [ -z "$max_entry_date" ] || [[ "$page_entry_date" > "$max_entry_date" ]]; then
      max_entry_date="$page_entry_date"
    fi

    pages=$((pages + 1))
    write_gl_entries_checkpoint "recordno" "${page}" "${last_recordno}" "${total_rows}" "${max_entry_date}" "0" ""

    if [ "${PAGINATION_SMOKE_TEST}" -eq 1 ] && [ "$pages" -ge 3 ]; then
      echo "PAGINATION_SMOKE_TEST reached 3 pages, stopping"
      break
    fi

    page=$((page + 1))
  done

  echo "PAGINATION COMPLETE: total_rows=${total_rows} pages=${pages} last_recordno=${last_recordno} max_entry_date=${max_entry_date}"
  write_gl_entries_checkpoint "recordno" "${page}" "${last_recordno}" "${total_rows}" "${max_entry_date}" "0" ""

  RECORD_COUNT=$(grep -cvE '^[[:space:]]*$' "$GL_JSON")
  local GL_ENTRIES_JSON_S3_URI="${S3_GL_ENTRIES_DATA_PREFIX}/gl_entries.json"

  if [[ "${RECORD_COUNT:-0}" -eq 0 ]]; then
    write_gl_entries_metadata "failure" "${RECORD_COUNT:-0}" "GL entries returned 0 rows; skipping daily JSON upload and failing run." "${GL_ENTRIES_JSON_S3_URI}" "skipped"
    notify_failure "GL entries returned 0 rows for run_date=${RUN_DATE}"
    exit 2
  fi

  if ! aws s3 cp "$GL_JSON" "${GL_ENTRIES_JSON_S3_URI}"; then
    write_gl_entries_metadata "failure" "${RECORD_COUNT:-0}" "GL entries JSON upload to ${GL_ENTRIES_JSON_S3_URI} failed." "${GL_ENTRIES_JSON_S3_URI}" "failed"
    notify_failure "GL entries upload failed for run_date=${RUN_DATE}"
    exit 2
  fi

  write_gl_entries_metadata "success" "${RECORD_COUNT:-0}" "GL entries succeeded; uploading daily JSON (lookback_days=${GL_ENTRIES_LOOKBACK_DAYS})." "${GL_ENTRIES_JSON_S3_URI}" "uploaded"

  summarize_gl_entries "$GL_JSON"
}

############################################################
# 6. UPDATED GL ACCOUNTS FUNCTION (NDJSON OUTPUT)
############################################################

pull_gl_accounts() {

  FILE_BASENAME="gl_accounts"

  ##########################################################
  # STEP 1 — GET ALL GLACCOUNT KEYS
  ##########################################################

  KEYS_XML="$BASE_DIR/${FILE_BASENAME}_keys.xml"
  KEYS_RESPONSE="$BASE_DIR/${FILE_BASENAME}_keys_response.xml"

  cat > "$KEYS_XML" <<EOF
<request>
  <control>
    <senderid>${SENDER_ID}</senderid>
    <password>${SENDER_PASSWORD}</password>
    <controlid>getGLAccountKeys</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <sessionid>${SESSION_ID}</sessionid>
    </authentication>
    <content>
      <function controlid="glaccount_keys">
        <readByQuery>
          <object>GLACCOUNT</object>
          <fields>RECORDNO</fields>
          <query>RECORDNO &gt; 0</query>
          <pagesize>1000</pagesize>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>
EOF

  curl -s \
    -H "Content-Type: application/xml" \
    -d @"$KEYS_XML" \
    "${INTACCT_ENDPOINT}" \
    -o "$KEYS_RESPONSE"

  ACCOUNT_KEYS=$(xq -r '
    .response.operation.result.data.glaccount[].RECORDNO
  ' "$KEYS_RESPONSE" | paste -sd "," -)

  if [ -z "$ACCOUNT_KEYS" ]; then
    echo "" > "$BASE_DIR/${FILE_BASENAME}.json"
    aws s3 cp "$BASE_DIR/${FILE_BASENAME}.json" \
      "${S3_BUCKET}/${S3_JSON_PREFIX}/${FILE_BASENAME}/${RUN_DATE}/${FILE_BASENAME}.json"
    return
  fi

  ##########################################################
  # STEP 2 — READ GLACCOUNTS USING THE KEYS
  ##########################################################

  GL_XML="$BASE_DIR/${FILE_BASENAME}.xml"
  GL_RESPONSE="$BASE_DIR/${FILE_BASENAME}_response.xml"
  GL_JSON="$BASE_DIR/${FILE_BASENAME}.json"

  cat > "$GL_XML" <<EOF
<request>
  <control>
    <senderid>${SENDER_ID}</senderid>
    <password>${SENDER_PASSWORD}</password>
    <controlid>getGLAccounts</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <sessionid>${SESSION_ID}</sessionid>
    </authentication>
    <content>
      <function controlid="glaccount_read">
        <read>
          <object>GLACCOUNT</object>
          <keys>${ACCOUNT_KEYS}</keys>
        </read>
      </function>
    </content>
  </operation>
</request>
EOF

  curl -s \
    -H "Content-Type: application/xml" \
    -d @"$GL_XML" \
    "${INTACCT_ENDPOINT}" \
    -o "$GL_RESPONSE"

  aws s3 cp "$GL_RESPONSE" \
    "${S3_BUCKET}/${S3_XML_PREFIX}/${FILE_BASENAME}/${RUN_DATE}/${FILE_BASENAME}.xml"

  # NDJSON extraction
  xq -c '
    .response.operation.result.data.GLACCOUNT[]
  ' "$GL_RESPONSE" > "$GL_JSON"

  aws s3 cp "$GL_JSON" \
    "${S3_BUCKET}/${S3_JSON_PREFIX}/${FILE_BASENAME}/${RUN_DATE}/${FILE_BASENAME}.json"
}

summarize_gl_entries() {
  local json_file="$1"
  local summary
  summary=$(GL_ENTRIES_JSON="$json_file" python3 - <<'PY'
import json
import os
from datetime import datetime

path = os.environ.get("GL_ENTRIES_JSON")
if not path:
    print("0|None|None")
    sys.exit(0)

count = 0
max_entry = None
max_batch = None

def parsedate(value):
    try:
        return datetime.strptime(value, "%m/%d/%Y")
    except Exception:
        return None

with open(path, encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        count += 1
        entry = parsedate(obj.get("ENTRY_DATE") or "")
        batch = parsedate(obj.get("BATCH_DATE") or "")
        if entry and (max_entry is None or entry > max_entry):
            max_entry = entry
        if batch and (max_batch is None or batch > max_batch):
            max_batch = batch

print(f"{count}|{max_entry.strftime('%Y-%m-%d') if max_entry else 'None'}|{max_batch.strftime('%Y-%m-%d') if max_batch else 'None'}")
PY
)
  local count=${summary%%|*}
  local remainder=${summary#*|}
  local max_entry=${remainder%%|*}
  local max_batch=${remainder##*|}
  local human="GL entries summary (${GL_ENTRIES_OBJECT}): count=${count}, max ENTRY_DATE=${max_entry}, max BATCH_DATE=${max_batch}"
  echo "$human"
  echo "$human" >> "$DATA_QUALITY_FILE"

  if [ "$count" -eq 0 ]; then
    echo "No ${GL_ENTRIES_OBJECT} rows found for the last ${GL_ENTRIES_LOOKBACK_DAYS} days (starting ${GL_ENTRIES_FILTER_DATE})."
    echo "Please confirm the Intacct dataset has entries in that window—if not, we can extend the lookback to 730 days or beyond."
  fi
}

############################################################
# 7. MASTER DATA PULLS
############################################################

pull_object_paginated_recordno "VENDOR" "vendors"
pull_object_paginated_recordno "CUSTOMER" "customers"
pull_gl_accounts

############################################################
# 8. TRANSACTION DATA PULLS
############################################################

pull_object_paginated_recordno "APBILL" "ap_bills"
pull_object_paginated_recordno "APPYMT" "ap_payments"
# Auto-detect pagination mode from active checkpoint (resultid vs recordno)
if [ "${GL_ENTRIES_RESUME_FROM_S3}" -eq 1 ] && [ "${GL_ENTRIES_PAGINATION_MODE}" = "recordno" ]; then
  if aws s3 cp "${S3_GL_ENTRIES_CHECKPOINT_PREFIX}/latest.json" /tmp/gl_entries_checkpoint.json >/dev/null 2>&1; then
    if python3 - <<'PY' | grep -q "yes"; then
import json
with open("/tmp/gl_entries_checkpoint.json") as fh:
    obj = json.load(fh)
print("yes" if (obj.get("result_id") or obj.get("resultid")) else "no")
PY
      GL_ENTRIES_PAGINATION_MODE="resultid"
      echo "Detected resultid checkpoint; switching GL_ENTRIES_PAGINATION_MODE=resultid"
    fi
  fi
fi
pull_paginated_gl_entries

############################################################
# 9. SUCCESS HEARTBEAT
############################################################

echo "Intacct ingest completed at $(date)" > "$BASE_DIR/heartbeat.txt"
aws s3 cp "$BASE_DIR/heartbeat.txt" \
  "${S3_BUCKET}/${S3_HEARTBEAT_PREFIX}/success_${RUN_TIMESTAMP}.txt"
