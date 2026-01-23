#!/usr/bin/env bash

# ========================================
# Intacct Credential Export Script
# ========================================

# Intacct XML Gateway endpoint (same for all envs)
export INTACCT_ENDPOINT_URL="https://api.intacct.com/ia/xml/xmlgw.phtml"

# Shared sender credentials (same for all envs)
export INTACCT_SENDER_ID="GWI2"
export INTACCT_SENDER_PASSWORD="W5FTLV2kkXJ67^"

# ========================================
# Environment selector
# Usage: source ~/intacct_env.sh [DEV|SANDBOX|PROD]
# Default: PROD
# ========================================

INTACCT_ENV="${1:-PROD}"

case "$INTACCT_ENV" in
  DEV)
    export INTACCT_COMPANY_ID="GWI2-DEV"
    export INTACCT_WS_USER_ID="datalake"
    export INTACCT_WS_USER_PASSWORD="691TKY#QEJc"
    ;;
  SANDBOX)
    export INTACCT_COMPANY_ID="GWI-sandbox"
    export INTACCT_WS_USER_ID="datalake"
    export INTACCT_WS_USER_PASSWORD="2hXOM@79dOS"
    ;;
  PROD)
    export INTACCT_COMPANY_ID="GWI"
    export INTACCT_WS_USER_ID="datalake"
    export INTACCT_WS_USER_PASSWORD="3vdhJ=Xc8V4"
    ;;
  *)
    echo "Unknown Intacct environment: $INTACCT_ENV"
    # Play nice when sourced or executed
    return 1 2>/dev/null || exit 1
    ;;
esac

echo "Intacct environment set: $INTACCT_ENV"
