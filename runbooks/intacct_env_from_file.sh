cat > ~/intacct_creds.sh <<'EOF'
#!/usr/bin/env bash

# Intacct XML Gateway endpoint
INTACCT_ENDPOINT_URL="https://api.intacct.com/ia/xml/xmlgw.phtml"

# Shared sender (same across envs in your current setup)
SENDER_ID="GWI2"
SENDER_PASSWORD="W5FTLV2kkXJ67^"

# DEV
COMPANY_ID_DEV=""GWI2-DEV"
WS_USER_ID_DEV="datalake"
WS_USER_PASSWORD_DEV="691TKY#QEJc"

# SANDBOX
COMPANY_ID_SANDBOX="GWI-sandbox"
WS_USER_ID_SANDBOX="datalake"
WS_USER_PASSWORD_SANDBOX="2hXOM@79dOS"

# PROD
COMPANY_ID_PROD= "GWI"
WS_USER_ID_PROD="datalake"
WS_USER_PASSWORD_PROD="3vdhJ=Xc8V4"
EOF

chmod 600 ~/intacct_creds.sh
