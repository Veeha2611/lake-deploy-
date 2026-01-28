# SSOT Policy (Lake-wide)

## Core rule
All reporting and user-facing answers must be derived from `curated_core.<entity>_current` views/tables only.

## Layers (required)
- `curated_core.<system>_<entity>_curated_raw`: typed, complete, no exclusions
- `curated_core.<system>_<entity>_current`: policy-applied SSOT
- `curated_recon.<system>_<entity>_exceptions`: excluded rows + reason codes

## Default policy
- **Dedup**: latest by `updated_at` else `ingested_at`
- **As-of**: exclude business dates > `run_date + 1 day`
- **Quality**: required columns present, non-zero counts, sane deltas vs prior day

## Evidence
Every daily run writes:
`orchestration/<system>_daily/run_date=YYYY-MM-DD/manifest.json`

Manifest must include:
- ssot_count
- max_business_date
- exception_count
- guard_ok
- query IDs (QIDs)

## Exceptions
Exceptions do **not** fail the run unless thresholds exceeded.
They are recorded and surfaced in `curated_recon.ssot_daily_summary`.
