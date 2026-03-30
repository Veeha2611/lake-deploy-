This document defines the complete, reproducible path to rebuild and operate the data lake.

## Audit Status
- As of 2026-01-30: latest S3 inventory sweep recorded under `docs/reference/aws_s3_inventory_summary_2026-01-30.md` and raw inventory files.
- As of 2026-01-30: intake manifests validated (path existence check: 0 missing).
- As of 2026-01-30: high-risk secret scan: 0 files matched AWS keys/JWTs.


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
- Policy: `docs/ssot/SSOT_POLICY.md`
- Exceptions: `docs/ssot/reconciliation.md`
- Authoritative artifacts: `docs/reference/authoritative_artifacts_2026-01-30.md`
- Legacy (stale) artifacts: external archive (see `docs/reference/stale_artifact_move_log_2026-01-30.md` for paths and provenance).

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

## Status Statement (2026-02-13)
This repository contains a reproducible inventory of the data lake (S3 prefix contracts, Glue/Athena definitions, runbooks, and SSOT audit harnesses).

SSOT certification is **evidence-gated** and may be `PASS` / `WARN` / `FAIL` by domain on any given run date based on the latest evidence packs under `ssot_audit/`.

For current readiness and open items, use:
- `docs/KNOWN_GAPS_AND_RISK.md` (risk register + evidence references)
- `docs/ssot/SSOT_RUNBOOK.md` (how SSOT gates are run and interpreted)
- `ssot_audit/` (timestamped evidence packs; each includes `status.json` + QIDs)

## Ingestion Runbooks
- `docs/runbooks/ingestion_index.md`
- `docs/schema/ingestion_schema_overview.md`

## Executive Summary
- `docs/executive_summary.md`
- `docs/architecture/diagrams/data_lake_current.mmd`
