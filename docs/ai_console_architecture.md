# MAC AI Console Runtime (Architecture)

This document describes the MAC AI Console runtime and how it produces governed, evidence-backed outputs over SSOT views.

## High-Level Flow
1. UI submits a request to the API (`POST /query`) with either `question` (plain language) or `question_id` (registry key).
1. API routes to:
   - Deterministic registry template (preferred), or
   - Governed planner → QueryPlan → deterministic compile/validate/execute.
1. API returns:
   - `answer_markdown`
   - tabular `columns` + `rows` (when applicable)
   - `evidence_pack` (required for numeric outputs)
   - optional `actions_available` for follow-ups and exports

## Deterministic Registry (Primary Path)
- Registry templates live in `apps/mac-app-v2/lambda/query-broker/query-registry.json`.
- Templates are executed via Athena with:
  - read-only SQL validation
  - allowlist validation (approved view prefixes + approved sources)
  - row limits where required
- KPI-class templates are wrapped with an Investigation Ladder (freshness + cross-check + sanity checks).

## Governed Planner (Fallback Path)
- When a question does not match the registry, the runtime can invoke Bedrock to produce a QueryPlan JSON.
- The planner never emits SQL. QueryPlan is compiled deterministically into SQL and then validated.
- Structured output mode uses Bedrock structured outputs with the QueryPlan JSON schema.

## Case Runtime (Stateful Threads)
- Each `/query` response may be persisted as a Case record in DynamoDB:
  - `case_id`, `question_original`, `question_id`, `metric_key`
  - executed query IDs + SQL + views used
  - `evidence_pack`, verification results, artifacts
- Threads can re-use the last Case as context for follow-up questions.

## Actions (Follow-Ups Without Re-Running The Base Question)
- Actions are invoked via `POST /cases/action` using a `case_id`.
- Supported actions:
  - `SHOW_EVIDENCE`
  - `VERIFY_ACROSS_SYSTEMS`
  - `EXPORT_CSV`, `EXPORT_XLSX`
  - `BUILD_REPORT`
- Artifacts are written only to dedicated S3 prefixes and returned via pre-signed URLs.

## Evidence Pack
`evidence_pack` is the contract for trust:
- executed SQL (when applicable)
- query execution IDs (when applicable)
- views/sources used
- freshness evidence for each touched source
- cross-check outputs + tolerances
- status: `ok` | `unavailable` | `inconclusive`
- confidence: `high` | `medium` | `low`

## Feature Flags
All runtime upgrades are gated behind configuration flags (default off unless explicitly enabled):
- `CASE_RUNTIME_ENABLED`
- `BEDROCK_TOOL_USE_ENABLED`
- `KB_ENABLED`
- `VERIFY_ACTION_ENABLED`
- `REPORT_EXPORT_ENABLED`

## Safe Write Paths
Exports and reports can only be written to configured S3 prefixes:
- Case exports: `raw/mac_ai_console/case_exports/<case_id>/...`
- Reports: `<REPORTS_PREFIX>/<case_id>/...`
- Runtime artifacts: `<AGENT_ARTIFACTS_PREFIX>/<case_id>/...`
