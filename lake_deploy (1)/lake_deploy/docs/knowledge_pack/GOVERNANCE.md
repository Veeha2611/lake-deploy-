# Governance

## Scope
- Read-only analytics over governed Athena views (SSOT-first).
- No DDL/DML. No raw S3 access. No direct access to unapproved databases/tables.

## Evidence Policy
- Numeric outputs must be backed by executed queries (query execution IDs where available).
- Always capture source freshness (latest partition / dt) for every view touched.
- If a source is empty or stale beyond policy, return `UNAVAILABLE` (do not return `0` unless proven by query).
- If independent cross-checks disagree beyond tolerance, return `INCONCLUSIVE` and show both values.

## Deterministic Execution
- Queries must be `SELECT`/`WITH` only.
- Sources must be allowlisted (`allowed_sources.json`) and SQL must pass the allowlist validator.
- Joins must be from the governed join map (`join_map.json`).
- Time bounds are required when the source requires them (default to latest/last_n when not specified).

## Actions
- Verification, exports, and report generation are enabled only when explicitly configured.
- Report outputs may be written only to the dedicated reports prefix.

