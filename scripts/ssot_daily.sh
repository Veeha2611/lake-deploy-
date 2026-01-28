#!/usr/bin/env bash
set -euo pipefail

RUN_DATE="${1:-$(date +%F)}"
WORKGROUP="${ATHENA_WORKGROUP:-primary}"
OUTPUT="${ATHENA_OUTPUT_LOCATION:-s3://gwi-raw-us-east-2-pc/athena-results/}"

run_query() {
  local q="$1"
  aws athena start-query-execution \
    --work-group "$WORKGROUP" \
    --result-configuration OutputLocation="$OUTPUT" \
    --query-string "$q" \
    --output text --query 'QueryExecutionId'
}

# Apply SSOT framework tables (idempotent)
run_query "$(cat /Users/patch/lake_deploy/athena/curated/ssot/00_ssot_framework_tables.sql)" >/dev/null

# Apply SSOT views
for f in /Users/patch/lake_deploy/athena/curated/ssot/10_ssot_customers.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/20_ssot_salesforce_accounts.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/30_ssot_platt_customers.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/40_ssot_intacct_gl_entries.sql; do
  run_query "$(cat "$f")" >/dev/null
  sleep 0.5
 done

# Rollup (template)
rollup_sql=$(sed "s/:run_date/${RUN_DATE}/g" /Users/patch/lake_deploy/orchestration/ssot_daily_rollup.sql)
run_query "$rollup_sql" >/dev/null

echo "SSOT daily rollup submitted for ${RUN_DATE}" 
