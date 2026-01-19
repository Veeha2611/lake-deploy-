#!/usr/bin/env bash

############################################################
# 0. CRON-SAFE ENVIRONMENT LOADING
############################################################

source $HOME/.bash_profile 2>/dev/null || true
source $HOME/.zshrc 2>/dev/null || true
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Intacct env (shared)
source "$HOME/intacct_env.sh"

############################################################
# 1. USER-DEFINED CREDENTIALS (FROM ENV FILE)
############################################################

SENDER_ID="${SENDER_ID}"
SENDER_PASSWORD="${SENDER_PASSWORD}"

WS_USER_ID="${WS_USER_ID_PROD}"
WS_USER_PASSWORD="${WS_USER_PASSWORD_PROD}"
COMPANY_ID="${COMPANY_ID_PROD}"

INTACCT_ENDPOINT="https://api.intacct.com/ia/xml/xmlgw.phtml"
S3_BUCKET="s3://gwi-raw-us-east-2-pc"
S3_XML_PREFIX="raw/intacct_xml"
S3_JSON_PREFIX="raw/intacct_json"
S3_HEARTBEAT_PREFIX="raw/intacct/heartbeat"

GL_ENTRIES_LOOKBACK_DAYS="${GL_ENTRIES_LOOKBACK_DAYS:-365}"
GL_ENTRIES_FILTER_DATE="${GL_ENTRIES_FILTER_DATE:-$(python3 - <<'PY'
from datetime import datetime, timedelta
import os

days = int(os.environ.get("GL_ENTRIES_LOOKBACK_DAYS", "90"))
print((datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d"))
PY
)}"
GL_ENTRIES_QUERY="${GL_ENTRIES_QUERY:-ENTRY_DATE >= DATE '${GL_ENTRIES_FILTER_DATE}'}"
GL_ENTRIES_QUERY_BLOCK="${GL_ENTRIES_QUERY_BLOCK:-          <query>${GL_ENTRIES_QUERY}</query>}"
GL_ENTRIES_PAGE_SIZE="${GL_ENTRIES_PAGE_SIZE:-1000}"

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
exec > >(tee -a "$LOG_FILE") 2>&1

DATA_QUALITY_FILE="$BASE_DIR/data_quality_summary.txt"

echo "Running Intacct ingest for ${COMPANY_ID} (${INTACCT_ENDPOINT})"
echo "GLENTRY query lookback: last ${GL_ENTRIES_LOOKBACK_DAYS} days (filter: ${GL_ENTRIES_QUERY})"

############################################################
# 3. FAILURE NOTIFICATION
############################################################

notify_failure() {
  echo "Intacct ingest FAILED at $(date)" > "$BASE_DIR/failure.txt"
  aws s3 cp "$BASE_DIR/failure.txt" \
    "${S3_BUCKET}/${S3_HEARTBEAT_PREFIX}/failure_${RUN_TIMESTAMP}.txt"
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
    <senderid>${SENDER_ID}</senderid>
    <password>${SENDER_PASSWORD}</password>
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
  local result_start=0
  local page=1
  local num_remaining=1

  while true; do
    local PAGE_XML="$BASE_DIR/gl_entries_page_${page}.xml"
    local RAW_XML="$BASE_DIR/gl_entries_page_${page}_response.xml"

    cat > "$PAGE_XML" <<EOF
<request>
  <control>
    <senderid>${SENDER_ID}</senderid>
    <password>${SENDER_PASSWORD}</password>
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
          <object>GLENTRY</object>
          <fields>*</fields>
$(printf '%s\n' "$GL_ENTRIES_QUERY_BLOCK")
          <resultstart>${result_start}</resultstart>
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

    result_start=$((result_start + GL_ENTRIES_PAGE_SIZE))
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
