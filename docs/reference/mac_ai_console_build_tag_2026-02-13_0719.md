# MAC AI Console Build Tag — 2026-02-13_0719

Purpose: capture a known-good MAC AI Console + API state for fast rollback while continuing upgrades.

## Audit
- Prompt: `docs/ssot/mac_ai_console_audit_prompt_2026-02-12.md`
- Result: **PASS**
- Audit timestamp: `2026-02-13T06:35:54Z`
- Evidence (local): `lake_deploy/ssot_audit/mac_ai_console_2026-02-12/`
- Evidence (S3): `s3://gwi-raw-us-east-2-pc/curated_recon/mac_ai_console_audit/dt=2026-02-12/`

## UI Release
Prod (`mac-app` -> `main`)
- URL: `https://mac-app.macmtn.com/`
- `release.json`:
  - `build_id`: `20260213T071956Z`
  - `branch`: `main`
  - `git_sha`: `230dc06`

Fallback (`stable` branch)
- URL: `https://stable.d102snx81qqbwt.amplifyapp.com/`
- `release.json`:
  - `build_id`: `20260213T072411Z`
  - `branch`: `stable`
  - `git_sha`: `230dc06`

## Rollback
Switch prod domain (`mac-app`) to the stable branch:
```bash
cd /Users/patch/lake_deploy
./scripts/mac_release_switch.sh stable
```

Switch back to main:
```bash
cd /Users/patch/lake_deploy
./scripts/mac_release_switch.sh main
```

