#!/usr/bin/env bash
set -euo pipefail

INVENTORY_FILE="${1:-glue/crawlers.yaml}"
STACK_NAME="${STACK_NAME:-glue-crawlers-stack}"
ROLE_NAME="${CRAWLER_ROLE_NAME:-glue-crawler-role}"

if [[ ! -f "$INVENTORY_FILE" ]]; then
  echo "Inventory $INVENTORY_FILE missing" >&2
  exit 1
fi

python3 - <<PY
import json, pathlib
path = pathlib.Path("$INVENTORY_FILE")
data = json.loads(path.read_text())
print("Configured crawlers:")
for crawler in data:
    targets = ", ".join(crawler.get("s3_targets", []))
    print(f"- {crawler['crawler_name']} -> {targets}")
PY

echo "Deploying Glue crawlers via CloudFormation stack $STACK_NAME..."
aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file glue/deploy_crawlers.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides CrawlerRoleName="$ROLE_NAME"

echo "Deployment complete. Listing crawlers:"
aws glue get-crawlers --query 'Crawlers[*].{Name:Name,State:State}' --output table
