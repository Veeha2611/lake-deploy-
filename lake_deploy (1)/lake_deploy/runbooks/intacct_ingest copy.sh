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
SENDER_REDACTED

WS_USER_ID="${WS_USER_ID_SANDBOX}"
WS_USER_REDACTED

COMPANY_ID="${COMPANY_ID_SANDBOX}"

INTACCT_ENDPOINT="https://api.intacct.com/ia/xml/xmlgw.phtml"
S3_BUCKET="s3://gwi-raw-us-east-2-pc"
S3_XML_PREFIX="raw/intacct_xml"
S3_JSON_PREFIX="raw/intacct_json"
S3_HEARTBEAT_PREFIX="raw/intacct/heartbeat"

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

  XML_FILE="$BASE_DIR/${FILE_BASENAME}.xml"
  RAW_XML="$BASE_DIR/${FILE_BASENAME}_response.xml"
  JSON_FILE="$BASE_DIR/${FILE_BASENAME}.json"

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
          <query/>
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
pull_object "GLENTRY" "gl_entries"

############################################################
# 9. SUCCESS HEARTBEAT
############################################################

echo "Intacct ingest completed at $(date)" > "$BASE_DIR/heartbeat.txt"
aws s3 cp "$BASE_DIR/heartbeat.txt" \
  "${S3_BUCKET}/${S3_HEARTBEAT_PREFIX}/success_${RUN_TIMESTAMP}.txt"
