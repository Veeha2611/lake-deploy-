# Intake Inbox — 2026-02-12

This folder is the **single landing zone** for all export batch outputs before we stage anything into the GitHub `lake_deploy` repo. Each batch must export its work **here first** so we can validate SSOT evidence, avoid loops, and run a clean secret scan.

## Folder Structure (per export batch)
Create one subfolder per batch using a short, stable name:

```
intake/exports_inbox_2026-02-12/
  01_<batch_short_name>/
  02_<batch_short_name>/
  ...
```

Example:
```
intake/exports_inbox_2026-02-12/01_intacct_gl_backfill/
intake/exports_inbox_2026-02-12/02_vetro_gis_ssot/
intake/exports_inbox_2026-02-12/03_mac_app_ui_smoke/
intake/exports_inbox_2026-02-12/04_intacct_ar_payments_source_probe/
```

## Required Files (per export batch)
Every batch must produce **all** of the following:

1) `summary.md`
   - What was done, what is still blocked, and what to do next.

2) `evidence/index.md`
   - Links to local evidence paths.
   - S3 evidence paths (must include dt and run_date).
   - All QIDs used.

3) `qids.tsv`
   - Query IDs for every Athena query in evidence.

4) `athena_values.json`
   - Raw results snapshot (counts, min/max dates, coverage numbers).

5) `status.json`
   - `PASS` / `FAIL` with timestamp and notes.

6) `files_changed.txt`
   - List of files modified (repo‑relative paths).

7) `commands_run.txt`
   - All commands (with timestamps) used to produce evidence.

8) `s3_paths.txt`
   - All S3 paths touched or read.

## Rules (No Exceptions)
- **No secrets** in any file. Do not paste tokens, passwords, or credentials.
- **No Base44 endpoints** in AWS‑only mode; route queries through MAC API.
- **All data must be lake‑derived** unless explicitly authorized otherwise.
- **Evidence must be reproducible** (QIDs + SQL + S3 paths).

## GitHub Staging Protocol (same as 2026‑02‑11)
Before pushing anything to GitHub:
1) Only stage **necessary** changes.
2) Run a quick secret scan (see `PROTOCOL.md`).
3) Commit in logical chunks with clear messages.
4) Push to `MM-Patch/lake_deploy` only when evidence is complete.

Use `EXPORT_TEMPLATE_github.md` to instruct each batch exactly what to export.
