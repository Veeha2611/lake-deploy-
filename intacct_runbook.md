# Intacct → Data Lake Runbook

This file mirrors the runbook notes we would log in Notion; store it locally so the history is preserved even when we can't push to the external page.

## Recent Changes
- **2026-01-20:** Updated `intacct_ingest.sh` to point at the production credentials (`WS_USER_ID_PROD`, etc.) and to log the company ID/endpoint it hits.
- **2026-01-20:** Added `GL_ENTRIES_LOOKBACK_DAYS` defaults plus a configurable query block so the script now filters GL entries to the recent period and logs the filter used.
- **2026-01-20:** Introduced `data_quality_summary.txt` (per run) plus `summarize_gl_entries` so each run records the count and max ENTRY/BATCH dates for auditing subsections.

## Next Steps
1. Confirm `datalake` user has `READ_BY_QUERY` on `APBILL`/`APPYMT` so `ap_bills.json` and `ap_payments.json` stop being empty.
2. After permissions are restored, rerun `intacct_ingest.sh` and verify the new `data_quality_summary` lines show up under `~/intacct_ingest/<run_date>/`.
3. Compare the refreshed GL entries JSON (now filtered) with the `RevenueReport.xlsx` schema; build a Base44 automation using the `architecture_export_2026-01-19.md` flow to reconstruct the workbook.
4. If `summarize_gl_entries` still reports `count=0` for the default ${GL_ENTRIES_LOOKBACK_DAYS}-day window beginning ${GL_ENTRIES_FILTER_DATE}, document that date range in the Nano runbook and ask the ops team whether Intacct should have transactions in that span; extend the lookback (e.g., to 730 days) or pinpoint the actual latest entry dates before declaring the export production-ready.

## Recording Updates via Nano
When you want to log a change, use Nano to append a timestamped entry to this file:

```
nano intacct_runbook.md
```

Add a bullet describing the change, save, and you’ll have a local audit trail that can later be mirrored in Notion manually.
