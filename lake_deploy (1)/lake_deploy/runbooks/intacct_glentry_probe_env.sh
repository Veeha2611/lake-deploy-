#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-}"
if [[ -z "$ENV_NAME" ]]; then
  echo "Usage: $0 {dev|sandbox|prod}"
  exit 2
fi

# -------------------------
# Required base variables
# -------------------------
: "${INTACCT_ENDPOINT_URL:?INTACCT_ENDPOINT_URL missing}"
: "${INTACCT_SENDER_ID:?INTACCT_SENDER_ID missing}"
: "${INTACCT_SENDER_REDACTED missing}"

# -------------------------
# Map env -> per-env vars
# You can either set:
#   INTACCT_COMPANY_ID / INTACCT_USER_ID / INTACCT_USER_PASSWORD
# OR set the per-env versions below:
#   INTACCT_COMPANY_ID_DEV, INTACCT_USER_ID_DEV, INTACCT_USER_PASSWORD_DEV, etc.
# -------------------------
case "$ENV_NAME" in
  dev)
    INTACCT_COMPANY_ID="${INTACCT_COMPANY_ID_DEV:-${INTACCT_COMPANY_ID:-}}"
    INTACCT_USER_ID="${INTACCT_USER_ID_DEV:-${INTACCT_USER_ID:-}}"
    INTACCT_USER_REDACTED
    ;;
  sandbox)
    INTACCT_COMPANY_ID="${INTACCT_COMPANY_ID_SANDBOX:-${INTACCT_COMPANY_ID:-}}"
    INTACCT_USER_ID="${INTACCT_USER_ID_SANDBOX:-${INTACCT_USER_ID:-}}"
    INTACCT_USER_REDACTED
    ;;
  prod)
    INTACCT_COMPANY_ID="${INTACCT_COMPANY_ID_PROD:-${INTACCT_COMPANY_ID:-}}"
    INTACCT_USER_ID="${INTACCT_USER_ID_PROD:-${INTACCT_USER_ID:-}}"
    INTACCT_USER_REDACTED
    ;;
  *)
    echo "Invalid env: $ENV_NAME (expected dev|sandbox|prod)"
    exit 2
    ;;
esac

: "${INTACCT_COMPANY_ID:?Missing company id for env=$ENV_NAME (set INTACCT_COMPANY_ID_${ENV_NAME^^} or INTACCT_COMPANY_ID)}"
: "${INTACCT_USER_ID:?Missing user id for env=$ENV_NAME (set INTACCT_USER_ID_${ENV_NAME^^} or INTACCT_USER_ID)}"
: "${INTACCT_USER_REDACTED user password for env=$ENV_NAME (set INTACCT_USER_PASSWORD_${ENV_NAME^^} or INTACCT_USER_PASSWORD)}"

# -------------------------
# Endpoint sanitation: fail fast if it's a Notion markdown link
# -------------------------
if [[ "$INTACCT_ENDPOINT_URL" == *"]("*")"* ]]; then
  echo "ERROR: INTACCT_ENDPOINT_URL looks like a markdown link, not a raw URL:"
  echo "  $INTACCT_ENDPOINT_URL"
  echo ""
  echo "Fix by setting:"
  echo "  export INTACCT_ENDPOINT_URL=\"https://api.intacct.com/ia/xml/xmlgw.phtml\""
  exit 2
fi

if [[ "$INTACCT_ENDPOINT_URL" != http* ]]; then
  echo "ERROR: INTACCT_ENDPOINT_URL must start with http/https. Got:"
  echo "  $INTACCT_ENDPOINT_URL"
  exit 2
fi

TS="$(date +%Y%m%d_%H%M%S)"
CONTROL_ID="glentry_probe_${ENV_NAME}_${TS}"
REQ="/tmp/intacct_${CONTROL_ID}_request.xml"
RESP="/tmp/intacct_${CONTROL_ID}_response.xml"

# -------------------------
# GLENTRY probe (minimal fields)
# -------------------------
cat > "$REQ" <<XML
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
          <fields>RECORDNO</fields>
          <pagesize>1</pagesize>
          <returnFormat>xml</returnFormat>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>
XML

# POST to Intacct
curl -sS \
  -H "Content-Type: application/xml" \
  --data-binary @"$REQ" \
  "$INTACCT_ENDPOINT_URL" \
  > "$RESP"

echo "Wrote:"
echo "  request:  $REQ"
echo "  response: $RESP"
echo ""

# Quick summary
STATUS="$(grep -oE '<status>[^<]+' "$RESP" | head -n 1 || true)"
ERRORNO="$(grep -oE '<errorno>[^<]+' "$RESP" | head -n 1 || true)"
DESC="$(grep -oE '<description>[^<]+' "$RESP" | head -n 1 || true)"
RESULTID="$(grep -oE '<resultId>[^<]+' "$RESP" | head -n 1 || true)"

echo "Summary:"
echo "  ${STATUS:-<status not found>}"
if [[ -n "$ERRORNO" ]]; then echo "  $ERRORNO"; fi
if [[ -n "$DESC" ]]; then echo "  $DESC"; fi
if [[ -n "$RESULTID" ]]; then echo "  $RESULTID"; fi

# If success, show first returned recordno if present
REC="$(grep -oE '<RECORDNO>[^<]+' "$RESP" | head -n 1 || true)"
if [[ -n "$REC" ]]; then
  echo "  $REC"
fi
