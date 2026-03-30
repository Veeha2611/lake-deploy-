# Base44 App Data Flow

## Purpose
Projects and scenarios are calculated in the app and synced to AWS (system of record) and Monday.

## System of record
- AWS S3 (projects_pipeline input)
- Athena curated_core.projects_enriched view

## Flow
1) Monday inputs → Base44 sync → S3 append-only CSV
2) Athena refresh → Projects page reads curated_core.projects_enriched
3) Scenario save → Monday subitem (if enabled)

## Notes
- Base44 app source integrated under `apps/mac-mountain-insights-console/`.
