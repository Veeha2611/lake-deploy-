# External Sources Map (Imported)

This repo includes an `external_sources/` folder to preserve legacy scripts and configs that were used to build the lake. These are sanitized (no secrets) and trimmed to code/config only.

## Folders
- `external_sources/curation/` — Athena DDL/CTAS and curated view logic
- `external_sources/orchestration_local/` — Local orchestration utilities and templates
- `external_sources/ingest_local/` — One-off ingest helpers
- `external_sources/glue_local/` — Glue crawler definitions and deploy helpers
- `external_sources/ops_raw_platt/` — Platt headers, DDL generators, samples (no production data)
- `external_sources/gaiia_ingest/` — Gaiia ingest scripts (no discovery outputs)
- `external_sources/vetro_ingest/` — Vetro ingest scripts (no raw plan data)
- `external_sources/intacct_ingest_local/` — Intacct ingest scripts (no dated run outputs)
- `external_sources/aws_local/` — Lambda stacks and infra stubs
- `external_sources/lake_runbook/` — Prior runbook drafts
- `external_sources/lake_qa_proofpack/` — Proof-pack scaffolding
- `external_sources/data_lake_reconciliation/` — Reconciliation notebooks/scripts

## Notes
- All dated run artifacts and discovery outputs were removed.
- Any file that appeared to contain credentials or session material was excluded.
- Use these as reference material; the authoritative runbooks live in `docs/` and `runbooks/`.
