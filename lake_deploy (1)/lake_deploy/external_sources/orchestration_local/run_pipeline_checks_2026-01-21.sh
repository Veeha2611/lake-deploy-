#!/usr/bin/env bash
set -euo pipefail
export AWS_REGION=us-east-2
export AWS_DEFAULT_REGION=us-east-2
export AWS_PROFILE=default
export ATHENA_WORKGROUP=primary
export ATHENA_OUT=s3://gwi-raw-us-east-2-pc/athena-results/

aws sts get-caller-identity --region "$AWS_REGION"

q() {
  local name="$1"
  local sql="$2"
  local qid
  qid="$(aws athena start-query-execution \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" \
    --work-group "$ATHENA_WORKGROUP" \
    --query-string "$sql" \
    --result-configuration OutputLocation="$ATHENA_OUT" \
    --output text --query QueryExecutionId)"
  echo "$name | $qid"
}

q "dt_visibility_pre" "SELECT DISTINCT dt FROM raw_sheets.passings_pipeline_totals ORDER BY dt DESC LIMIT 50"

ls -lah passings_pipeline_totals_2026-01-21.csv
bash ./land_pipeline_passings.sh 2026-01-21

q "msck_repair" "MSCK REPAIR TABLE raw_sheets.passings_pipeline_totals"
q "dt_visibility_post" "SELECT DISTINCT dt FROM raw_sheets.passings_pipeline_totals ORDER BY dt DESC LIMIT 50"
q "split_view" "SELECT * FROM curated_core.v_passings_bulk_retail_split ORDER BY dt DESC LIMIT 200"
