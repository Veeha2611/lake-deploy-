# Known Gaps And Risk

This document captures common failure modes so the runtime can fail closed (UNAVAILABLE / INCONCLUSIVE) instead of returning misleading numbers.

## Common Gaps
- System-to-network mappings may be incomplete for some `gwi_system` values.
- City fields can be inconsistent (`city` vs `gwi_lq_city`), and billing system labels may not match SSOT geography.
- Network naming conventions may change over time (classification based on name patterns can drift).
- Some SSOT views are snapshots with different update cadences; freshness checks must be enforced per source.

## Common Risks
- Type mismatches in downstream views (e.g., `bigint` vs `varchar`) can invalidate dependent views.
- Empty partitions can cause correct queries to return no rows; treat empty sources as unavailable when configured.
- Cross-check templates can diverge if they use different business definitions; comparisons must be tolerance-based and definition-aware.

## Operational Notes
- When a KPI is requested and verification paths are not configured, mark verification as unavailable.
- When a native connector is not configured, mark it as blocked with a concrete configuration reason.

