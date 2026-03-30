# Actions Log

- Copied as-built plan list to SSOT path:
  `s3://gwi-raw-us-east-2-pc/raw/sheets/vetro_as_built_plan_ids/vetro_as_built_plan_ids_2026-02-11.csv`
- Repaired partitions:
  - `raw_vetro.raw_vetro_lines`
  - `raw_vetro.raw_vetro_files`
- Updated `athena/curated/12_curated_vetro_gis.sql` to read `curated_core` parquet tables (pending rebuild).
- CTAS for `v_vetro_network_map_layers_tbl` started (QID `970fa322-4362-493e-98fd-18d861e821f8`).
