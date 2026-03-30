# MAC App 2.0 — Projects/Pipeline + Monday.com Runbook (2026-02-07)

## Objective
Rebuild the **Projects/Pipeline module** in MAC App 2.0 to match the Base44 design, with:
- Monday.com as the **input surface**
- AWS as the **SSOT**
- Near‑real‑time sync
- Calculations written back to Monday
- Locked fields enforced

This runbook is AWS‑only and Base44‑independent.

## References (Required)
- Base44 pipeline mapping: `/Users/patch/lake_deploy/docs/base44_updates/BASE44_PIPELINE_UPDATE.md`
- Base44 Monday integration: `/Users/patch/lake_deploy/docs/integrations/base44_monday.md`
- Proven successes: `/Users/patch/lake_deploy/docs/reference/thread_runbook_successes_2026-01-30.md`
- SSOT Projects updates SQL: `/Users/patch/lake_deploy/sql/ssot/04_project_updates.sql`
- Monday mapping file (MacAppV2Stack): `/Users/patch/lake_deploy/apps/mac-app-v2/lambda/query-broker/monday-mapping.json`
- MAC app codebase: `/Users/patch/lake_deploy/apps/mac-mountain-insights-console`

## Prereqs
1) Monday token already in Secrets Manager:
   - `monday/prod` (ARN: `arn:aws:secretsmanager:us-east-2:702127848627:secret:monday/prod-NskzqN`)
2) Pipeline board ID:
   - `monday/prod.pipeline_board_id` = `18397523070`
3) AWS API endpoint (MacAppV2Stack):
   - `https://0vyy63hwe5.execute-api.us-east-2.amazonaws.com/prod/`
4) (Optional) Webhook signature secret:
   - `monday/prod.webhook_secret` (or set `MONDAY_WEBHOOK_SECRET` on Lambda)

## Data Flow (Target)
1) **Monday → AWS (near‑real‑time)**
   - Monday webhook triggers API Gateway endpoint.
   - Lambda writes raw update to S3:
     - `s3://gwi-raw-us-east-2-pc/raw/projects_pipeline/monday_staging/`
   - Lambda computes scenario metrics (NPV/IRR/MOIC) and persists to S3 or curated layer.
2) **AWS Curated**
   - `curated_core.projects_enriched` is authoritative.
   - `sql/ssot/04_project_updates.sql` merges Monday updates.
3) **AWS → Monday (write‑back)**
   - Computed fields are written to Monday after each update.
   - Locked fields are re‑asserted from AWS if Monday changes are detected.

## Required Column Lock Rules
Only these fields are user‑editable in Monday (all others are locked/overwritten):
- state
- deal_stage (or stage)
- priority
- owner
- notes

All other fields (passings, subscribers, ARPU, NPV/IRR/MOIC, cost fields, etc.) are **computed or SSOT‑sourced** and must be enforced by AWS write‑back.

## Implementation Steps

### Step 1 — Confirm Monday board schema + mapping
Use existing functions in MAC app:
- `functions/getMondayBoardSchema.ts`
- `functions/inspectMondayColumns.ts`

Ensure fields match **BASE44_PIPELINE_UPDATE.md** exactly.

### Step 2 — Enable Monday Webhooks (Near‑Real‑Time)
MacAppV2Stack provides the webhook handler:
- API Gateway: `POST /monday/webhook` → MacAppV2Stack query-broker Lambda
- Mapping + lock rules in: `apps/mac-app-v2/lambda/query-broker/monday-mapping.json`

Webhook security:
- If `monday/prod.webhook_secret` is present, the Lambda verifies `x-monday-signature`.
- If no secret is configured, the webhook still accepts updates (documented in execution log).

Sync filter (enforced in Lambda when configured):
- `module_type` must equal `Project Pipeline`
- `sync_to_aws` must be enabled

### Step 3 — Stage Raw Monday Updates in S3
The handler must write the raw payload:
- `s3://gwi-raw-us-east-2-pc/raw/projects_pipeline/monday_staging/monday_update_<timestamp>.json`

### Step 4 — Compute Scenarios and Write Back
Use:
- `functions/ingestMondayUpdateWithCalcs.ts`
to compute NPV/IRR/MOIC and write results back to Monday via API.

### Step 5 — Merge into SSOT Curated Table
Run or schedule:
- `/Users/patch/lake_deploy/sql/ssot/04_project_updates.sql`

Ensure `curated_core.projects_enriched` remains authoritative.

### Step 6 — Read‑Only UI in MAC App
Projects/Pipeline UI should read:
- `curated_core.projects_enriched`
and **never** allow edits inside MAC app (Monday is the edit surface).
The query registry overlays `curated_core.project_updates` so edits reflect quickly.

### Step 7 — Scheduled Reconciliation (Failsafe)
Add a scheduled sync (hourly or daily):
- `functions/syncMondayToAWS.ts` or `functions/syncMondayToProjects.ts`
This reconciles any missed webhooks.

## Field Mapping (Must Match Base44)
Use the list from `BASE44_PIPELINE_UPDATE.md` (core, split/partner, economics/specs).

## Verification Checklist
- [ ] Monday webhook triggers AWS endpoint and writes staging file to S3.
- [ ] Calculations returned to Monday (NPV/IRR/MOIC).
- [ ] Locked fields are enforced by AWS write‑back.
- [ ] `curated_core.projects_enriched` updated in Athena.
- [ ] MAC UI displays pipeline data accurately (read‑only).

## Notes
- If Monday authentication hiccups occur, use the existing proxy:
  - Lambda: `base44-monday-proxy`
  - API Gateway: `base44-monday-proxy-api`

## Deliverables
1) Webhook endpoint live.
2) AWS curated table updated from Monday.
3) MAC UI Projects module reflects SSOT + calculations.
4) Evidence logs + S3 paths documented.
