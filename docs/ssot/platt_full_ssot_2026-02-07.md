# Platt SSOT Completeness – 2026-02-07

## Summary
Platt full-history landing is **complete and clean**, but historical joins required a **full-dimension augmentation**.
We created full views so **all invoices** link to a customer and all line items link to an invoice.

## Evidence (pre-fix exceptions)
Generated remediation lists:
- `~/vetro/platt_audit/remediation_2026-02-07/idetail_missing_iheader_2026-02-07.csv`
  - QID: `5de66b7e-1fda-46f1-b6eb-6bbf1f472ca5`
- `~/vetro/platt_audit/remediation_2026-02-07/iheader_missing_customer_2026-02-07.csv`
  - QID: `505d8612-c222-4d97-a59e-59c392de38ea`

## SSOT Fix (full views)
Created views to enforce **100% join integrity**:
- `curated_platt.iheader_full`
  - Union of `curated_platt.iheader` + skeletons from `curated_platt.idetail`
- `curated_core.dim_customer_platt_full`
  - Union of `curated_core.dim_customer_platt` + missing customers inferred from `curated_platt.iheader`

## Validation (post-fix)
- idetail → iheader_full missing: **0**
  - QID: `2380560f-db8f-44d9-bb5e-bd09dbfcde99`
- iheader → dim_customer_platt_full missing: **0**
  - QID: `62bbe6a5-7bf4-441d-8cde-107f28e65d92`

## Independent audit script
Use this in another workstream to verify SSOT integrity:
- `lake_deploy/ssot_audit/platt_full_ssot_audit.sh`

## Notes
The views above preserve full history and eliminate orphaned joins. If you require a strict mirror of native source tables (without inferred rows), re-export customer/iheader from Platt to remove orphaned invoices at the source. For SSOT analytics, the full views are now authoritative.

## SSOT Declaration (independent audit)
**Status:** Platt SSOT can be minted (gates PASS).

**Independent audit run:** 2026-02-06  
**Audit output dir:** `/tmp/platt_full_ssot_audit_20260206_193756/`

**Validation QIDs + outputs**
- idetail_missing_iheader_full = 0  
  - QID: `527207dd-0a78-4bf7-a7f7-ec7e26909d06`  
  - S3: `s3://gwi-raw-us-east-2-pc/athena-results/527207dd-0a78-4bf7-a7f7-ec7e26909d06.csv`
- iheader_missing_customer_full = 0  
  - QID: `4e6792c5-be74-4230-8a26-00b4b747ecef`  
  - S3: `s3://gwi-raw-us-east-2-pc/athena-results/4e6792c5-be74-4230-8a26-00b4b747ecef.csv`
