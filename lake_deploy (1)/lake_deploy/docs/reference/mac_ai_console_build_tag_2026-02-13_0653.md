# MAC Console Build Tag — 2026-02-13_0653

## Audit
- Template: `docs/ssot/mac_console_audit_template_2026-02-12.md`
- Result: **PASS**
- Audit timestamp: `2026-02-13T06:35:54Z`
- Evidence (local): `lake_deploy/ssot_audit/mac_ai_console_2026-02-12/`
- Evidence (S3): `s3://gwi-raw-us-east-2-pc/curated_recon/mac_ai_console_audit/dt=2026-02-12/`
- QIDs (sample):
  - `copper_investigation`: `ff0e83c9-ae19-498e-9f5b-3cae5d42352f`
  - `isleboro_multi_scope`: `a2fbaf99-fad1-4cb2-8606-e3a4a110f38d`

## UI Release (Amplify)
- Prod URL: `https://mac-app.macmtn.com/`
- `release.json`:
  - `build_id`: `20260213T065320Z`
  - `branch`: `main`
  - `git_sha`: `230dc06`
- Amplify job:
  - branch `main`: job `136` (**SUCCEED**)

## API
- API Gateway (REST) id: `0vyy63hwe5` (stage `prod`)
- Auth: Cognito User Pool authorizer (required for `/query`, `/cases/action`, etc.)

## Smoke
- `scripts/golden_questions_runner.py`: **PASS 28 golden questions**
- Smoke timestamp: `2026-02-13T07:02:06Z`
