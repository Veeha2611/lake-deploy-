# Vetro GIS SSOT Audit Template

**Purpose**: Verify that Vetro GIS layers + plan↔network mapping are SSOT‑ready, geojson is queryable, and MAC App can consume the views without cast errors.

## Inputs (fill in)
- `RUN_DATE`: 2026-02-11
- `AWS_REGION`: us-east-2
- `ATHENA_WORKGROUP`: primary
- `ATHENA_OUTPUT_LOCATION`: s3://gwi-raw-us-east-2-pc/athena-results/orchestration/

## Evidence output (must exist)
- Local: `lake_deploy/ssot_audit/vetro_gis_${RUN_DATE}/`
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/vetro_gis_self_audit/dt=${RUN_DATE}/`

## Required sources
- Mapping file (authoritative):  
  `s3://gwi-raw-us-east-2-pc/raw/sheets/vetro_network_plan_map_auto/vetro_network_plan_map_auto_2026-02-11.csv`
- As‑built list (authoritative):  
  `s3://gwi-raw-us-east-2-pc/raw/sheets/vetro_as_built_plan_ids/vetro_as_built_plan_ids_2026-02-11.csv`  
  (If different path, note in evidence.)

## Audit steps (required)
### 1) S3 object integrity
- Confirm mapping + as‑built files exist and are non‑zero.
- Produce `object_integrity.tsv` listing objects + sizes; fail if any zero‑byte.

### 2) Core view existence (Athena)
Run counts to prove views are live (fast paths):
- `SELECT COUNT(*) FROM curated_core.v_vetro_service_locations_tbl;`
- `SELECT COUNT(*) FROM curated_core.v_vetro_map_lines_layers_v1;`
- `SELECT COUNT(*) FROM curated_core.v_vetro_map_lines_owner_v1;`
- `SELECT COUNT(*) FROM curated_core.v_vetro_map_polygons_v1;`
- `SELECT COUNT(*) FROM curated_core.v_vetro_network_map_counts_v1;`
Sanity checks (view existence without full scan):
- `SELECT * FROM curated_core.v_vetro_network_map_layers_v1 WHERE layer_key = 'naps' LIMIT 1;`
- `SELECT * FROM curated_core.v_vetro_network_map_layers_v1 WHERE layer_key = 'fat' LIMIT 1;`

### 3) GeoJSON cast sanity (no INVALID_CAST)
Run a minimal select that forces geojson to render:
- `SELECT geometry_geojson FROM curated_core.v_vetro_map_lines_layers_v1 LIMIT 1;`
- `SELECT geometry_geojson FROM curated_core.v_vetro_map_polygons_v1 LIMIT 1;`
If either fails with `INVALID_CAST_ARGUMENT`, FAIL and record error.

### 4) Plan↔Network coverage
Ensure all mapped networks have plan_id coverage (cast‑safe):
```
SELECT
  COUNT(DISTINCT network) AS total_networks,
  SUM(CASE WHEN plan_id IS NULL OR TRIM(CAST(plan_id AS varchar)) = '' THEN 1 ELSE 0 END) AS missing_plan_id
FROM raw_sheets.vetro_network_plan_map_auto;
```
PASS if `missing_plan_id = 0`.

### 5) Crosswalk completeness vs plans
Validate plan_id exists in GIS features:
```
SELECT
  COUNT(DISTINCT plan_id) AS plan_ids_in_gis
FROM curated_core.v_vetro_network_map_layers_v1
WHERE plan_id IS NOT NULL AND TRIM(plan_id) <> '';
```
Expect non‑zero.

### 6) Evidence pack (required files)
- `object_integrity.tsv`
- `qids.tsv` (QID per query above)
- `athena_values.json` (counts/results)
- `status.json` (PASS/FAIL + timestamp + notes)

## PASS/FAIL criteria
PASS if all true:
- Required S3 objects exist and non‑zero
- All view counts > 0
- GeoJSON selects do not error
- `missing_plan_id = 0`
- GIS plan_ids count > 0

FAIL if any required object missing, zero counts, or geojson casts fail.

## Output format (for reporting)
- **Result**: PASS / FAIL  
- **Counts**: each view count + plan_ids_in_gis  
- **GeoJSON sanity**: PASS / FAIL  
- **Coverage**: missing_plan_id value  
- **QIDs**: list each Athena query execution ID
