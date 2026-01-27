# Base44 Pipeline Update (2026-01-27)

## Summary
We separated the Project Pipeline into its own Monday board and aligned AWS to the Base44 Projects module schema. This keeps the module like-for-like and prevents mixing with Deliverables.

## Required Change (Base44)
- Use the new pipeline board ID in Monday sync:
  - `pipeline_board_id = 18397523070`
  - stored in Secrets Manager: `monday/prod.pipeline_board_id`

## Projects Module Schema (unchanged / like-for-like)
The Projects module continues to read from:
- `curated_core.projects_enriched`

Expected columns (per Base44 architecture export):
- project_id
- entity
- project_name
- project_type
- state
- stage
- priority
- owner
- partner_share_raw
- investor_label
- notes

## Optional Safe Extensions (recommended)
These do **not** break existing UI but can be added if desired:
- `due_date` (used for Monday Deadline)
- `stage_pipeline` (text mirror of stage when Monday status labels are constrained)

If you want these in the UI, add them to the Projects module field mapping. Otherwise ignore and keep the current module schema.

## AWS Source Updates
- `curated_core.projects_enriched` now sources from `raw_pipeline.lc_pipeline_2025v1` (Pipeline Summary sheet)
- `raw_pipeline.lc_pipeline_2025v1_sheet_index` and `raw_pipeline.lc_pipeline_2025v1_monthly_detail_long` added for analytics
- `curated_core.project_financials_monthly` and `curated_core.project_sheet_index` available for drilldowns

