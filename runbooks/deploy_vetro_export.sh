#!/bin/bash
set -euo pipefail

export AWS_PROFILE=default
export AWS_REGION=us-east-2
export AWS_PAGER=""

STACK_NAME="vetro-export-automation"
S3_ZIP="/tmp/vetro_export_lambda.zip"
ZIP_SOURCE="automation/lambda/vetro_export_lambda.py"
LAMBDA_CODE_BUCKET="gwi-raw-us-east-2-pc"
LAMBDA_CODE_KEY="orchestration/lambda-code/vetro_export_lambda.zip"
PLAN_IDS="planA,planB"
EXPORT_PREFIX="raw/vetro"
STATE_KEY="vetro_export_state/plan_index.json"
SCHEDULE="rate(60 minutes)"

zip -j "$S3_ZIP" "$ZIP_SOURCE"
aws s3 cp "$S3_ZIP" "s3://${LAMBDA_CODE_BUCKET}/${LAMBDA_CODE_KEY}"

aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file automation/cf/vetro_export_stack.yaml \
  --parameter-overrides \
      LambdaCodeBucket="${LAMBDA_CODE_BUCKET}" \
      LambdaCodeKey="${LAMBDA_CODE_KEY}" \
      PlanIds="${PLAN_IDS}" \
      VetroTokenSecret="<vetro_token_secret_name>" \
      ExportBucket="${LAMBDA_CODE_BUCKET}" \
      ExportPrefix="${EXPORT_PREFIX}" \
      StateBucket="${LAMBDA_CODE_BUCKET}" \
      StateKey="${STATE_KEY}" \
      ScheduleExpression="${SCHEDULE}" \
  --capabilities CAPABILITY_NAMED_IAM

aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs'
