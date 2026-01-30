#!/usr/bin/env bash
set -euo pipefail

: "${INTACCT_ENDPOINT_URL:?missing}"
: "${INTACCT_SENDER_ID:?missing}"
: "${INTACCT_SENDER_REDACTED
: "${INTACCT_COMPANY_ID_PROD:?missing}"
: "${INTACCT_USER_ID_PROD:?missing}"
: "${INTACCT_USER_PASSWORD_PROD:?missing}"

CONTROL_ID="probe_prod_v2_$(date +%Y%m%d_%H%M%S)"

call_intacct () {
  local label="$1"
  local req="/tmp/intacct_${CONTROL_ID}_${label}_request.xml"
  local resp="/tmp/intacct_${CONTROL_ID}_${label}_response.xml"

  cat > "$req"

  curl -sS -X POST "${INTACCT_ENDPOINT_URL}" \
    -H "Content-Type: application/xml" \
    -H "Accept: application/xml" \
    --data-binary @"$req" \
    -o "$resp"

  echo ""
  echo "=== ${label} ==="
  echo "request:  $req"
  echo "response: $resp"
  echo "summary:"
  grep -Eo '<status>[^<]+' "$resp" | head -n 1 || true
  grep -Eo '<errorno>[^<]+' "$resp" | head -n 1 || true
  grep -Eo '<description>[^<]+' "$resp" | head -n 1 || true
}

# 1) getAPISession (sanity)
call_intacct "get_api_session" <<XML
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
        <userid>${INTACCT_USER_ID_PROD}</userid>
        <companyid>${INTACCT_COMPANY_ID_PROD}</companyid>
        <password>${INTACCT_USER_PASSWORD_PROD}</password>
      </login>
    </authentication>
    <content>
      <function controlid="${CONTROL_ID}">
        <getAPISession/>
      </function>
    </content>
  </operation>
</request>
XML

# 2) readByQuery CUSTOMER (minimal)
call_intacct "rbq_customer" <<XML
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
        <userid>${INTACCT_USER_ID_PROD}</userid>
        <companyid>${INTACCT_COMPANY_ID_PROD}</companyid>
        <password>${INTACCT_USER_PASSWORD_PROD}</password>
      </login>
    </authentication>
    <content>
      <function controlid="${CONTROL_ID}">
        <readByQuery>
          <object>CUSTOMER</object>
          <query>RECORDNO &gt; 0</query>
          <fields>RECORDNO</fields>
          <pagesize>1</pagesize>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>
XML
