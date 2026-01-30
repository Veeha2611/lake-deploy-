#!/usr/bin/env bash
set -euo pipefail

: "${INTACCT_SENDER_ID:?Missing INTACCT_SENDER_ID}"
: "${INTACCT_COMPANY_ID:?Missing INTACCT_COMPANY_ID}"
: "${INTACCT_USER_ID:?Missing INTACCT_USER_ID}"

if [[ -z "${INTACCT_SENDER_REDACTED ]]; then
  stty -echo; read -r -p "INTACCT_SENDER_PASSWORD (hidden): " INTACCT_SENDER_PASSWORD; stty echo; echo ""
fi
if [[ -z "${INTACCT_WS_USER_REDACTED ]]; then
  stty -echo; read -r -p "INTACCT_WS_USER_PASSWORD (hidden): " INTACCT_WS_USER_PASSWORD; stty echo; echo ""
fi

REQ_XML=$(cat <<XML
<?xml version="1.0" encoding="utf-8"?>
<request>
  <control>
    <senderid>${INTACCT_SENDER_ID}</senderid>
    <password>${INTACCT_SENDER_PASSWORD}</password>
    <controlid>GLACCOUNT_KEYS_TEST</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <login>
        <userid>${INTACCT_USER_ID}</userid>
        <companyid>${INTACCT_COMPANY_ID}</companyid>
        <password>${INTACCT_WS_USER_PASSWORD}</password>
      </login>
    </authentication>
    <content>
      <function controlid="glaccount_keys_test">
        <readByQuery>
          <object>GLACCOUNT</object>
          <query></query>
          <pagesize>1</pagesize>
          <fields>RECORDNO</fields>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>
XML
)

echo "Submitting GLACCOUNT keys test..."
curl -sS -X POST https://api.intacct.com/ia/xml/xmlgw.phtml \
  -H 'Content-Type: application/xml' \
  -d "$REQ_XML" | head -n 50
