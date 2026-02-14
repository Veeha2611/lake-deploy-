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

