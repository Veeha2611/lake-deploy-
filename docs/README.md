# Data Lake Bible — Index

This documentation set is the authoritative, sanitized reference for rebuilding and operating the data lake.

## Contents
- **IaC kickoff brief**: `docs/IAC_KICKOFF_BRIEF.md`
- **Access & environment**: `docs/ACCESS_AND_ENVIRONMENT.md`
- **CI/CD + Terraform backend**: `docs/CI_CD_AND_TERRAFORM_BACKEND.md`
- **Observability & alerting**: `docs/OBSERVABILITY_AND_ALERTING.md`
- **Governance**: `docs/GOVERNANCE.md`
- **Known gaps & risk**: `docs/KNOWN_GAPS_AND_RISK.md`
- **Architecture**: `docs/architecture/data_lake_architecture.md`
- **S3 layout**: `docs/architecture/s3_layout.md`
- **Schema inventory**: `docs/schema/table_inventory.md`
- **SSOT policy**: `docs/ssot/SSOT_POLICY.md`
- **Orchestration & schedules**: `docs/orchestration/orchestration.md`
- **Reconciliation & exceptions**: `docs/ssot/reconciliation.md`
- **Proofs & evidence**: `docs/proofs/proofs.md`
- **Security & secrets handling**: `docs/security/secrets_handling.md`
- **Integrations**: `docs/integrations/`
- **Runbooks**: `runbooks/`
- **External source map**: `docs/reference/external_sources_map.md`
- **Local source catalog**: `docs/reference/local_source_catalog.md`
- **Forensic audit summary**: `docs/reference/forensic_audit_summary.md`
- **Master manifest**: `docs/reference/master_manifest.md`

## Deployed vs Future
Each document explicitly separates **Deployed Today** vs **Planned / Future** sections.

## Change Management
- Release log: `release-log/RELEASE_LOG.md`
- IaC templates live under `automation/` and `athena/`
- Ingestion runbooks: `docs/runbooks/ingestion_index.md`
- Executive summary: `docs/executive_summary.md`
- Architecture diagram: `docs/architecture/diagrams/data_lake_current.mmd`
