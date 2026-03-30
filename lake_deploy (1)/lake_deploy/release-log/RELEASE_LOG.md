# Release Log

This folder tracks **what changed**, **what was deployed**, and **what evidence exists** for each release.

## Principles
- No secrets: never record tokens, keys, DSNs, or signed URLs.
- Evidence-backed: link to SSOT evidence packs (Athena QIDs + S3 prefixes) for any KPI or data-quality claim.
- Reproducible: record the exact commit SHA and deploy target(s).
- Reversible: include a rollback plan (tag / prior commit / infra change).

## Tagging
Recommended git tag format for releases:
- `mac-YYYYMMDD-vX`

## Entry Template
Copy/paste for each release:

```
## mac-YYYYMMDD-vX (YYYY-MM-DD)

**Commit:** <git_sha>
**Environment:** <dev|stage|prod>

### Deployed Components
- MAC App UI: <Amplify app id / branch / artifact version>
- MAC API: <API Gateway id / stage / Lambda version>
- Lake/IaC: <Terraform module(s) / stack(s) / change summary>

### Change Summary
- <bullet list of user-visible changes>
- <bullet list of non-user-visible infra/data changes>

### SSOT / Data Quality Evidence
- Evidence pack(s): `ssot_audit/<evidence_pack_dir>/`
- S3 evidence prefix(es): `s3://.../dt=YYYY-MM-DD/`
- Notes: <what was validated and what remains open>

### Rollback Plan
- Prior tag/commit: <tag_or_sha>
- Steps:
  1. <step>
  2. <step>
```

## 2026-02-18 (Docs + OnPoint Task Order)

**Commit:** ff0601f743577645199c7240df34d7b29d973bf4
**Environment:** N/A (documentation only)

### Change Summary
- Added an OnPoint task-order doc for AWS resource validation sequencing.
- Added OnPoint working-session prep notes derived from the 2026-02-16 transcripts.
- Documented the Intacct forensic native-vs-lake audit (all S3 buckets) and linked the latest evidence pack.
- Updated SSOT readiness status to explicitly separate Intacct 24-month mirror vs full-history native parity status.

### SSOT / Data Quality Evidence
- Intacct forensic evidence pack:
  - Local: `ssot_audit/intacct_forensic_native_full_20260218T180000Z_allbuckets_v3/`
  - S3: `s3://gwi-raw-us-east-2-pc/curated_recon/intacct_self_audit/forensic_native_full/dt=20260218T180000Z_allbuckets_v3/`
