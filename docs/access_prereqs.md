# Access Prerequisites

## AWS
- IAM access to S3 bucket `gwi-raw-us-east-2-pc`
- Athena query execution permissions
- Secrets Manager read permissions for named secrets (names only in repo)

## Required Secrets (names only)
- `vetro/api_token` (Vetro API token)
- `monday/prod` (Monday API key, workspace id, board id)
- `notion/prod` (Notion integration token, root page id)
- `salesforce/prod/oauth` (Salesforce OAuth)
- `intacct/prod` (Intacct sender/user credentials)

## Local Environment
- AWS CLI configured (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`)
- Python 3 for scripts
- jq for JSON processing

