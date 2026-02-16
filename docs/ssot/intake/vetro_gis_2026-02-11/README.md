# Vetro GIS SSOT Intake (2026-02-11)

## Objective
Rebuild Vetro GIS layers in `curated_core` so the MAC App network map renders full Vetro data without `INVALID_CAST_ARGUMENT` errors and with plan→network mapping aligned to the as‑built plan list.

## Why this intake exists
- The existing Vetro GIS views (`vetro_curated_db.*`) use `CAST(json AS varchar)`, which fails in Athena when the JSON is not scalar.
- MAC App is wired to `curated_core.v_vetro_*_v1` views, but those views still point at the old raw view set and therefore fail.

## Authoritative inputs
- As‑built plan list (authoritative):
  `s3://gwi-raw-us-east-2-pc/raw/sheets/vetro_as_built_plan_ids/vetro_as_built_plan_ids_2026-02-11.csv`
- Network↔plan map (authoritative):
  `s3://gwi-raw-us-east-2-pc/raw/sheets/vetro_network_plan_map_auto/vetro_network_plan_map_auto_2026-02-11.csv`
- Raw Vetro features (full export):
  `raw_vetro.raw_vetro_lines`

## Current status
- Primary CTAS running to build:
  `curated_core.v_vetro_network_map_layers_tbl`
  QID: `970fa322-4362-493e-98fd-18d861e821f8` (RUNNING)
- Dependent tables not yet built.

See `status.md` for live state and next steps.

## Expected deliverables (SSOT protocol)
- Parquet tables populated in `s3://gwi-raw-us-east-2-pc/curated_core/`:
  - `v_vetro_network_map_layers_tbl`
  - `v_vetro_service_locations_tbl`
  - `v_vetro_map_lines_layers_tbl`
  - `v_vetro_map_polygons_tbl`
  - `v_vetro_network_map_counts_cache`
- Views re‑applied from `athena/curated/12_curated_vetro_gis.sql`
- Audit PASS using `docs/ssot/vetro_gis_ssot_audit_template_2026-02-11.md`
- Evidence pack in:
  - Local: `lake_deploy/ssot_audit/vetro_gis_2026-02-11/`
  - S3: `s3://gwi-raw-us-east-2-pc/curated_recon/vetro_gis_self_audit/dt=2026-02-11/`

## Notes
- Geometry is emitted via `json_format(geometry_json)` to avoid cast errors.
- Plan/network fields are joined via `raw_sheets.vetro_network_plan_map_auto`.
- As‑built plans are filtered via `curated_core.v_vetro_plans_as_built`.
