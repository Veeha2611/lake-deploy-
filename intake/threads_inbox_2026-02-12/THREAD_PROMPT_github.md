# Thread Export Prompt (Use in Each Thread)

**Goal**: Export your full thread history and evidence into the intake folder for SSOT validation and GitHub staging.  
**Do not include secrets. Do not include Base44 endpoints.**

---

## Prompt (copy/paste into each thread)

You are **Thread: <THREAD_TITLE>**.  
Export **all** of your work into:

`/Users/patch/lake_deploy/intake/threads_inbox_2026-02-12/<THREAD_FOLDER>/`

Where `<THREAD_FOLDER>` is a short, stable slug (e.g. `01_intacct_gl_backfill`).

### Required files (all must exist)
1) `summary.md`
   - What you did
   - What is blocked
   - Next steps (explicit)

2) `evidence/index.md`
   - Local evidence paths
   - S3 evidence paths (with dt / run_date)
   - All QIDs used

3) `qids.tsv`
4) `athena_values.json`
5) `status.json` (PASS/FAIL + timestamp + notes)
6) `files_changed.txt` (repo‑relative paths)
7) `commands_run.txt` (timestamped commands)
8) `s3_paths.txt` (all S3 prefixes touched)

### Rules
- **No secrets** (tokens, passwords, API keys, cookies).
- **No Base44 endpoints** in AWS‑only mode.
- Only include **lake‑derived evidence**.

### If you modified code
Include:
- `diff_summary.md` (brief diff description)
- `tests_run.txt` (even if “not run”)

### Finish
Confirm the folder is complete and ready for SSOT review.
