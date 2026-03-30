# Data Lake — Future State Architecture

## Goals
- Fully automated ingestion across all sources
- Typed contracts per source with automated schema drift detection
- SSOT guardrails with alerting and exception triage
- Rebuildable from IaC + documented runbooks

## Target Enhancements
- **Ingestion**: Standardize all sources on date-partitioned raw layouts and consistent manifest artifacts.
- **Schema contracts**: Formalize DDL contracts per source and version them in repo.
- **Reconciliation**: Add automated thresholds and incident logging for recon failures.
- **Orchestration**: Central scheduler that coordinates system runs and emits a unified run report.
- **Observability**: Dashboards for freshness, lag, exception counts, and SLA compliance.

## Knowledge Lane
- Expand knowledge ingestion beyond Notion to include internal playbooks and data dictionaries.
- Maintain an index in S3 for quick retrieval and QID-linked evidence.

## Security
- Secrets only in AWS Secrets Manager; IaC creates containers but never commits values.
- Continuous secret scanning in CI.

