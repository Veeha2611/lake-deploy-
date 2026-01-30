# MAC Intelligence Platform — Rebuild Guide Digest (2026-01-30 export)

Source: `lake_deploy_intake/source_exports/REBUILD_GUIDE (1).md`

## Rebuild Checklist (condensed)
1. Configure Base44 app routes/pages (Dashboard, Console, Topics, Projects, Architecture, RevenueReproPack, Settings).
2. Deploy core functions: `aiLayerQuery`, `answerQuestion`.
3. Deploy project functions: `saveProject`, `runProjectModel`, `runPortfolioAnalysisV2`, `listProjectSubmissions`, `submitProjectForReview`, `promoteSubmissionToProject`.
4. Point Athena queries to curated views (see `docs/architecture/base44_app_architecture.md`).
5. Configure S3 buckets/prefixes used by the app (projects, submissions, updates, knowledge-base, gl-close).
6. Apply RBAC rules for admin-only pages/functions.
7. Validate evidence fields (execution IDs, SQL) are returned for all modules.

## Required Environment Variables (names only)
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_Query_LAYER_API_KEY
- AWS_Query_LAYER_INVOKE_URL

## Known Issues (from export)
- Console query history is session-only.
- GIS layers capped at 2,000 rows/layer; no pagination.

## Related Docs
- `docs/architecture/base44_app_architecture.md`
- `docs/integrations/base44_monday.md`
