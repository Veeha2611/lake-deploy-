# Daily Runbooks and Validation

All systems must write a manifest to:
- `s3://gwi-raw-us-east-2-pc/orchestration/<system>_daily/run_date=YYYY-MM-DD/manifest.json`

Global SSOT rollup:
- `curated_recon.ssot_daily_summary`

## Intacct
Validate:
- `orchestration/intacct_daily/run_date=<today>/manifest.json`
- Athena:
  - `SELECT COUNT(*) FROM curated_core.intacct_gl_entries_current WHERE run_date='<today>'`
  - `SELECT MAX(business_date) FROM curated_core.intacct_gl_entries_current WHERE run_date='<today>'`

## Salesforce
Validate:
- `orchestration/salesforce_daily/run_date=<today>/manifest.json`
- Athena:
  - `SELECT COUNT(*) FROM curated_core.salesforce_account_current WHERE run_date='<today>'`

## Vetro
Validate:
- `orchestration/vetro_daily/run_date=<today>/manifest.json`
- Check state:
  - `s3://gwi-raw-us-east-2-pc/vetro_export_state/plan_index.json`

## Global SSOT
Validate:
- `SELECT * FROM curated_recon.ssot_daily_summary WHERE run_date='<today>' ORDER BY system, entity`

Guard policy:
- Guard status is computed from `*_current` tables only.
- Exceptions are recorded but do not fail the run unless thresholds are exceeded.

## Monday Deliverables Sync Prereqs
Secret:
- `monday/prod` in Secrets Manager with keys: `api_key`, `workspace_id`, `deliverables_board_id`

Athena table:
- `curated_ssot.deliverables` (see `sql/ssot/01_deliverables.sql`)

Proof query:
- `SELECT COUNT(*) FROM curated_ssot.deliverables WHERE dt = '<today>'`

## Vetro Rate-Limit Circuit Breaker
Behavior:
- On HTTP 429, honor `Retry-After` by persisting `next_allowed_ts` in `vetro_export_state/plan_index.json`.
- Runs before `next_allowed_ts` skip cleanly with `vetro.ingest.ok=false`, `rate_limited=true`.

Proof mode:
- Set `PROOF_MODE=true` and `PROOF_PLAN_ID=<id>` to attempt exactly one plan per run.
- Use `rate(12 hours)` cadence until first success, then ramp up carefully.

## Vetro Backfill Mode
State:
- `s3://gwi-raw-us-east-2-pc/vetro_export_state/backfill_queue.json`
- `s3://gwi-raw-us-east-2-pc/vetro_export_state/backfill_complete.json` (only after completion)

Behavior:
- Exactly one export attempt per run.
- On success (zip >= 10KB + expected JSON), pop plan_id from queue.
- On 429, persist `next_allowed_ts` and exit cleanly.

Completion:
- Done when all plan_ids have a valid export in the last 7 days (>= 10KB).

## Canonical Deliverables (SSOT)
Config file:
- `config/deliverables_config.json`

DDL:
- `sql/ssot/02_deliverables_schema.sql`

Daily load:
- `sql/ssot/03_deliverables_insert.sql` (replace `<RUN_DATE>`)

Proof query:
- `SELECT deliverable_id, status, ssot_guard_ok, exception_count FROM curated_ssot.deliverables WHERE dt='<today>'`

## MAC Project & Pipeline (Monday ↔ AWS)
Board schema (project pipeline only):
- Project ID (text)
- Module Type (dropdown) [must be "Project Pipeline"]
- Entity (text)
- Project Type (text)
- State (text)
- Stage (status)
- Priority (text)
- Owner (text)
- Partner Share (text)
- Investor Label (text)
- Notes (long_text)
- Sync to AWS (checkbox)

AWS → Monday
- Source: `curated_core.projects_enriched`
- Upsert key: `project_id`
- Auto-set: Module Type="Project Pipeline", Sync to AWS=checked

Monday → AWS
- Filter: Module Type == "Project Pipeline" AND Sync to AWS == checked
- Writable fields: state, stage, priority, owner, notes
- Append-only log: `curated_core.project_updates`

Daily merge
- Merge `curated_core.project_updates` into `curated_core.projects_enriched` by `project_id`.

## Notion Read-only Snapshot (On-demand)
Script:
- `scripts/notion_fetch.py`

Outputs:
- Raw JSON: `s3://gwi-raw-us-east-2-pc/knowledge/notion/pages/dt=YYYY-MM-DD/`
- Text/markdown: `s3://gwi-raw-us-east-2-pc/knowledge/notion/text/dt=YYYY-MM-DD/`
- Index: `s3://gwi-raw-us-east-2-pc/knowledge/notion/index/dt=YYYY-MM-DD/index.ndjson`

Athena:
- `sql/notion/00_notion_index.sql`

Prereqs:
- Notion integration token stored in Secrets Manager `notion/prod`
- Root page shared with the integration
