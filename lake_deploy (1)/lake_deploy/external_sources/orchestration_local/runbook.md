# Orchestration Runbook

This runbook boots the AWS-native nightly automation that keeps the curated layer fresh. The workflow wraps Glue crawlers, Athena CTAS/validations, and run artifact publishing in a Step Functions state machine triggered by EventBridge.

## Deployment
1. Ensure `AWS_PROFILE=default` and `AWS_REGION=us-east-2` are set because the stack targets us-east-2.
2. Run `orchestration/deploy_orchestration.sh` (optionally overriding `CODE_BUCKET`, `STACK_NAME`, and `SCHEDULE`). The script zips the lambda modules, uploads them to `s3://gwi-raw-us-east-2-pc/orchestration/`, and deploys the `orchestration/template.yaml` stack.
3. Confirm the schedule using `aws events list-rules --name-prefix lake-orchestration` and that the state machine appears via `aws stepfunctions list-state-machines`.
4. Glue crawlers are part of the pipeline; ensure they either exist or were deployed using `glue/deploy_crawlers.sh` before the Step Functions run.

## Nightly behavior
- The EventBridge rule runs at the configured `ScheduleExpression` (default `cron(0 7 * * ? *)`, which is 02:00 America/Chicago).
- Step Functions performs:
  1. `calc_run_date` Lambda to compute yesterday in America/Chicago.
  2. Sequential Glue crawler execution for Intacct, Platt, Salesforce, and Vetro.
  3. `lake_orchestrator` Lambda that runs CTAS/validations sequentially, waits for completion, and writes `run_summary.json`/`validation_results.json` under `s3://gwi-raw-us-east-2-pc/curated/_runs/dt={run_date}/`.
  4. A success marker object is written to S3 for downstream consumers.
- If any step fails, the state machine catches the error, publishes to `lake-orchestration-notifications`, and fails the execution.

## Verification
- Inspect `aws stepfunctions describe-execution` for the last execution (StateMachineArn available via stack outputs) to confirm success.
- Look under `s3://gwi-raw-us-east-2-pc/curated/_runs/dt=YYYY-MM-DD/` for the JSON summaries and `status.json`.
- Check SNS (`lake-orchestration-notifications`) for alerts when errors arise.
