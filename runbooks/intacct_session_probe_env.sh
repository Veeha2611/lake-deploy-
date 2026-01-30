#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-}"
if [[ -z "$ENV_NAME" ]]; then
  echo "usage: $0 {dev|sandbox|prod}" >&2
  exit 2
fi

: "${INTACCT_ENDPOINT_URL:?missing}"
: "${SENDER_ID:?missing}"
: "${SENDER_REDACTED

case "$ENV_NAME" in
  dev)
    : "${COMPANY_ID_DEV:?missing}"; : "${WS_USER_ID_DEV:?missing}"; : "${WS_USER_PASSWORD_DEV:?missing}"
    COMPANY_ID="$COMPANY_ID_DEV"; USER_ID="$WS_USER_ID_DEV"; USER_REDACTED
    ;;
  sandbox)
    : "${COMPANY_ID_SANDBOX:?missing}"; : "${WS_USER_ID_SANDBOX:?missing}"; : "${WS_USER_PASSWORD_SANDBOX:?missing}"
    COMPANY_ID="$COMPANY_ID_SANDBOX"; USER_ID="$WS_USER_ID_SANDBOX"; USER_REDACTED
    ;;
  prod)
    : "${COMPANY_ID_PROD:?missing}"; : "${WS_USER_ID_PROD:?missing}"; : "${WS_USER_PASSWORD_PROD:?missing}"
    COMPANY_ID="$COMPANY_ID_PROD"; USER_ID="$WS_USER_ID_PROD"; USER_REDACTED
    ;;
  *)
    echo "usage: $0 {dev|sandbox|prod}" >&2
    exit 2
    ;;
esac

ts="$(date +%Y%m%d_%H%M%S)"
control_id="session_probe_${ENV_NAME}_${ts}"
req="/tmp/intacct_${control_id}_request.xml"
resp="/tmp/intacct_${control_id}_response.xml"

cat > "$req" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<request>
  <control>
    <senderid>${SENDER_ID}</senderid>
    <password>${SENDER_PASSWORD}</password>
    <controlid>${control_id}</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
    <includewhitespace>false</includewhitespace>
  </control>
  <operation>
    <authentication>
      <login>
        <userid>${USER_ID}</userid>
        <companyid>${COMPANY_ID}</companyid>
        <password>${USER_PASSWORD}</password>
      </login>
    </authentication>
    <content>
      <function controlid="${control_id}">
        <getAPISession/>
      </function>
    </content>
  </operation>
</request>
XML

curl -sS -X POST "$INTACCT_ENDPOINT_URL" \
  -H "Content-Type: x-intacct-xml-request" \
  --data-binary @"$req" > "$resp"

echo "env:      $ENV_NAME"
echo "control:  $control_id"
echo "req:      $req"
echo "resp:     $resp"
grep -nE '<status>|<errorno>|<description>|<sessionid>|<endpoint>|<locationid>' "$resp" || true
