#!/usr/bin/env bash
set -euo pipefail

RUN_DATE="${1:-$(date +%F)}"
WORKGROUP="${ATHENA_WORKGROUP:-primary}"
OUTPUT="${ATHENA_OUTPUT_LOCATION:-s3://gwi-raw-us-east-2-pc/athena-results/}"

# Global SSOT completeness gates (hard stop on failure)
RUN_DATE="$RUN_DATE" /Users/patch/lake_deploy/runbooks/ssot_global_gates.sh

run_query() {
  local q="$1"
  aws athena start-query-execution \
    --work-group "$WORKGROUP" \
    --result-configuration OutputLocation="$OUTPUT" \
    --query-string "$q" \
    --output text --query 'QueryExecutionId'
}

run_sql_file() {
  local file_path="$1"
  python3 - <<'PY' "$file_path" | while IFS= read -r -d '' stmt; do
import re
import sys
path = sys.argv[1]
text = open(path, "r", encoding="utf-8").read()
parts = [p.strip() for p in text.split(";") if p.strip()]
for p in parts:
    stripped = re.sub(r"--.*", "", p).strip()
    if stripped:
        # Use NUL to preserve multi-line statements in shell read loop
        sys.stdout.write(p + ";\\0")
PY
    run_query "$stmt" >/dev/null
    sleep 0.2
  done
}

# Apply SSOT framework tables (idempotent). Athena allows only one statement per query.
run_sql_file /Users/patch/lake_deploy/athena/curated/ssot/00_ssot_framework_tables.sql

# Apply SSOT views
for f in /Users/patch/lake_deploy/athena/curated/ssot/10_ssot_customers.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/20_ssot_salesforce_accounts.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/30_ssot_platt_customers.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/40_ssot_intacct_gl_entries.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/41_ssot_intacct_enrichment.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/48_ssot_gaiia_graphql_current_views.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/49_ssot_gaiia_accounts.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/50_ssot_gaiia_customers.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/51_ssot_gaiia_invoices.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/52_ssot_gaiia_subscriptions_services.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/60_ssot_canonical_dimensions.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/70_ssot_xwalk_autogen.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/71_ssot_dim_autogen.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/61_ssot_source_priority_rules.sql \
         /Users/patch/lake_deploy/athena/curated/ssot/62_ssot_reconciliation_views.sql; do
  run_sql_file "$f"
  sleep 0.5
 done

# Rollup (template)
rollup_sql=$(sed "s/:run_date/${RUN_DATE}/g" /Users/patch/lake_deploy/orchestration/ssot_daily_rollup.sql)
run_query "$rollup_sql" >/dev/null

echo "SSOT daily rollup submitted for ${RUN_DATE}" 
