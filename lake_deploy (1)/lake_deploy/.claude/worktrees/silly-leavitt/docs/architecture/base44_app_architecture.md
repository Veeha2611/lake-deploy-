# MAC Intelligence Platform (Base44) — Architecture Digest (2026-01-30 export)

Source exports:
- `lake_deploy_intake/source_exports/architecture_export_2026-01-30.md`
- `lake_deploy_intake/source_exports/rebuild_package (1).json`
- `lake_deploy_intake/source_exports/REBUILD_GUIDE (1).md`
App source (local):
- `apps/mac-mountain-insights-console/`

## Stack
- Frontend: React 18 + Tailwind CSS + shadcn/ui
- Backend: Base44 Functions (Deno)
- Data: AWS Athena + S3
- Query: AWS Query Layer API

## Primary Data Flow
User → React Page → Base44 Function → Query Layer API → Athena → Curated Views → UI

## Pages & Core Functions
- **Dashboard** (`/Dashboard`): KPIs & tiles → `aiLayerQuery`
- **Console** (`/Console`): NLQ → `answerQuestion`, `aiLayerQuery`
- **Topics** (`/Topics`): NLQ by topic → `answerQuestion`
- **Projects** (`/Projects`): pipeline + modeling → `saveProject`, `runProjectModel`, `runPortfolioAnalysisV2`, `listProjectSubmissions`, `submitProjectForReview`, `promoteSubmissionToProject`
- **Architecture** (`/Architecture`): audits → `generateFullSystemProofPack`, `auditDashboardTiles`, `auditProjectsPageComplete`
- **RevenueReproPack** (`/RevenueReproPack`): repro packs → `runRevenueReport`, `runInvoiceLineItemRepro`, `runEmilieReportPack`

## Athena Surfaces Referenced
- `curated_core.v_monthly_mrr_platt`
- `curated_core.v_monthly_mrr_and_churn_summary`
- `curated_core.dim_customer_platt`
- `curated_core.projects_enriched`
- `curated_gis.dim_plan_meta` (GIS)
- `curated_core.invoice_line_item_repro_v1`
- `curated_core.v_monthly_revenue_platt_long`

## S3 Structures Referenced (App-facing)
- `s3://mac-intelligence-platform/projects/`
- `s3://mac-intelligence-platform/project-submissions/`
- `s3://mac-intelligence-platform/project-updates/`
- `s3://mac-intelligence-platform/knowledge-base/`
- `s3://mac-intelligence-platform/gl-close/`

## Evidence Standard
- `athena_query_execution_id`
- `generated_sql`
- `rows_returned`
- `rows_truncated` (where applicable)

## Access Notes (as exported)
- Admin-only pages/functions: architecture + proof/audit tools
- Restricted pages: MACAppEngine, RevenueReproPack
- Global access: @macmtn.com + approved external addresses (see exports for policy language)

## Known Constraints (from exports)
- GIS layers capped at 2,000 rows per layer; pagination not implemented
- Console query history is session-only
