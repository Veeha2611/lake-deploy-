#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
set -euo pipefail

CODE_BUCKET="${CODE_BUCKET:-gwi-raw-us-east-2-pc}"
STACK_NAME="${STACK_NAME:-lake-orchestration-stack}"
SCHEDULE="${SCHEDULE:-cron(0 7 * * ? *)}"

calc_zip="calc_run_date.zip"
lake_zip="lake_orchestrator.zip"

cd "${PWD}"
rm -f "$calc_zip" "$lake_zip"
zip -j "$calc_zip" "$SCRIPT_DIR/lambda/calc_run_date.py"
zip -j "$lake_zip" "$SCRIPT_DIR/lambda/lake_orchestrator.py"

aws s3 cp "$calc_zip" "s3://${CODE_BUCKET}/orchestration/$calc_zip"
aws s3 cp "$lake_zip" "s3://${CODE_BUCKET}/orchestration/$lake_zip"

aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file orchestration/template.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    CalcRunDateCodeBucket="$CODE_BUCKET" \
    CalcRunDateCodeKey="orchestration/$calc_zip" \
    LakeOrchestratorCodeBucket="$CODE_BUCKET" \
    LakeOrchestratorCodeKey="orchestration/$lake_zip" \
    ScheduleExpression="$SCHEDULE"

echo "Orchestration deployed. Stack: $STACK_NAME" 
aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs'
