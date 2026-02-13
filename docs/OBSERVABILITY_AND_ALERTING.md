# Observability And Alerting

This document defines observability and alerting requirements for the lake, SSOT gates, and operational workflows.

## Goals
- Detect pipeline failures quickly.
- Detect data quality regressions (freshness, completeness, schema drift).
- Detect reconciliation variance beyond tolerance.
- Provide auditable traces of changes and access.

## Logging
### CloudWatch Logs
Minimum requirements:
- All Lambda functions log to CloudWatch Logs with structured, searchable messages.
- ECS tasks (where used) stream stdout/stderr to CloudWatch Logs.
- Log retention policy is explicitly set (not "never expire").

Recommended fields for structured logs:
- `run_date`
- `system` / `source`
- `job_name`
- `status` (ok/warn/fail)
- `s3_prefixes_touched` (prefixes only)
- `athena_query_execution_id` (when applicable)

### S3 Access Logs (Optional)
If enabled, write access logs to a dedicated logging bucket/prefix with lifecycle policies.

## Metrics and Dashboards
Minimum metrics to track:
- Ingestion success/failure count by source
- Latest successful `dt` partition per source table
- Athena query failure rate and latency (by workgroup)
- Glue crawler outcomes (success/failure duration)
- SSOT gate status (PASS/WARN/FAIL) and trend over time
- Reconciliation variance for key KPIs (with tolerance thresholds)

Recommended dashboards:
- Daily ingestion health (all sources)
- SSOT gate health (pass/fail counts and top failures)
- Reconciliation variance (top KPI deltas, time series)
- Freshness SLA compliance (per source and per SSOT entity)

## Alerting
Minimum alert types:
- Pipeline failure (Lambda errors, ECS task failures, EventBridge trigger failures)
- Data quality breach (empty tables, stale partitions beyond SLA, schema drift)
- Reconciliation variance beyond tolerance (per governance thresholds)
- Sustained retry loops or stalled checkpoints (no progress for N intervals)

Recommended delivery mechanisms:
- SNS topics per environment (dev/stage/prod)
- Integration to chat/on-call tooling via subscriptions (email/webhook as applicable)

## CloudTrail and Auditability
Minimum requirements:
- CloudTrail enabled for management events across all regions in the account.
- Centralized storage of CloudTrail logs in an encrypted S3 bucket.
- Alerts or periodic reports for:
  - IAM policy/role changes
  - Secrets Manager policy changes
  - S3 bucket policy and public-access block changes
  - KMS key policy changes

## Operational Runbooks
Operational procedures should reference:
- How to identify failures (alarm -> logs -> evidence packs)
- How to rerun safely (idempotence, checkpoints, no parallel runs for same window)
- How to escalate (owners, timelines)

See:
- `runbooks/native_reconciliation.md`
- `docs/ssot/SSOT_RUNBOOK.md`

