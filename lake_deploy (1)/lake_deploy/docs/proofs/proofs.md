# Proofs & Evidence

## Proof Artifacts (Daily)
Each system run must emit a manifest:
- `s3://gwi-raw-us-east-2-pc/orchestration/<system>_daily/run_date=YYYY-MM-DD/manifest.json`

## SSOT Gate Proofs (Required)
SSOT claims are blocked unless these proof files exist:
- `s3://gwi-raw-us-east-2-pc/ssot_proofs/<system>/run_date=YYYY-MM-DD/source_parity.json`
- `s3://gwi-raw-us-east-2-pc/ssot_proofs/<system>/run_date=YYYY-MM-DD/partition_integrity.json`
- `s3://gwi-raw-us-east-2-pc/ssot_proofs/<system>/run_date=YYYY-MM-DD/schema_parse_integrity.json`
- `s3://gwi-raw-us-east-2-pc/ssot_proofs/<system>/run_date=YYYY-MM-DD/reconciliation.json`

Each proof file must include Athena QIDs or native-source query identifiers.

## SSOT Summary Proof
- Query:
  ```
  SELECT *
  FROM curated_recon.ssot_daily_summary
  WHERE run_date = '<YYYY-MM-DD>'
  ORDER BY system, entity;
  ```

## Investor Proof Pack (Examples)
- Outputs (Athena CSV results):
  - `s3://gwi-raw-us-east-2-pc/athena-result/investor-passings/...csv`
  - `s3://gwi-raw-us-east-2-pc/athena-result/investor-gl/...csv`
- Source docs staged at:
  - `s3://gwi-raw-us-east-2-pc/raw/investor_docs/2026-01-23/`

## Vetro Export Proofs
- Latest export zip per plan:
  `s3://gwi-raw-us-east-2-pc/raw/vetro/plan_id=<plan_id>/dt=<YYYY-MM-DD>/`
- State files:
  - `s3://gwi-raw-us-east-2-pc/vetro_export_state/plan_index.json`
  - `s3://gwi-raw-us-east-2-pc/vetro_export_state/backfill_queue.json`

## Deployed Today
- Manifests written for Vetro, Intacct, Salesforce, Gaiia.
- Investor proof pack queries and outputs exist (manual staging required for source docs).

## Planned / Future
- Automated proof packs for all investor questions.
- Formal proof catalog in curated_ssot.
