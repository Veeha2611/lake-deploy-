# MAC AI Console Build Tag — 2026-02-13_0845

Purpose: capture a known-good MAC AI Console + API state for fast rollback while continuing upgrades.

## Audit
- Prompt: `docs/ssot/mac_ai_console_audit_prompt_2026-02-12.md`
- Result: **PASS**
- Audit timestamp: `2026-02-13T08:41:09Z`
- Evidence (local): `ssot_audit/mac_ai_console_2026-02-13/`
- Evidence (S3): `s3://gwi-raw-us-east-2-pc/curated_recon/mac_ai_console_audit/dt=2026-02-13/`

## UI Release
Prod (`main`)
- URL: `https://mac-app.macmtn.com/`
- `release.json`:
  - `build_id`: `20260213T083830Z`
  - `branch`: `main`
  - `git_sha`: `2d12d4b`

Fallback (`stable`)
- URL: `https://stable.d102snx81qqbwt.amplifyapp.com/`
- `release.json`:
  - `build_id`: `20260213T084141Z`
  - `branch`: `stable`
  - `git_sha`: `2d12d4b`

## API Release
- Endpoint: `https://0vyy63hwe5.execute-api.us-east-2.amazonaws.com/prod/`
- Auth: disabled (breakglass) via `MAC_APP_AUTH_ENABLED=false` at deploy time.

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

