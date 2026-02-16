# GitHub + SSOT Protocol (No Secrets)

This is the **required protocol** before any GitHub staging or commit.

## 1) Evidence First
- Do not commit until the workstream evidence pack exists:
  - `summary.md`
  - `evidence/index.md`
  - `qids.tsv`
  - `athena_values.json`
  - `status.json`
  - `files_changed.txt`
  - `commands_run.txt`
  - `s3_paths.txt`

## 2) Secret Hygiene (mandatory)
Run a lightweight scan against your workstream folder and the files you touched.

Recommended command (fast, strict):
```
rg -n -i "AKIA|SECRET|TOKEN|PASSWORD|PRIVATE KEY|BEGIN RSA|BEGIN PRIVATE" <thread_folder>
```

If anything matches, redact before proceeding.

## 3) Git Commit Rules
- **No secrets** in commits — only references by **secret name**.
- Commit in logical chunks with clear messages.
- Do **not** mix unrelated changes in one commit.

## 4) Proof of SSOT
Every SSOT‑related commit must include:
- Evidence pack with QIDs
- S3 evidence paths
- PASS/FAIL status
- Notes on any exceptions

## 5) Final Push
Only push to GitHub when:
- Evidence is complete and reproducible
- Secret scan is clean
- All required files are in the intake folder
