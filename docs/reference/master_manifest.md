# Master Manifest (Sanitized)

## Repo Structure
- `athena/` — DDL, curated views, SSOT SQL, and legacy CTAS
- `automation/` — Lambda code and CloudFormation for Vetro exports
- `docs/` — Data Lake Bible and governance documentation
- `external_sources/` — Legacy scripts/configs (sanitized, reference only)
- `orchestration/` — Manifest templates and rollup SQL
- `runbooks/` — Operational runbooks and helper scripts
- `scripts/` — SSOT daily + global orchestrator
- `release-log/` — Release governance templates

## Primary Sources (Current)
- Vetro
- Intacct
- Platt
- Gaiia
- Salesforce
- Monday/Base44 input pipeline
- Manual investor/doc ingestion

## Proof Artifacts
- Manifests: `s3://gwi-raw-us-east-2-pc/orchestration/<system>_daily/run_date=YYYY-MM-DD/manifest.json`
- Example proof packs: `docs/proofs/`

## Intake Content
- File-level intake manifests:
  - `docs/reference/intake_manifest.md`
  - `docs/reference/source_exports_manifest.md`

## Security
- Secrets are referenced by name only; no credentials included.
- Secret handling policy: `docs/security/secrets_handling.md`

