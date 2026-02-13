# IaC Kickoff Brief (2026-02-13)

Audience: IaC delivery partner (OnPoint)  
Repository: `lake_deploy`

## TL;DR
We have an operating AWS data lake with a raw-to-curated SSOT pattern and an application (MAC App) consuming curated queries. The immediate IaC goal is to **codify the current system** (S3/Glue/Athena/orchestration/secrets/permissions/CI) without redesigning business logic, then add drift detection and repeatable environments.

## Current State (What Exists Today)
- **Storage**: S3 is the system of record (raw landings + curated outputs).
- **Catalog/Query**: Glue Data Catalog + Athena workgroups for lake queries and validation.
- **Orchestration**: scheduled scripts/jobs write manifests and SSOT guard artifacts under orchestration prefixes.
- **SSOT**: raw → curated_core → curated_recon → curated_ssot, with evidence packs (Athena QIDs + S3 paths).
- **MAC App**: a console that runs vetted queries (AWS-only mode) and stores evidence for reproducibility.

## Codify vs Redesign
Codify now:
- Buckets/prefix contracts, Glue DB/table definitions, Athena workgroups + outputs
- Orchestration runtimes (Lambda/ECS/EventBridge), concurrency limits, retries
- IAM least-privilege roles + policies for ingestion and query execution
- Secrets Manager secret *names* and access policies
- CI checks: sanitization scan, drift checks, smoke checks

Defer redesign:
- metric definitions and dashboard tile semantics
- crosswalk matching rules beyond what is required to make identities deterministic

## Migration Constraints (LightCraft Account)
- Preserve S3 layouts (prefix contracts are production interfaces).
- No secrets in Git or IaC state; only secret *names* are referenced.
- Encrypt at rest, enforce least privilege, and log changes (CloudTrail).
- Minimize downtime; changes should be deployable in small, reversible increments.

## Access / Environment Checklist
AWS:
- Account: `702127848627`
- Region: `us-east-2`
- Athena workgroup: `primary`

S3 (key buckets):
- `gwi-raw-us-east-2-pc` (raw landings, orchestration artifacts, Athena outputs)
- `gwi-curated-us-east-2-pc` (curated outputs where applicable)
- `gwi-staging-pc` (staging/temporary where applicable)

Glue / Athena logical databases (examples):
- `raw_*` (source-native landings)
- `curated_core` (query-ready normalized layer)
- `curated_recon` (exceptions + reconciliation)
- `curated_ssot` (daily SSOT guards / summaries)

Secrets Manager (names only; see `docs/access_prereqs.md`):
- `salesforce/api_credentials`
- `intacct/credentials`
- `platt/credentials`
- `gaiia/api_keys`
- `monday/prod`

Connectivity:
- Platt native DB access may require VPN; validate connectivity before declaring mirror parity.

## Decisions Needed From IaC Team (Kickoff)
- Framework: CDK vs Terraform (and where state will live).
- Environment strategy: dev/stage/prod separation and naming/tagging conventions.
- How Glue/Athena artifacts are managed: DDL in code vs generated, and change approval flow.
- Orchestration standard: ECS vs Lambda-first, and how backfills/resume checkpoints are handled.

## Proposed Milestones
1) Inventory: enumerate buckets/prefixes, Glue DBs/tables/crawlers, scheduled jobs, IAM roles.
2) Baseline IaC: codify current resources “as-is” + tagging/guards; no behavior change.
3) Drift detection: CI checks + periodic drift reports.
4) Orchestration codification: standardize schedules, retry policy, checkpoints, and evidence outputs.
5) Cutover: run parallel validations, then transition ownership to IaC-managed deployments.

