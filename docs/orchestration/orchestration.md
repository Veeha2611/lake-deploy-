# Orchestration & Schedules

## Orchestrators
- **SSOT daily**: `scripts/ssot_daily.sh`
- **Global orchestrator**: `scripts/ssot_global_orchestrator.py`
- **Legacy Lambda orchestrator**: `external_sources/orchestration_local/lambda/lake_orchestrator.py` (reference only)

## Schedules
- Daily manifests per system under:
  `s3://gwi-raw-us-east-2-pc/orchestration/<system>_daily/run_date=YYYY-MM-DD/manifest.json`

## Dependencies
- **Vetro**: Lambda export → raw/vetro → Athena raw → curated_core → recon
- **Intacct**: ingest script → raw/intacct_xml + raw/intacct_json → curated_core
- **Platt**: raw/platt → curated/platt → curated_core
- **Gaiia**: raw/gaiia → curated_core + recon
- **Manual docs**: raw/manual + raw/investor_docs → raw_sheets/raw_manual (crawler)

## Failure Modes
- Missing manifest: SSOT summary marks system as failed.
- Vetro 429: backoff with `next_allowed_ts` in `vetro_export_state/plan_index.json`.
- Invalid Vetro export: logged to exceptions list and skipped during backfill.

## Idempotency
- Each run writes date-partitioned output.
- Vetro backfill uses queue state files to avoid reprocessing.
- SSOT summary is append-only by run date.
