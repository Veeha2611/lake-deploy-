# Disaster Recovery

## Scope
Restores the data lake from raw/curated backups and rehydrates views.

## Backup Sources
- S3 raw: `s3://gwi-raw-us-east-2-pc/raw/`
- S3 curated: `s3://gwi-raw-us-east-2-pc/curated_core/`, `s3://gwi-raw-us-east-2-pc/curated_recon/`
- Athena DDLs: `athena/` and `sql/` in this repo
- Orchestration code: `orchestration/` and `scripts/`

## Recovery Steps
1) Validate S3 integrity: list recent partitions and manifests.
2) Recreate Athena tables/views using DDLs in `athena/` and `sql/`.
3) Re-run reconciliation jobs to populate `curated_recon`.
4) Validate with proof queries in `docs/proofs/proofs.md`.
5) Resume scheduled jobs.

## Validation
- Confirm `curated_recon.ssot_daily_summary` for current date.
- Confirm core views resolve without errors.
- Spot-check exception counts and row counts per source.
