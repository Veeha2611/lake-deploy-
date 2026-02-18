# Intacct Forensic Native-vs-Lake Audit (All S3 Buckets) — 2026-02-18

## Purpose
Establish a deterministic, evidence-backed answer to: **is Intacct fully mirrored into the lake (like-for-like) and SSOT-ready?**

Constraints:
- Read-only to Intacct and AWS (no DDL/DML).
- Do not treat “ingestion succeeded” as truth; only accept native-derived parity.
- Do not print secrets/tokens.

## How To Re-Run (Deterministic)
Script:
- `ssot_audit/run_intacct_forensic_native_full.py`

Command:
```bash
cd /Users/patch/lake_deploy
python3 ssot_audit/run_intacct_forensic_native_full.py \
  --run-tag 20260218T180000Z_allbuckets_v3 \
  --all-buckets
```

## Evidence Pack (Run Tag: `20260218T180000Z_allbuckets_v3`)
Local:
- `ssot_audit/intacct_forensic_native_full_20260218T180000Z_allbuckets_v3/`

S3:
- `s3://gwi-raw-us-east-2-pc/curated_recon/intacct_self_audit/forensic_native_full/dt=20260218T180000Z_allbuckets_v3/`

Key artifacts:
- `native_baseline.json` (native readByQuery totalcount per object)
- `native_scope_derived.json` (native GLENTRY year/quarter/month scope derivation)
- `lake_object_parity.json` (lake run discovery + best-run parity per object)
- `gl_block_coverage.json` (GLENTRY coverage selection + missing non-zero months)
- `s3_bucket_scan.json` (all-buckets scan proof)
- `controlids.tsv` (native controlids + timestamps)
- `qids.tsv` (Athena query execution IDs)
- `status.json` (PASS/FAIL + remediation list)
- `executive_findings.md` (summary table)

## Step 0 — “All Buckets” S3 Scan Result
This audit explicitly scanned **all accessible S3 buckets** in the account, checking for Intacct-related prefixes (fast existence checks with `MaxKeys=1`).

Result:
- Buckets scanned: **38**
- Buckets with any Intacct artifacts: **1**
- Bucket name: `gwi-raw-us-east-2-pc`

Source: `s3_bucket_scan.json`.

Implication:
- Under the current AWS credentials/visibility, there is **no additional Intacct mirror data** in other buckets to “discover” and add to coverage/parity.

## Final Verdict
Result: **FAIL**

### Native vs Lake Parity (Totals)
| Object | Native totalcount | Lake record_count | Parity |
|---|---:|---:|---|
| GLENTRY | 12,799,628 | 912,267 | FAIL |
| GLACCOUNT | 400 | 400 | PASS |
| CUSTOMER | 14,199 | 14,199 | PASS |
| VENDOR | 1,508 | 1,508 | PASS |
| APBILL | 24,666 | 24,665 | FAIL |
| APPYMT | 17,176 | 17,176 | PASS |
| ARINVOICE | 1 | 1 | PASS |
| ARINVOICEITEM | 2 | 2 | PASS |
| ARPAYMENT | 1 | 1 | PASS |
| OTHERRECEIPTS | 80,133 | 80,124 | FAIL |

Source: `status.json` and `executive_findings.md`.

## GLENTRY Coverage Findings (Native-Derived Scope)
Notes:
- This Intacct tenant rejects `<orderby>` in `readByQuery`; the audit derives scope via year/quarter/month probes instead (see `native_scope_derived.json`).
- Native probe for pre-2017 GLENTRY returned `0` totalcount (so the mirror scope begins in 2017 for this dataset).

Coverage summary:
- Native total: `12,799,628`
- Lake covered unique (best non-overlapping windows): `3,796,408` (**29.66%**)
- Gap: `9,003,220`
- Missing non-zero months: **17**

Missing non-zero months (from `gl_block_coverage.json`):
- 2023-01 .. 2023-12 (all 12 months)
- 2024-01
- 2024-02
- 2026-02
- 2026-03
- 2026-12

## Deterministic Closure Plan (What Must Be Ingested / Repaired)
1) **GLENTRY**
- Mirror the missing windows above, ensuring landed `metadata.record_count` matches native totals for those windows and that coverage does not double-count overlaps.
- At minimum, ingest:
  - `2023-01-01..2023-12-31` (quarterly or monthly blocks)
  - `2024-01-01..2024-02-06` (bridges the gap before the existing `2024-02-07..` window)
  - `2026-02-01..2026-12-31` (at least through the months shown non-zero in native scope)

2) **APBILL** (off by 1)
- Re-run a deterministic native-vs-lake parity after a full refresh for APBILL; treat as a real mismatch until proven otherwise.

3) **OTHERRECEIPTS** (off by 9)
- Same as APBILL: refresh + parity check; do not mark SSOT-complete until exact match.

## Notes / Known Caveats
- “All buckets” means all buckets returned by `s3:ListAllMyBuckets` for the active AWS principal. Buckets the principal cannot list will not appear and therefore cannot be audited here.
- For very large JSON artifacts, the audit uses `metadata.record_count` as the lake-side truth (line counting is only used for small files as a fallback).

