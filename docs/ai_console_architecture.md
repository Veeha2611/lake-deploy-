# MAC Console Runtime (Architecture)

This document describes the MAC Console runtime and how it produces governed, evidence-backed outputs over SSOT views.

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

### Domain Registries (Finite + Deterministic)
Some business domains are closed as **finite registries** (not “infinite English”):
- Network Mix workbook domain: `apps/mac-app-v2/lambda/query-broker/network-mix-domain.yaml`
  - Registry spec + question matrix: `docs/network_mix_domain.md`

## Governed Planner (Fallback Path)
- When a question does not match the registry, the runtime can invoke Bedrock to produce a QueryPlan JSON.
- The planner never emits SQL. QueryPlan is compiled deterministically into SQL and then validated.
- Structured output mode uses Bedrock structured outputs with the QueryPlan JSON schema.
- Planner instructions are maintained at:
  - canonical planner system prompt file (metadata bundle)
  - `apps/mac-app-v2/lambda/query-broker/metadata/planner_system_prompt.txt` (runtime bundle)

## Capability Router (Optional, Feature-Flagged)
- Capability routing is only enabled when `CAPABILITY_ROUTER_ENABLED=true`.
- The router is driven by a registry file:
  - capability registry file in `apps/mac-app-v2/lambda/query-broker/config/`
- Routing order:
  1. Deterministic registry match (always first).
  2. If no match and capability routing is enabled: pick a capability by keyword match.
  3. Enforce required flags + required datasets for the capability.
  4. If missing: return a clear "NOT SUPPORTED YET" response with the next step.
  5. If present:
     - Prefer deterministic capability handlers where available.
     - Otherwise, invoke the governed planner only when `PLANNER_ALLOWED=true`.

### "Not Supported Yet" Contract
When a question cannot be supported (missing capability, flag, or dataset), the API must return:
- `answer_markdown` containing:
  - `NOT SUPPORTED YET: ...`
  - `NEXT STEP: ...`
- No numeric values are returned without an `evidence_pack`.

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
- `CAPABILITY_ROUTER_ENABLED`
- `TEMPLATES_ONLY` (default true; disables planner execution)
- `PLANNER_ALLOWED`
- `NATIVE_VERIFY_ENABLED`
- `IPV4_ENABLED`

## Test Harness
- Golden regression questions (template + action sanity): `metadata/golden_questions.json` via `scripts/golden_questions_runner.py`
- Capability router contract suite: `automation/tests/alex_questions.json` via `automation/tests/run_alex_questions.py`

## Safe Write Paths
Exports and reports can only be written to configured S3 prefixes:
- Case exports: `raw/mac_ai_console/case_exports/<case_id>/...`
- Reports: `<REPORTS_PREFIX>/<case_id>/...`
- Runtime artifacts: `raw/mac_ai_console/agent_artifacts/<case_id>/...` (prefix configurable)
