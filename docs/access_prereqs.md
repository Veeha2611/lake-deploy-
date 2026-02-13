# Access Prerequisites

## AWS
- IAM access to S3 bucket `gwi-raw-us-east-2-pc`
- Athena query execution permissions
- Secrets Manager read permissions for named secrets (names only in repo)

## Required Secrets (names only)
- `vetro/api_token` (Vetro API token)
- `monday/prod` (Monday API key, workspace id, board id)
- `notion/prod` (Notion integration token, root page id)
- `gaiia/api_keys` (Gaiia API token)
- `salesforce/api_credentials` (Salesforce OAuth: refresh_token + client_id + client_secret; access_token optional)
- `salesforce/sandbox/api_credentials` (optional sandbox OAuth)
- `intacct/credentials` (Intacct sender/user credentials)
- `platt/credentials` (Platt DB or file export access)

## Local Environment
- AWS CLI configured (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`)
- Python 3 for scripts
- jq for JSON processing
- FortiClient VPN (required for Platt DB access)
- `nc` (netcat) recommended for connectivity checks

**Platt VPN**
Platt DB access requires FortiClient. Use `runbooks/platt_vpn_preflight.sh` to verify connectivity; complete VPN login/MFA if the port check fails.
