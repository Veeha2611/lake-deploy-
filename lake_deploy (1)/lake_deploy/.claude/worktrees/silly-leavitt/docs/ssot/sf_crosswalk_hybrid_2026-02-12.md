# Salesforce↔Intacct Hybrid Crosswalk Status (2026-02-12)

## Summary
# SF->Platt->Intacct Hybrid Crosswalk Summary (2026-02-12)

## Counts
- hybrid_rows (plat_id__c -> Platt -> Intacct, Plat_Version__c=6 filter): 9178
- plat_guarantor_rows (SF plat_guarantor_id__c -> Platt guarantor -> Intacct): 263
- addr_platt_rows (SF addr -> Platt addr -> Intacct): 4280
- addr_intacct_rows (SF addr -> Intacct mail addr): 0
- auth_rows (authorization_number__c -> Intacct recordno): 0 (27321 pairs, 0 unique 1:1)
- name_zip_rows (name + zip): 0 (ambiguous; 90k+ pairs, 0 unique 1:1)
- addr_only_rows (street+zip+city+state): 0 (ambiguous; 82k+ pairs, 0 unique 1:1)
- final_rows: 13721

## sf_intacct_crosswalk_summary
- sf_accounts_total: 33328
- sf_accounts_with_customer_id: 9759
- sf_accounts_missing_customer_id: 23569
- sf_accounts_with_intacct_match: 10771
- sf_accounts_no_intacct_match: 22557
- deterministic_match_rate: 32.33%

## Notes
- Hybrid crosswalk uses plat_id__c -> Platt -> Intacct (1:1), plus address-based bridge via Platt.
- Added deterministic SF authorization_number__c -> Intacct recordno bridge, plus name+ZIP and address-only forensic fallbacks. All 3 produce zero unique 1:1 matches due to high duplication.
- Added direct Salesforce pull for plat_guarantor_id__c and crosswalked through Platt guarantor -> Intacct (1:1). Net coverage increase is small but non-zero; still below SSOT threshold.
- Applied Plat_Version__c=6 filter via manual SF export list (reduces duplicates, lowers coverage).


## Evidence Pack
- Local: `ssot_audit/sf_crosswalk_hybrid_2026-02-12/`
- Local (lake-side refresh): `ssot_audit/sf_crosswalk_on_ingest_2026-02-12/`
- Local (direct SF extract): `ssot_audit/sf_direct_export_2026-02-12/`
- Local (missing Plat_ID v6 list): `ssot_audit/sf_missing_plat_id_v6_2026-02-12/`
- Key files:
  - `qids.tsv`
  - `results/count_hybrid.json`
  - `results/count_name_zip.json`
  - `results/count_addr_only.json`
  - `results/count_final.json`
  - `results/sf_intacct_crosswalk_summary.json`
  - `summary.md`
  - `sf_crosswalk_on_ingest_2026-02-12/results/sf_intacct_crosswalk_summary.json`
  - `sf_missing_plat_id_v6_2026-02-12/sf_missing_plat_id_v6.csv`

## SQL / Code Changes
- `athena/curated/ssot/64_curated_crosswalks_sf_platt_intacct.sql`
- `athena/curated/ssot/65_curated_crosswalks_sf_intacct_final.sql`
- `athena/curated/ssot/66_curated_crosswalks_sf_intacct_auth.sql`
- `athena/curated/ssot/67_curated_crosswalks_sf_intacct_addr.sql`
- `athena/curated/ssot/68_curated_crosswalks_sf_intacct_forensic.sql`
- `athena/curated/ssot/69_curated_crosswalks_sf_platt_guarantor_intacct.sql`
- `athena/raw/06_raw_salesforce_direct_account_guarantor.sql`
- `athena/curated/ssot/70_ssot_xwalk_autogen.sql`
- `ssot_audit/run_sf_crosswalk_hybrid_2026-02-12.sh`
- `ssot_audit/run_sf_crosswalk_on_ingest.sh`
- `scripts/salesforce_pull_account_guarantor.py`
- `ssot_audit/run_xwalk_autogen_only_2026-02-12.sh`
- `docs/integrations/salesforce.md`

## Current SSOT Status
- **Improved**, not yet SSOT-complete.
- `sf_accounts_with_intacct_match` remains below 90%.

## Next Required Action (for full SSOT)
- Populate deterministic Salesforce keys (`customer_id__c` / `primary_system_id__c`) upstream **or**
- Approve curated manual mappings from deterministic candidate lists (name+zip and address-only are too ambiguous without review).
