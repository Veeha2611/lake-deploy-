#!/usr/bin/env bash
set -euo pipefail

: "${INTACCT_ENDPOINT_URL:?missing}"
: "${INTACCT_SENDER_ID:?missing}"
: "${INTACCT_SENDER_PASSWORD:?missing}"
: "${INTACCT_COMPANY_ID_PROD:?missing}"
: "${INTACCT_USER_ID_PROD:?missing}"
: "${INTACCT_USER_PASSWORD_PROD:?missing}"

CONTROL_ID="rbq_probe_prod_$(date +%Y%m%d_%H%M%S)"
REQ="/tmp/intacct_${CONTROL_ID}_request.xml"

OBJECT_1="CUSTOMER"
QUERY_1="RECORDNO > 0"
FIELDS_1="RECORDNO"

OBJECT_2="GLENTRY"
QUERY_2="RECORDNO > 0"
FIELDS_2="RECORDNO"

write_request () {
  local obj="$1" qry="$2" flds="$3" out="$4"
  cat > "$out" <<XML
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
          <object>${obj}</object>
          <query>${qry}</query>
          <fields>${flds}</fields>
          <pagesize>1</pagesize>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>
XML
}

run_one () {
  local label="$1" obj="$2" qry="$3" flds="$4"
  local req="/tmp/intacct_${CONTROL_ID}_${label}_request.xml"
  local resp="/tmp/intacct_${CONTROL_ID}_${label}_response.xml"

  write_request "$obj" "$qry" "$flds" "$req"

  curl -sS -X POST "${INTACCT_ENDPOINT_URL}" \
    -H "Content-Type: x-intacct-xml-request" \
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

run_one "customer" "$OBJECT_1" "$QUERY_1" "$FIELDS_1"
run_one "glentry"  "$OBJECT_2" "$QUERY_2" "$FIELDS_2"
