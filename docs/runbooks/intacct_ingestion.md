# Intacct Ingestion (Sage/Intacct GL)

## Purpose
Ingest GL entries into the raw layer and surface curated/SSOT views for OPEX and margin analysis.

## Landing (S3)
- Raw: `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/` (partitioned by `run_date`)
- Orchestration manifest: `s3://gwi-raw-us-east-2-pc/orchestration/intacct_daily/run_date=YYYY-MM-DD/manifest.json`

## Schema (raw)
- See `athena/raw/legacy_ddls/raw_intacct_gl_entries.sql`

## Orchestration & scripts
- Primary scripts: `runbooks/intacct_ingest*.sh`
- Client helpers: `runbooks/intacct_client.py`
- Probe/triage: `runbooks/intacct_probe_prod_v2.sh`, `runbooks/intacct_triage.sh`

## Curated/SSOT
- Curated views and reconciliation logic: `docs/ssot/SSOT_POLICY.md`
- Proofs and run IDs: `docs/proofs/`

## Recovery
- Use `runbooks/intacct_triage.sh` for auth/timeout issues.
- Re-run last successful `run_date` partition if ingestion failed.
