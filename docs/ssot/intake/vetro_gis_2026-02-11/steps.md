# Execution Steps (Deterministic)

1. **Confirm sources exist**
   - `raw_sheets.vetro_network_plan_map_auto`
   - `curated_core.v_vetro_plans_as_built`
   - `raw_vetro.raw_vetro_lines`

2. **Build GIS parquet tables** (CTAS)
   - `v_vetro_network_map_layers_tbl`
   - `v_vetro_service_locations_tbl`
   - `v_vetro_map_lines_layers_tbl`
   - `v_vetro_map_polygons_tbl`
   - `v_vetro_network_map_counts_cache`

3. **Apply views**
   - Run `athena/curated/12_curated_vetro_gis.sql` to point all GIS views to the parquet tables.

4. **Audit**
   - Run `docs/ssot/vetro_gis_ssot_audit_prompt_2026-02-11.md`
   - Save evidence pack locally + S3.

5. **MAC App validation**
   - Network map loads (no cast errors)
   - 24 networks visible
   - Counts tile non-zero
