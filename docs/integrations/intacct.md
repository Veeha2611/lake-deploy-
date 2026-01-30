# Sage Intacct Integration

## Purpose
Ingest GL entries and related accounting entities into the data lake for financial reporting and SSOT.

## Ingest Method
- Script: `../intacct_ingest.sh` (canonical ingest)
- Runbooks: `runbooks/intacct_runbook.md`, `intacct_ingest_handoff.md`
- Legacy scripts: `external_sources/intacct_ingest_local/` (reference only)

## S3 Outputs
- XML: `s3://gwi-raw-us-east-2-pc/raw/intacct_xml/<entity>/YYYY-MM-DD/`
- JSON: `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/run_date=YYYY-MM-DD/`
- Heartbeat: `s3://gwi-raw-us-east-2-pc/raw/intacct/heartbeat/`

## Athena
- Curated GL tables: `curated_core.intacct_gl_entries_current` and related views
- Proof queries in `RUNBOOKS.md`

## Deployed Today
- Scheduled ingest script with daily manifests and SSOT rollup

## Planned / Future
- Automated schema drift detection and alerting
