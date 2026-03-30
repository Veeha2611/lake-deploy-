# Vetro GIS SSOT Re‑Validation Template (No‑Mutation)

**Purpose**: Independently validate that the Vetro GIS SSOT rebuild is **still** correct after the last remediation. This is a **read‑only** audit. It must produce a fresh evidence pack without re‑running CTAS or altering data.

**Scope**
- **Read‑only verification only.**
- **NO CTAS / DROP / CREATE** and **NO raw/curated mutation**.
- Verify both **Athena GIS views** and **MAC App API** responses.

## Inputs (fixed)
- `RUN_DATE`: 2026-02-11 (verification run label can be `2026-02-11_revalidate` or `2026-02-11_verify`)
- `AWS_REGION`: us-east-2
- `ATHENA_WORKGROUP`: primary
- `ATHENA_OUTPUT_LOCATION`: s3://gwi-raw-us-east-2-pc/athena-results/orchestration/
- `MAC_API_BASE`: https://0vyy63hwe5.execute-api.us-east-2.amazonaws.com/prod

## Evidence output (must exist)
- Local: `lake_deploy/ssot_audit/vetro_gis_${RUN_DATE}_verify/`
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/vetro_gis_self_audit/dt=${RUN_DATE}_verify/`

## Required sources (must be non‑zero)
- Mapping file:  
  `s3://gwi-raw-us-east-2-pc/raw/sheets/vetro_network_plan_map_auto/vetro_network_plan_map_auto_2026-02-11.csv`
- As‑built list:  
  `s3://gwi-raw-us-east-2-pc/raw/sheets/vetro_as_built_plan_ids/vetro_as_built_plan_ids_2026-02-11.csv`

---

## Step 1 — Confirm prior PASS evidence (read‑only)
1. Confirm prior PASS exists:
   - `/Users/patch/lake_deploy/ssot_audit/vetro_gis_2026-02-11/status.json` shows `PASS`.
2. Record CTAS status **without re‑running**:
   - `/Users/patch/lake_deploy/ssot_audit/vetro_gis_2026-02-11/ctas_status.json`
   - If it shows **FAILED** but tables exist and counts > 0, proceed.

## Step 2 — S3 object integrity
Produce `object_integrity.tsv` with sizes; fail if missing or zero‑byte.

## Step 3 — Base table existence (fast counts)
Run counts (must be > 0):
- `SELECT COUNT(*) FROM curated_core.v_vetro_network_map_layers_tbl;`
- `SELECT COUNT(*) FROM curated_core.v_vetro_service_locations_tbl;`
- `SELECT COUNT(*) FROM curated_core.v_vetro_map_lines_layers_tbl;`
- `SELECT COUNT(*) FROM curated_core.v_vetro_map_polygons_tbl;`
- `SELECT COUNT(*) FROM curated_core.v_vetro_network_map_counts_cache;`

If any table is missing or 0, **FAIL** and stop (do not rebuild here).

## Step 4 — View health (fast counts)
Run counts (must be > 0):
- `SELECT COUNT(*) FROM curated_core.v_vetro_service_locations_tbl;`
- `SELECT COUNT(*) FROM curated_core.v_vetro_map_lines_layers_v1;`
- `SELECT COUNT(*) FROM curated_core.v_vetro_map_lines_owner_v1;`
- `SELECT COUNT(*) FROM curated_core.v_vetro_map_polygons_v1;`
- `SELECT COUNT(*) FROM curated_core.v_vetro_network_map_counts_v1;`
Sanity checks (view resolves):
- `SELECT * FROM curated_core.v_vetro_network_map_layers_v1 WHERE layer_key='naps' LIMIT 1;`
- `SELECT * FROM curated_core.v_vetro_network_map_layers_v1 WHERE layer_key='fat' LIMIT 1;`

## Step 5 — GeoJSON sanity (no INVALID_CAST)
- `SELECT geometry_geojson FROM curated_core.v_vetro_map_lines_layers_v1 LIMIT 1;`
- `SELECT geometry_geojson FROM curated_core.v_vetro_map_polygons_v1 LIMIT 1;`
If either fails with `INVALID_CAST_ARGUMENT`, **FAIL**.

## Step 6 — Plan↔Network coverage
```
SELECT
  COUNT(DISTINCT network) AS total_networks,
  SUM(CASE WHEN plan_id IS NULL OR TRIM(CAST(plan_id AS varchar)) = '' THEN 1 ELSE 0 END) AS missing_plan_id
FROM raw_sheets.vetro_network_plan_map_auto;
```
PASS if `missing_plan_id = 0`.

## Step 7 — Plan IDs present in GIS
```
SELECT COUNT(DISTINCT plan_id) AS plan_ids_in_gis
FROM curated_core.v_vetro_network_map_layers_v1
WHERE plan_id IS NOT NULL AND TRIM(plan_id) <> '';
```
Expect non‑zero.

## Step 8 — MAC API sanity (AWS‑only)
Verify API returns data (non‑empty `rows`):
- `POST ${MAC_API_BASE}/query`
  - `{"question_id":"network_map_counts"}`
  - `{"question_id":"gis_service_locations"}`
  - `{"question_id":"gis_naps"}`
  - `{"question_id":"gis_fat"}`
  - `{"question_id":"gis_fiber_aerial"}`
  - `{"question_id":"gis_fiber_underground"}`
  - `{"question_id":"gis_fiber_mixed"}`
  - `{"question_id":"gis_fiber_unknown"}`
  - `{"question_id":"gis_fiber_owner_gwi"}`
  - `{"question_id":"gis_fiber_owner_lymefiber"}`
  - `{"question_id":"gis_polygons"}`

If any endpoint returns error, **FAIL** and record the response.

---

## Evidence pack (required)
- `object_integrity.tsv`
- `qids.tsv`
- `athena_values.json`
- `api_checks.json` (raw responses or summary)
- `status.json` (PASS/FAIL + timestamp + notes)

## PASS criteria
PASS if all are true:
- Required S3 objects exist and non‑zero
- Base tables counts > 0
- Views counts > 0
- GeoJSON sanity passes (no INVALID_CAST)
- `missing_plan_id = 0`
- `plan_ids_in_gis > 0`
- MAC API queries return non‑empty rows and no errors

## FAIL criteria
FAIL if any required object missing/zero, any view missing/zero, geojson cast fails, coverage fails, or API returns errors.
