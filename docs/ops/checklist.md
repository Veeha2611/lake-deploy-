# Operational Checklist

## Daily
- Confirm scheduled jobs ran (orchestrator logs + manifests).
- Verify `curated_recon.ssot_daily_summary` contains today’s row.
- Check S3 landing paths for each source:
  - `raw/` inbound data present
  - `curated_core/` and `curated_recon/` refreshed
- Review exception outputs in `curated_recon/*_exceptions/`.

## Weekly
- Re-run proof queries and update `docs/proofs/proofs.md` if needed.
- Review source freshness (`docs/reference/source_freshness_index_*.md`).
- Verify access and IAM policies are still valid for ingestion services.

## Monthly
- Validate schema drift: compare DDLs to expected tables and views.
- Review reconciliation thresholds and exception rates.
- Confirm backup/restore procedure is current.
