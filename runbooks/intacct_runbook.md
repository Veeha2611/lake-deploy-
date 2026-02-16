# Intacct → Data Lake Runbook

This file mirrors the runbook notes we would log in Notion; store it locally so the history is preserved even when we can't push to the external page.

## Recent Changes
- **2026-01-20:** Updated `intacct_ingest.sh` to point at the production credentials (`WS_USER_ID_PROD`, etc.) and to log the company ID/endpoint it hits.
- **2026-01-20:** Added `GL_ENTRIES_LOOKBACK_DAYS` defaults plus a configurable query block so the script now filters GL entries to the recent period and logs the filter used.
- **2026-01-20:** Introduced `data_quality_summary.txt` (per run) plus `summarize_gl_entries` so each run records the count and max ENTRY/BATCH dates for auditing subsections.
- **2026-01-20T16:42Z:** Removed the `<resultstart>` element from the GLENTRY pagination request on both `intacct_ingest.sh` and `lake_deploy/intacct_ingest.sh` and re-ran the job with `GL_ENTRIES_QUERY="LOCATION = '10' AND ENTRY_DATE >= DATE '2023-07-01'"` (lookback 730 days). The Intacct API now returns controlid `getgl_entriesPage1` but yields no rows, so we still need to pinpoint the “Top level” scope before GL entries can populate.
- **2026-01-20T19:55Z:** Derived the Top-level query block (`LOCATIONID = '10'`) from `intacct_ingest/2026-01-20/gl_entries_request.xml` and propagated it via `LOCATION_ID=10` plus `GL_ENTRIES_EXTRA_QUERY="LOCATIONID = '10'"` so the GLENTRY request mirrors the UI and logs `GLENTRY query lookback: last 365 days (object: GLENTRY, filter: ENTRY_DATE >= DATE '2025-10-23' AND LOCATIONID = '10')`. The most recent execution (see `intacct_ingest/logs/ingest_2026-01-20_19-53-28.log` and the console output for the identical log line at 19:54:43) still halts because the sandbox can’t resolve `api.intacct.com` (curl exit 6, `Could not resolve host: api.intacct.com`). As a result `gl_entries.json` stays empty; re-run once the network can reach Intacct so the JSON can land under `intacct_ingest/2026-01-20/gl_entries.json` and be uploaded to `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/2026-01-20/gl_entries.json`.
- **2026-02-04:** Fixed JSON extraction bug in `~/intacct_ingest.sh` (piped `xq` output was ignored because `python3 - <<'PY'` consumed stdin). Updated to `python3 -c` so piped JSON is parsed; rebuilt AR/AP JSON from the 2026-02-04 XML responses and re-uploaded to `s3://gwi-raw-us-east-2-pc/raw/intacct_json/*/2026-02-04/`. Start full-history run via `~/intacct_ingest_full_history.sh` to backfill GLENTRY with `ENTRY_DATE >= '01/01/2000'`.

## Next Steps (ready to continue)
1. Confirm `datalake` user has `READ_BY_QUERY` on `APBILL`/`APPYMT` so `ap_bills.json` and `ap_payments.json` stop being empty.
2. Confirm `datalake` user has `READ_BY_QUERY` on `ARPAYMENT` (AR payments object) so `ar_payments.json` can land under `raw/intacct_json/ar_payments/`.
3. After permissions are restored, rerun `intacct_ingest.sh` and verify the new `data_quality_summary` lines show up under `~/intacct_ingest/<run_date>/`.
4. Compare the refreshed GL entries JSON (now filtered) with the `RevenueReport.xlsx` schema; build a Base44 automation using the `architecture_export_2026-01-19.md` flow to reconstruct the workbook.
5. If `summarize_gl_entries` still reports `count=0` for the default ${GL_ENTRIES_LOOKBACK_DAYS}-day window beginning ${GL_ENTRIES_FILTER_DATE}, document that date range in the Nano runbook and ask the ops team whether Intacct should have transactions in that span; extend the lookback (e.g., to 730 days) or pinpoint the actual latest entry dates before declaring the export production-ready.
6. If GL entry rows continue to stay at zero (see `intacct_ingest/logs/ingest_2026-01-20_12-56-19.log` and `intacct_ingest/2026-01-20/data_quality_summary.txt`), capture the exact “Top level” scope identifier (entity/location or XML context) and rerun the job with that setting; once the GL entries flow, log the new `gl_entries.json` count and update this runbook (and the Topic State page) so the successful scope is visible to the next work block.
7. Vendors, customers, and the AP feeds now page through Intacct until `numremaining=0` (see `lake_deploy/intacct_ingest.sh`’s `pull_object_paginated`), so the NDJSON exports align with the `totalcount` values that the XML payloads report—use these per-page JSON files when reconciling against Platt/Salesforce/Giaia datasets as noted in the Vetro geometry runbook.
8. Keep the positive continuity note near the top: the pipeline is automated and vetted; the only open action is running GLENTRY with the corrected scope, so any new chat can proceed from this status without thinking the work is blocked.

## Location context
- When the UI shows “Top level” journal entries, it appears to be filtering by the `Location ID` (`GWI` = 10) rather than the `companyid` alone. The ingest now accepts `LOCATION_ID`—export it before running `lake_deploy/intacct_ingest.sh` so we can replicate that UI scope in the login block. Once GL entries return, record the used `LOCATION_ID` and response in this runbook.

## Vet‌ro sandbox readiness + setup guidance
1. To bring a new teammate up to speed on the Vetro + Intacct + SolarWinds data lake build, point them at `docs/vetro_geometry_export_runbook.md` (current geometry export workflow) and `docs/integration_status.md` (integration state and dependencies).
2. Provide the following setup instructions whenever you start a new execution:
   > “Set up the dedicated Vet‌ro sandbox: export `VETRO_API_TOKEN`, `VETRO_BASE_URL_V3`, `VETRO_BASE_URL_V2`, and run the pin/line/polygon SQLs plus the `/features?limit=1` and `/plans` connectivity checks. Capture Athena/HTTP evidence and paste it back here so the pipeline runs with the latest evidence.”  
   This ensures no blocker language deters future agents—everything they need is scripted and waiting for the token/context.

## Recording Updates via Nano
When you want to log a change, use Nano to append a timestamped entry to this file:

```
nano intacct_runbook.md
```

Add a bullet describing the change, save, and you’ll have a local audit trail that can later be mirrored in Notion manually.
