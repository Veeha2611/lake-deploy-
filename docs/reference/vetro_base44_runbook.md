# Vetro + Monday + Base44 Runbook (Self‑Contained)
Date: 2026-01-28

## Scope
This runbook captures the full workflow and current state for:
- Vetro UI export backfill (all plans, active + archived)
- Monday ↔ Base44 bidirectional workflow (inputs in Monday, scenarios/results in Base44 → Monday)
- LC pipeline formula alignment (LC workbook as authoritative formula truth)

---

## A) Vetro UI Export Backfill

### A1. Source of truth
- Vetro UI does **not** allow “VETRO complete” export.
- Individual formats (GeoJSON, SHP, KMZ, DXF, GPKG) are allowed.
- We are using **GeoJSON** exports for all plans.

### A2. Key endpoints (observed from UI)
- List plans: `https://fibermap.vetro.io/v2/plans`
- Export plan GeoJSON:
  `https://fibermap.vetro.io/v2/export/plan/{plan_id}/geojson?append_equipment=false&imperial_units=true`
- Export plan SHP (if needed):
  `https://fibermap.vetro.io/v2/export/plan/{plan_id}/shp?append_equipment=false&imperial_units=true`

### A3. Landing paths in S3
- Plan list (normalized):
  `s3://gwi-raw-us-east-2-pc/raw/vetro_ui/plans/dt=YYYY-MM-DD/plans.json`
- Plan exports:
  `s3://gwi-raw-us-east-2-pc/raw/vetro_ui/plan_id=<id>/dt=YYYY-MM-DD/export_<timestamp>.zip`
- Backfill state:
  `s3://gwi-raw-us-east-2-pc/vetro_export_state/backfill_queue.json`
- Failed exports (small/invalid zips):
  `s3://gwi-raw-us-east-2-pc/vetro_export_state/failed_exports/run_date=YYYY-MM-DD/`
- Daily manifest:
  `s3://gwi-raw-us-east-2-pc/orchestration/vetro_daily/run_date=YYYY-MM-DD/manifest.json`

### A4. Local repo + script
- Repo: `/Users/patch/vetro/lake_deploy_repo`
- Exporter: `/Users/patch/vetro/lake_deploy_repo/orchestration/vetro_ui_exporter/index.js`

### A5. How to run backfill (batch execution)
```
AWS_REGION=us-east-2 \
VETRO_MODE=export_api \
VETRO_EXPORT_FORMAT=geojson \
SKIP_INVALID_ZIPS=true \
node /Users/patch/vetro/lake_deploy_repo/orchestration/vetro_ui_exporter/index.js
```

### A6. Logic notes
- `SKIP_INVALID_ZIPS=true`: small/invalid zips are logged and skipped; queue advances.
- Batch size is implicitly limited by runtime; run repeatedly until queue is empty.
- Backfill completion criterion: queue empty + failed_exports triaged.

---

## B) Monday ↔ Base44 Workflow

### B1. Workflow requirements (final design)
- **Monday is primary input surface**.
- Inputs entered in Monday → Base44 → saved as projects/scenarios.
- Base44 computes results (LC formulas) → pushes results back to Monday.
- Users can create new project in Base44 → it appears in Monday.
- Monday computed fields are **read‑only** (Base44 is calculator of truth).

### B2. Board details
- Board URL: `https://macmountain.monday.com/boards/18397523070`
- Board ID: `18397523070`
- Workspace ID: `13242107`
- Board name: `Project Pipeline`

### B3. Monday secret payload
- Local payload: `/tmp/base44_monday_secret.json`
- AWS secret: `base44/monday` (region `us-east-2`)
- Token source: `/Users/patch/Downloads/mondaystoken.txt`

### B4. Base44 mapping file
- Mapping: `/Users/patch/vetro/base44_project_pipeline_mapping.json`

### B5. Required Base44 actions
1) Verify Base44 can access board 18397523070.
2) Map Base44 fields to Monday column IDs per mapping file.
3) Enforce editable fields: state, stage, priority, owner, notes (inputs only).
4) Computed fields are read‑only and pushed from Base44/AWS.

---

## C) LC Pipeline Formula Truth

### C1. Authoritative workbook
- LC Pipeline: `/Users/patch/Downloads/LC_Pipeline_2025V1.xlsx`

### C2. Extracted formulas
- Mapping file: `/Users/patch/vetro/lc_pipeline_formula_map.json`

### C3. Supporting files
- DataModeling (initial model):
  - `/Users/patch/Downloads/DataModeling (1).html`
  - `/Users/patch/Downloads/DataModeling (1).css`
  - `/Users/patch/Downloads/DataModeling (1).js`
- Madras model (alternative):
  - `/Users/patch/Downloads/Madras BF_Illustrative Short Form Model_v2.xlsx`

### C4. Required Base44 alignment
- Base44 formulas must match LC Pipeline formulas (like‑for‑like).
- Monday only displays computed values pushed from Base44/AWS.

---

## D) Current Status Summary (as of 2026-01-28)

### Vetro
- Plan list loaded into S3.
- Backfill queue exists (remaining IDs still pending).
- Exports landing into `raw/vetro_ui/plan_id=.../dt=...`.

### Monday/Base44
- Monday secret stored in AWS (`base44/monday`).
- Board ID + workspace confirmed.
- Base44 still needs to confirm access and map columns.

---

## E) Troubleshooting

### Monday board shows empty in Base44
- Verify Base44 token owner has access to the board/workspace.
- Verify correct board ID (18397523070).

### Vetro export fails (small zip)
- This is expected for some plans. Skipped/recorded in failed_exports.
- Later triage: retry failed plan IDs individually.


---

## F) Manual Batch Exports (what we ran)
We ran the Vetro exporter directly on this machine in batches using the API export mode (GeoJSON):

```
AWS_REGION=us-east-2 \
VETRO_MODE=export_api \
VETRO_EXPORT_FORMAT=geojson \
SKIP_INVALID_ZIPS=true \
node /Users/patch/vetro/lake_deploy_repo/orchestration/vetro_ui_exporter/index.js
```

For larger batches we looped the same command and then checked remaining queue:

```
for i in {1..50}; do
  AWS_REGION=us-east-2 VETRO_MODE=export_api VETRO_EXPORT_FORMAT=geojson SKIP_INVALID_ZIPS=true \
    node /Users/patch/vetro/lake_deploy_repo/orchestration/vetro_ui_exporter/index.js || true
 done
aws s3 cp s3://gwi-raw-us-east-2-pc/vetro_export_state/backfill_queue.json /tmp/vetro_backfill_queue.json
python3 - <<"PY"
import json
q=json.load(open("/tmp/vetro_backfill_queue.json","r"))
if isinstance(q, dict):
    for k in ["queue","plan_ids","remaining","ids"]:
        if k in q and isinstance(q[k], list):
            q=q[k]
            break
print("remaining_plan_ids=", len(q))
print("next_ids=", q[:10])
PY
```

Last observed queue count: **1552** remaining (next IDs starting at 467).

---

## G) Scheduled API Export (EventBridge)
We confirmed a scheduled API export rule exists and is enabled:
- Rule: `vetro-export-stack-VetroScheduleRule-qcfx6NA6r6FO`
- Schedule: `rate(60 minutes)`
- Target: `arn:aws:lambda:us-east-2:702127848627:function:vetro-export-stack-VetroExportFunction-i4HxRyUqGTA1`

Recent logs show failures due to **404 on signed S3 export URL**, then rate‑limit. This indicates the API export flow needs retry/polling before download.
