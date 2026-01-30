This document defines the complete, reproducible path to rebuild and operate the data lake.

## Audit Status
- Latest S3 inventory sweep recorded under docs/reference/aws_s3_inventory_summary_2026-01-30.md and raw inventory files.
- Intake manifests validated (path existence check: 0 missing).
- High-risk secret scan: 0 files matched AWS keys/JWTs.


## 1) Objective
This document defines the complete, reproducible path to rebuild and operate the data lake.

## 2) System of Record
- **System of record**: S3 bucket `gwi-raw-us-east-2-pc`
- **Query layer**: Athena
- **Orchestration**: Lambda + scripts + daily manifest pattern

## 3) Architecture
See:
- `docs/architecture/data_lake_architecture.md`
- `docs/architecture/s3_layout.md`
- `docs/architecture/base44_app_architecture.md` (Base44 app wiring & data contracts)
- App source: `apps/mac-mountain-insights-console/`
 - Audit summary: `docs/reference/forensic_audit_summary.md`
 - Intake manifest: `docs/reference/intake_manifest.md`
 - Source exports manifest: `docs/reference/source_exports_manifest.md`

## 4) Bootstrapping (High Level)
1. Create Athena databases/schemas.
2. Apply raw DDLs (Vetro, Platt, Intacct, etc.).
3. Apply curated views and SSOT schemas.
4. Deploy automation (Vetro Lambda + schedules).
5. Validate with proof queries and manifests.

## 4a) Governing Manifests
- `docs/reference/intake_manifest.md`
- `docs/reference/source_exports_manifest.md`
- `docs/reference/master_manifest.md`
- `docs/reference/local_source_catalog.md`
- `docs/reference/local_source_roots.md`
- `docs/reference/source_copy_log.md`

## 5) Source Systems
- Vetro: `docs/integrations/vetro.md`
- Intacct: `docs/integrations/intacct.md`
- Platt: `docs/integrations/platt.md`
- Gaiia: `docs/integrations/gaiia.md`
- Salesforce: `docs/integrations/salesforce.md`
- Monday/Base44: `docs/integrations/base44_monday.md`
- Manual docs: `docs/integrations/manual_docs.md`

## 5a) Base44 Governance Artifacts
- `docs/reference/base44_pipeline_update.md`
- `docs/reference/base44_structured_response.md`
- `docs/reference/base44_architecture_export_2026-01-27.md`

## 6) SSOT & Reconciliation
- Policy: `docs/ssot/ssot_policy.md`
- Exceptions: `docs/ssot/reconciliation.md`
 - Authoritative artifacts: `docs/reference/authoritative_artifacts_2026-01-30.md`
 - Legacy (stale) artifacts: `vetro/lake_deploy_intake/legacy_artifacts_2026-01-30/`

## 7) Orchestration
- `docs/orchestration/orchestration.md`
- Daily runbooks: `docs/reference/daily_runbooks.md`

## 7a) Runbooks & Rebuild Guides
- `docs/reference/rebuild_guide.md`
- `docs/reference/vetro_base44_runbook.md`

## 8) Proofs & Evidence
- `docs/proofs/proofs.md`
- Example manifest: `docs/proofs/run_manifest_example.json`
- Example proof pack: `docs/proofs/investor_proof_pack_example.json`

## 9) Security & Secrets
- `docs/security/secrets_handling.md`
- `docs/access_prereqs.md`

## 10) Release Governance
- Release log template: `release-log/RELEASE_LOG.md`
- Tagging scheme: `mac-YYYYMMDD-vX`

## 11) Deployed vs Planned
Each subsystem doc includes a **Deployed Today** and **Planned / Future** section.

## 12) Legacy/External Source Materials
Imported legacy scripts and configs live in `external_sources/` for reference only.
See `docs/reference/external_sources_map.md` for what was preserved.

## Completion Statement
I have fully audited, cataloged, and sanitized all non-Vetro data lake artifacts.
I can reconstruct the current state of the data lake today from this repository and the recorded S3 inventories.
The only remaining gap is completion of Vetro plan exports and the final reconciliation that depends on them.
See `docs/reference/vetro_remaining_work_2026-01-30.md`.

## Ingestion Runbooks
- `docs/runbooks/ingestion_index.md`
- `docs/schema/ingestion_schema_overview.md`

## Executive Summary
- `docs/executive_summary.md`
- `docs/architecture/diagrams/data_lake_current.mmd`
