#!/usr/bin/env bash
set -euo pipefail

source "${HOME}/intacct_env.sh"

COMPANY_ID="${COMPANY_ID_DEV}"
WS_USER_ID="${WS_USER_ID_DEV}"
WS_USER_PASSWORD="${WS_USER_PASSWORD_DEV}"

RUN_DATE="$(date +%F)"
RUN_DIR="${HOME}/intacct_ingest/${COMPANY_ID}/${RUN_DATE}"

mkdir -p "${RUN_DIR}"

REQUEST_XML="<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<request>
  <control>
    <senderid>${SENDER_ID}</senderid>
    <password>${SENDER_PASSWORD}</password>
    <controlid>glaccount-dev-readbyquery</controlid>
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
      <function controlid=\"glaccount_read\">
        <readByQuery>
          <object>GLACCOUNT</object>
          <fields>*</fields>
          <query>RECORDNO &gt; 0</query>
          <pagesize>1000</pagesize>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>"

OUT_XML="${RUN_DIR}/gl_accounts_response.xml"

curl -s \
  -H "Content-Type: application/xml" \
  -d "${REQUEST_XML}" \
  "https://api.intacct.com/ia/xml/xmlgw.phtml" \
  > "${OUT_XML}"

echo "Wrote DEV GLACCOUNT XML to: ${OUT_XML}"
xmllint --format "${OUT_XML}" | sed -n '1,40p' || sed -n '1,40p' "${OUT_XML}"
