# Intacct Full-History Status (2026-02-11)

## Block Status
- 2017–2018 block
- RUN_DATE: 2026-02-10_block2_2017_2018_ps2000
- Result: FAIL (crosswalk incomplete)
- Evidence pack (S3): s3://gwi-raw-us-east-2-pc/curated_recon/intacct_self_audit/dt=2026-02-10_block2_2017_2018_ps2000/
- Evidence pack (local): /Users/patch/lake_deploy/ssot_audit/intacct_2026-02-10_block2_2017_2018_ps2000/
- GL entries count: 1000
- Entry date range: 12/31/2017 → 12/31/2018
- Curated SSOT count: 2,270,439
- Exceptions count: 35
- Crosswalk evidence: crosswalk_refresh_qids.tsv, crosswalk_evidence_qids.tsv, crosswalk_evidence.json
- Crosswalk gap: `sf_intacct_crosswalk_summary` shows 0 Salesforce accounts with `customer_id__c`; 66,656 gaps (all missing SF customer_id). Intacct account crosswalk cannot be built until a deterministic key is populated.
- Crosswalk logic added: Intacct customers map to Salesforce via `customer_id__c` → `customerid` (deterministic, no fuzzy match). Result: 0 matches due to empty `customer_id__c`.

- 2019–2020 block
- RUN_DATE: 2026-02-11_block3_2019_2020_ps2000
- Result: FAIL (crosswalk incomplete)
- Evidence pack (S3): s3://gwi-raw-us-east-2-pc/curated_recon/intacct_self_audit/dt=2026-02-11_block3_2019_2020_ps2000/
- Evidence pack (local): /Users/patch/lake_deploy/ssot_audit/intacct_2026-02-11_block3_2019_2020_ps2000/
- GL entries count: 343,169
- Entry date range: 01/01/2019 → 12/31/2020
- Curated SSOT count: 2,270,439
- Exceptions count: 35
- Crosswalk evidence: crosswalk_evidence_qids.tsv, crosswalk_evidence.json
- Crosswalk gap: `sf_intacct_crosswalk_summary` shows 0 Salesforce accounts with `customer_id__c`; 66,656 gaps (all missing SF customer_id).

- 2023–2024 block
- RUN_DATE: 2026-02-11_block5_2023_2024_ps2000
- Result: FAIL (crosswalk incomplete)
- Evidence pack (S3): s3://gwi-raw-us-east-2-pc/curated_recon/intacct_self_audit/dt=2026-02-11_block5_2023_2024_ps2000/
- Evidence pack (local): /Users/patch/lake_deploy/ssot_audit/intacct_2026-02-11_block5_2023_2024_ps2000/
- GL entries count: 138,002
- Entry date range: 01/01/2023 → 02/06/2024
- Curated SSOT count: 2,270,439
- Exceptions count: 35
- Crosswalk evidence: crosswalk_evidence_qids.tsv, crosswalk_evidence.json
- Crosswalk gap: `sf_intacct_crosswalk_summary` shows 0 Salesforce accounts with `customer_id__c`; 29,610 gaps (SF total 33,328; 3,718 with Intacct match but no deterministic key populated).

- 2021–2022 block
- RUN_DATE: 2026-02-11_block4_2021_2022_ps2000
- Result: FAIL (crosswalk incomplete)
- Evidence pack (S3): s3://gwi-raw-us-east-2-pc/curated_recon/intacct_self_audit/dt=2026-02-11_block4_2021_2022_ps2000/
- Evidence pack (local): /Users/patch/lake_deploy/ssot_audit/intacct_2026-02-11_block4_2021_2022_ps2000/
- GL entries count: 276,000
- Entry date range: 01/01/2021 → 12/31/2022
- Curated SSOT count: 2,270,439
- Exceptions count: 35
- Crosswalk evidence: crosswalk_evidence_qids.tsv, crosswalk_evidence.json
- Crosswalk gap: `sf_intacct_crosswalk_summary` shows 0 Salesforce accounts with `customer_id__c`; 29,610 gaps (SF total 33,328; 3,718 with Intacct match but no deterministic key populated).

## No-Data Ranges (Do Not Re-Run)
- 2000–2016
- Reason: probe runs returned count=0 (see runbooks/intacct_full_history_block_ingest_2026-02-10.md)
- Policy: treat as NO-DATA unless future evidence contradicts; avoid repeated zero runs

## Active Block
- None (no ECS ingestion tasks running as of 2026-02-11T04:52:06Z)

## Gap Report (Remaining)
- 2021–2022 (pending)
- 2023–2024 (pending)
- 2025–2026 (covered by 24-month backfill; no full-history block needed unless audit gap found)
