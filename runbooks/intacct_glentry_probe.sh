#!/usr/bin/env bash
set -euo pipefail

# --- Inputs (prompts; passwords hidden) ---
read -r -p "ENV_NAME (e.g., prod | sandbox | dev): " ENV_NAME

read -r -p "INTACCT_ENDPOINT_URL [https://api.intacct.com/ia/xml/xmlgw.phtml]: " INTACCT_ENDPOINT_URL
INTACCT_ENDPOINT_URL="${INTACCT_ENDPOINT_URL:-https://api.intacct.com/ia/xml/xmlgw.phtml}"

read -r -p "INTACCT_SENDER_ID: " INTACCT_SENDER_ID
stty -echo; read -r -p "INTACCT_SENDER_PASSWORD (hidden): " INTACCT_SENDER_PASSWORD; stty echo; echo ""

read -r -p "INTACCT_COMPANY_ID: " INTACCT_COMPANY_ID
read -r -p "INTACCT_USER_ID: " INTACCT_USER_ID
stty -echo; read -r -p "INTACCT_USER_PASSWORD (hidden): " INTACCT_USER_PASSWORD; stty echo; echo ""

CONTROL_ID="glentry_probe_${ENV_NAME}_$(date +%Y%m%d_%H%M%S)"
REQ="/tmp/intacct_${CONTROL_ID}_request.xml"
OUT="/tmp/intacct_${CONTROL_ID}_response.xml"

# --- Request (GLENTRY probe) ---
cat > "$REQ" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>${INTACCT_SENDER_ID}</senderid>
    <password>${INTACCT_SENDER_PASSWORD}</password>
    <controlid>${CONTROL_ID}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
    <includewhitespace>false</includewhitespace>
  </control>
  <operation>
    <authentication>
      <login>
        <userid>${INTACCT_USER_ID}</userid>
        <companyid>${INTACCT_COMPANY_ID}</companyid>
        <password>${INTACCT_USER_PASSWORD}</password>
      </login>
    </authentication>
    <content>
      <function controlid="${CONTROL_ID}">
        <readByQuery>
          <object>GLENTRY</object>
          <query>RECORDNO &gt; 0</query>
          <fields>RECORDNO,WHENCREATED,WHENMODIFIED,ENTRY_DATE,TR_TYPE,TRX_AMOUNT</fields>
          <pagesize>1</pagesize>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>
EOF

# --- Execute ---
curl -sS \
  -H "content-type: application/xml" \
  --data-binary @"$REQ" \
  "$INTACCT_ENDPOINT_URL" \
| tee "$OUT" >/dev/null

# --- Summarize (for quick compare across envs) ---
echo ""
echo "=== ${ENV_NAME} ==="
echo "endpoint: ${INTACCT_ENDPOINT_URL}"
echo "request:  ${REQ}"
echo "response: ${OUT}"
echo ""

# status / errors / resultId / first data hint
grep -E "<status>|<errormessage>|<description>|<errorno>|<resultId>|<numremaining>|<totalcount>|<data>" -n "$OUT" | head -n 80 || true
echo ""
echo "Tip: open the full response with: less \"$OUT\""
