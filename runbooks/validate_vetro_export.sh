#!/bin/bash
set -euo pipefail

export AWS_PROFILE=default
export AWS_REGION=us-east-2
export AWS_PAGER=""

STACK_NAME="vetro-export-automation"

OUTPUTS_JSON="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs' --output json)"

VETRO_LAMBDA_NAME="$(python - <<'PY'
import json, sys
outputs = json.load(sys.stdin)
for item in outputs:
    if item.get("OutputKey") == "VetroLambdaName":
        print(item.get("OutputValue"))
        sys.exit(0)
sys.exit(1)
PY
<<<"$OUTPUTS_JSON")"

VETRO_DLQ_URL="$(python - <<'PY'
import json, sys
outputs = json.load(sys.stdin)
for item in outputs:
    if item.get("OutputKey") == "VetroDlqUrl":
        print(item.get("OutputValue"))
        sys.exit(0)
sys.exit(1)
PY
<<<"$OUTPUTS_JSON")"

echo "Lambda name: $VETRO_LAMBDA_NAME"
echo "DLQ URL: $VETRO_DLQ_URL"

aws logs describe-log-streams \
  --log-group-name "/aws/lambda/${VETRO_LAMBDA_NAME}" \
  --order-by LastEventTime \
  --descending \
  --limit 5

echo "Recent raw/vetro objects (last 50):"
aws s3 ls s3://gwi-raw-us-east-2-pc/raw/vetro/ --recursive | tail -n 50

echo "dt partition pattern check for the last 50 keys:"
aws s3 ls s3://gwi-raw-us-east-2-pc/raw/vetro/ --recursive | tail -n 50 | awk '{print $4}' | python - <<'PY'
import re, sys
keys = [line.strip() for line in sys.stdin if line.strip()]
errs = []
for key in keys:
    if not re.search(r'dt=\d{4}-\d{2}-\d{2}', key):
        errs.append(key)
if errs:
    print("Missing dt in keys:")
    for key in errs:
        print("  ", key)
    sys.exit(1)
print("dt partition check: OK")
PY

aws glue start-crawler --name vetro-raw-crawler || true
