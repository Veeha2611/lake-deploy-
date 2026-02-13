# Access And Environment

This document captures the infrastructure access and environment requirements needed to operate and codify the current lake into IaC.

## Scope
- AWS account access and role model (least privilege)
- MFA and identity constraints
- Required AWS services and regions
- Migration constraints (Mac Mountain AWS -> LightCraft AWS)

## Current AWS Environment (Mac Mountain)
- Primary region: `us-east-2`
- Primary Athena workgroup: `primary`
- Primary raw bucket: `gwi-raw-us-east-2-pc`
- Curated bucket (where applicable): `gwi-curated-us-east-2-pc`

### Data Plane Services In Use (Non-Exhaustive)
- S3 (raw landings, curated outputs, orchestration artifacts, Athena outputs)
- Glue Data Catalog (databases, tables, crawlers)
- Athena (validation, reconciliation, SSOT gating)
- Lambda (ingestion helpers, orchestrators, exports)
- EventBridge (schedules and triggers)
- ECS (long-running backfills where applicable)
- DynamoDB (case/runtime state where applicable)
- Secrets Manager (credentials, tokens, DSNs)
- CloudWatch Logs/Metrics/Alarms (operational telemetry)
- CloudTrail (audit logging)
- KMS (encryption at rest)

## Identity, Access, and MFA
### Human Access
Principles:
- Use SSO where possible.
- Require MFA for console access.
- Avoid long-lived access keys for humans.

Recommended minimum roles:
- `ReadOnlyAudit`:
  - Read-only access to S3 inventory, Glue catalog, Athena workgroups, CloudWatch, CloudTrail.
- `OpsEngineer`:
  - Ability to execute orchestrations and runbooks, with write access restricted to approved prefixes.
- `DataSteward`:
  - Ability to review and approve SSOT gates, exceptions, and reconciliation evidence.

### CI/CD and Automation Access
Principles:
- Use short-lived credentials (OIDC -> AssumeRole) for CI.
- Separate deploy roles from read-only roles.
- Constrain roles with:
  - explicit allowlists (buckets/prefixes, Glue DBs, Athena workgroups)
  - session tagging and CloudTrail visibility
  - permission boundaries for partner access

Recommended minimum automation roles (least privilege):
- `IaCDeployer`:
  - Creates/updates IaC-managed resources (S3, IAM, Glue, Athena, Lambda/ECS, EventBridge, CloudWatch, DynamoDB, KMS, Secrets Manager policies).
  - No read of secret values; reference secret names only.
- `LakeQueryRunner`:
  - Executes Athena queries in approved workgroups.
  - Reads from approved S3 data prefixes; writes query outputs to a configured Athena output prefix.
- `IngestionRunner` (per source where needed):
  - Writes to a source-specific raw landing prefix (and related manifests/checkpoints).
  - Invokes Glue crawlers for the source.
- `OrchestratorRuntime`:
  - Runs scheduled jobs (Lambda/ECS) and writes orchestration artifacts and SSOT evidence packs.

## Secrets Manager (Names Only)
Secret names and prerequisites are documented in:
- `docs/access_prereqs.md`

## Connectivity Constraints (Native Systems)
Some native sources are not reachable from the public internet. Example:
- Platt native database access may require VPN and private DNS resolution.

Operational requirement:
- Validate reachability before declaring mirror parity.

## Migration Constraints (Mac Mountain -> LightCraft)
Codification and migration should preserve production contracts:
- Preserve S3 prefix contracts (prefixes are production interfaces).
- Preserve partitioning conventions (e.g., `dt=YYYY-MM-DD` where applicable).
- Preserve evidence pack and orchestration output locations.
- Preserve encryption requirements (KMS) and prevent secrets from entering state or version control.

Recommended migration approach:
- Codify current resources in the source account first (as-is).
- Prove parity and reproducibility via evidence packs.
- Migrate to the target account in small, reversible increments (dual-run where possible).

