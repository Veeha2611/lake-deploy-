# Base44 Pipeline Update (2026-01-27)

## Summary
We separated the Project Pipeline into its own Monday board and aligned AWS to the Base44 Projects module schema. This keeps the module like-for-like and prevents mixing with Deliverables.

## Required Change (Base44)
- Use the new pipeline board ID in Monday sync:
  - `pipeline_board_id = 18397523070`
  - stored in Secrets Manager: `monday/prod.pipeline_board_id`

## Projects Module Schema (updated to mirror Pipeline Summary workbook)
The Projects module should continue to read from:
- `curated_core.projects_enriched`

Base44 must map **all** Pipeline Summary fields so Monday mirrors the workbook.

### Core fields (existing)
- project_id
- entity
- project_name
- project_type
- state
- deal_stage (text; use this for UI “Stage” if status labels can’t be set)
- priority
- owner
- notes

### Split / partner fields
- partner
- split_code
- split_pct
- investor
- investor_label (keep if used in UI)

### Economics / specs (newly exposed)
- investment
- irr
- moic
- project_specs_code
- passings
- subscribers
- take_rate
- revenue
- cash_flow
- coc_return
- construction_cost
- construction_cost_per_passing
- install_cost
- install_cost_per_subscriber
- construction_plus_install_cost
- total_cost_per_passing
- arpu
- months_to_completion
- contract_date
- start_date
- end_date
- funnel_value
- funnel_multiple
- due_date (derived; used for Monday Deadline)

## AWS Source Updates
- `curated_core.projects_enriched` sources from `raw_pipeline.lc_pipeline_2025v1` (Pipeline Summary sheet)
- `raw_pipeline.lc_pipeline_2025v1_sheet_index` and `raw_pipeline.lc_pipeline_2025v1_monthly_detail_long` added for analytics
- `curated_core.project_financials_monthly` and `curated_core.project_sheet_index` available for drilldowns
