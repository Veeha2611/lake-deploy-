#!/usr/bin/env bash
set -euo pipefail

############################################################
# 0. CRON-SAFE ENVIRONMENT LOADING
############################################################

source "$HOME/intacct_env.sh" PROD
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

: "${INTACCT_ENDPOINT_URL:?Missing INTACCT_ENDPOINT_URL}"
: "${INTACCT_SENDER_ID:?Missing INTACCT_SENDER_ID}"
: "${INTACCT_SENDER_PASSWORD:?Missing INTACCT_SENDER_PASSWORD}"
: "${INTACCT_COMPANY_ID:?Missing INTACCT_COMPANY_ID}"
: "${INTACCT_WS_USER_ID:?Missing INTACCT_WS_USER_ID}"
: "${INTACCT_WS_USER_PASSWORD:?Missing INTACCT_WS_USER_PASSWORD}"

# Legacy aliases for compatibility (most templates expect these names)
SENDER_ID="$INTACCT_SENDER_ID"
SENDER_PASSWORD="$INTACCT_SENDER_PASSWORD"
WS_USER_ID="$INTACCT_WS_USER_ID"
WS_USER_PASSWORD="$INTACCT_WS_USER_PASSWORD"
COMPANY_ID="$INTACCT_COMPANY_ID"
INTACCT_ENDPOINT="$INTACCT_ENDPOINT_URL"

FAILURE_REASON=""

# Intacct env (shared, synchronized with above)
# (Legacy aliases continue to reference these values for backward compatibility.)
INTACCT_ENDPOINT="${INTACCT_ENDPOINT_URL}"
COMPANY_ID="${INTACCT_COMPANY_ID}"

############################################################
# 1. USER-DEFINED CREDENTIALS (FROM ENV FILE)
############################################################

# Intacct credentials are loaded earlier via intacct_env.sh.
INTACCT_ENDPOINT="${INTACCT_ENDPOINT_URL}"
S3_BUCKET="s3://gwi-raw-us-east-2-pc"
S3_XML_PREFIX="raw/intacct_xml"
S3_JSON_PREFIX="raw/intacct_json"
S3_HEARTBEAT_PREFIX="raw/intacct/heartbeat"

# Location scope used when the UI is running “Top level”
LOCATION_ID="${LOCATION_ID:-}"

GL_ENTRIES_LOOKBACK_DAYS="${GL_ENTRIES_LOOKBACK_DAYS:-365}"
GL_ENTRIES_FILTER_DATE="${GL_ENTRIES_FILTER_DATE:-$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
import os

days = int(os.environ.get("GL_ENTRIES_LOOKBACK_DAYS", "90"))
print((datetime.now(timezone.utc) - timedelta(days=days)).strftime("%m/%d/%Y"))
PY
)}"
GL_ENTRIES_OBJECT="${GL_ENTRIES_OBJECT:-GLENTRY}"
GL_ENTRIES_EXTRA_QUERY="${GL_ENTRIES_EXTRA_QUERY:-}"
GL_ENTRIES_PAGE_SIZE="${GL_ENTRIES_PAGE_SIZE:-1000}"

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

GL_ENTRIES_DEFAULT_QUERY="ENTRY_DATE >= '${GL_ENTRIES_FILTER_DATE}'"
GL_ENTRIES_FILTERS=("$GL_ENTRIES_DEFAULT_QUERY")
[ -n "$GL_ENTRIES_EXTRA_QUERY" ] && GL_ENTRIES_FILTERS+=("$GL_ENTRIES_EXTRA_QUERY")
GL_ENTRIES_COMBINED_QUERY="$(join_filters "${GL_ENTRIES_FILTERS[@]}")"
GL_ENTRIES_QUERY="${GL_ENTRIES_QUERY:-${GL_ENTRIES_COMBINED_QUERY}}"
GL_ENTRIES_QUERY_BLOCK="${GL_ENTRIES_QUERY_BLOCK:-          <query>${GL_ENTRIES_QUERY}</query>}"

############################################################
# 2. LOGGING SETUP
############################################################

RUN_DATE=$(date +%F)
RUN_TIMESTAMP=$(date +%F_%H-%M-%S)

BASE_DIR="$HOME/intacct_ingest/$RUN_DATE"
LOG_DIR="$HOME/intacct_ingest/logs"

mkdir -p "$BASE_DIR"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/ingest_${RUN_TIMESTAMP}.log"
if [ -z "${SKIP_LOG_REDIRECT:-}" ]; then
  exec > "$LOG_FILE" 2>&1
fi

DATA_QUALITY_FILE="$BASE_DIR/data_quality_summary.txt"

echo "Intacct login config: company=${COMPANY_ID}, user=${INTACCT_WS_USER_ID}, endpoint=${INTACCT_ENDPOINT}, sender_id=${INTACCT_SENDER_ID}"
echo "Running Intacct ingest for ${COMPANY_ID} (${INTACCT_ENDPOINT})"
echo "GLENTRY query lookback: last ${GL_ENTRIES_LOOKBACK_DAYS} days (object: ${GL_ENTRIES_OBJECT}, filter: ${GL_ENTRIES_QUERY})"

############################################################
# 3. FAILURE NOTIFICATION
############################################################

notify_failure() {
  local reason="${1:-$FAILURE_REASON}"
  if [ -z "$reason" ]; then
    reason="Intacct ingest FAILED at $(date)"
  fi
  echo "$reason" > "$BASE_DIR/failure.txt"
  aws s3 cp "$BASE_DIR/failure.txt" \
    "${S3_BUCKET}/${S3_HEARTBEAT_PREFIX}/failure_${RUN_TIMESTAMP}.txt"
}

trap 'notify_failure' ERR

############################################################
# 4. AUTHENTICATE TO SAGE INTACCT
############################################################

LOGIN_XML="$BASE_DIR/login.xml"
LOGIN_RESPONSE="$BASE_DIR/login_response.xml"

cat > "$LOGIN_XML" <<EOF
<request>
  <control>
    <senderid>${INTACCT_SENDER_ID}</senderid>
    <password>${INTACCT_SENDER_PASSWORD}</password>
    <controlid>loginTest</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <login>
        <userid>${INTACCT_WS_USER_ID}</userid>
        <companyid>${INTACCT_COMPANY_ID}</companyid>
        <password>${INTACCT_WS_USER_PASSWORD}</password>
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

LOGIN_STATUS=$(python3 - <<PY
import xml.etree.ElementTree as ET
root = ET.parse("$LOGIN_RESPONSE").getroot()
print((root.findtext(".//result/status") or "").strip())
PY
)
LOGIN_ERRORS=$(python3 - <<PY
import xml.etree.ElementTree as ET
root = ET.parse("$LOGIN_RESPONSE").getroot()
descs = [d.text.strip() for d in root.findall(".//errormessage//description2") if d.text and d.text.strip()]
print("|".join(descs))
PY
)
SESSION_ID=$(python3 - <<PY
import xml.etree.ElementTree as ET
root = ET.parse("$LOGIN_RESPONSE").getroot()
node = root.find(".//sessionid")
print((node.text or "").strip() if node is not None else "")
PY
)

if [ "${LOGIN_STATUS:-}" != "success" ]; then
  FAILURE_REASON="Login failure: status=${LOGIN_STATUS:-<missing>} errors=${LOGIN_ERRORS:-<none>}"
  notify_failure "$FAILURE_REASON"
  exit 1
fi

if [ -z "$SESSION_ID" ]; then
  FAILURE_REASON="Login success but no sessionid found"
  notify_failure "$FAILURE_REASON"
  exit 1
fi

############################################################
# 5. GENERIC OBJECT PULL FUNCTION (NDJSON OUTPUT)
############################################################

pull_object() {
  OBJECT_NAME="$1"
  FILE_BASENAME="$2"
  QUERY_BLOCK="${3:-          <query/>}"

  XML_FILE="$BASE_DIR/${FILE_BASENAME}.xml"
  RAW_XML="$BASE_DIR/${FILE_BASENAME}_response.xml"
  JSON_FILE="$BASE_DIR/${FILE_BASENAME}.json"
  if [ "$FILE_BASENAME" = "gl_entries" ]; then
    echo "Using GLENTRY query block: ${QUERY_BLOCK}"
  fi

  cat > "$XML_FILE" <<EOF
<request>
  <control>
    <senderid>${INTACCT_SENDER_ID}</senderid>
    <password>${INTACCT_SENDER_PASSWORD}</password>
    <controlid>get${FILE_BASENAME}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <sessionid>${SESSION_ID}</sessionid>
    </authentication>
    <content>
          <function controlid="get${FILE_BASENAME}Func">
            <readByQuery>
              <object>${OBJECT_NAME}</object>
              <fields>*</fields>
$(printf '%s\n' "$QUERY_BLOCK")
              <pagesize>1000</pagesize>
            </readByQuery>
          </function>
    </content>
  </operation>
</request>
EOF

  curl -s \
    -H "Content-Type: application/xml" \
    -d @"$XML_FILE" \
    "${INTACCT_ENDPOINT}" \
    -o "$RAW_XML"

  aws s3 cp "$RAW_XML" \
    "${S3_BUCKET}/${S3_XML_PREFIX}/${FILE_BASENAME}/${RUN_DATE}/${FILE_BASENAME}.xml"

  # NDJSON extraction (one object per line)
  xq -c '
    .response.operation.result.data
    | .. | arrays | select(length > 0)
    | .[]
  ' "$RAW_XML" > "$JSON_FILE"

  aws s3 cp "$JSON_FILE" \
    "${S3_BUCKET}/${S3_JSON_PREFIX}/${FILE_BASENAME}/${RUN_DATE}/${FILE_BASENAME}.json"

  if [ "$FILE_BASENAME" = "gl_entries" ]; then
    summarize_gl_entries "$JSON_FILE"
  fi
}

pull_paginated_gl_entries() {
  local GL_JSON="$BASE_DIR/gl_entries.json"
  : > "$GL_JSON"

  local result_id=""
  local page=1
  local num_remaining=1

  while true; do
    local PAGE_XML="$BASE_DIR/gl_entries_page_${page}.xml"
    local RAW_XML="$BASE_DIR/gl_entries_page_${page}_response.xml"

    cat > "$PAGE_XML" <<EOF
<request>
  <control>
    <senderid>${INTACCT_SENDER_ID}</senderid>
    <password>${INTACCT_SENDER_PASSWORD}</password>
    <controlid>getgl_entries_page_${page}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <sessionid>${SESSION_ID}</sessionid>
    </authentication>
    <content>
      <function controlid="getgl_entriesPage${page}">
        <readByQuery>
          <object>${GL_ENTRIES_OBJECT}</object>
          <fields>*</fields>
$(printf '%s\n' "$GL_ENTRIES_QUERY_BLOCK")
$(if [ -n "$result_id" ]; then printf '          <resultid>%s</resultid>\n' "$result_id"; fi)
          <pagesize>${GL_ENTRIES_PAGE_SIZE}</pagesize>
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
      "${S3_BUCKET}/${S3_XML_PREFIX}/gl_entries/${RUN_DATE}/gl_entries_page_${page}.xml"

    xq -c '
      .response.operation.result.data
      | .. | arrays | select(length > 0)
      | .[]
    ' "$RAW_XML" >> "$GL_JSON"

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

    num_remaining="${page_summary%%|*}"
    result_id="${page_summary#*|}"

    if [ "$num_remaining" = "0" ] || [ -z "$result_id" ]; then
      break
    fi

    page=$((page + 1))
  done

  aws s3 cp "$GL_JSON" \
    "${S3_BUCKET}/${S3_JSON_PREFIX}/gl_entries/${RUN_DATE}/gl_entries.json"

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
    <senderid>${INTACCT_SENDER_ID}</senderid>
    <password>${INTACCT_SENDER_PASSWORD}</password>
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
    <senderid>${INTACCT_SENDER_ID}</senderid>
    <password>${INTACCT_SENDER_PASSWORD}</password>
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
  local human="GL entries summary: count=${count}, max ENTRY_DATE=${max_entry}, max BATCH_DATE=${max_batch}"
  echo "$human"
  echo "$human" >> "$DATA_QUALITY_FILE"

  if [ "$count" -eq 0 ]; then
    echo "No GL rows found for the last ${GL_ENTRIES_LOOKBACK_DAYS} days (starting ${GL_ENTRIES_FILTER_DATE})."
    echo "Please confirm the Intacct dataset has entries in that window—if not, we can extend the lookback to 730 days or beyond."
  fi
}

############################################################
# 7. MASTER DATA PULLS
############################################################

pull_object "VENDOR" "vendors"
pull_object "CUSTOMER" "customers"
pull_gl_accounts

############################################################
# 8. TRANSACTION DATA PULLS
############################################################

pull_object "APBILL" "ap_bills"
pull_object "APPYMT" "ap_payments"
pull_paginated_gl_entries

############################################################
# 9. SUCCESS HEARTBEAT
############################################################

echo "Intacct ingest completed at $(date)" > "$BASE_DIR/heartbeat.txt"
aws s3 cp "$BASE_DIR/heartbeat.txt" \
  "${S3_BUCKET}/${S3_HEARTBEAT_PREFIX}/success_${RUN_TIMESTAMP}.txt"
