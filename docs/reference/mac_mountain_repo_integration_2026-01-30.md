# mac-mountain-insights-console integration (2026-01-30)

## Source
- GitHub: https://github.com/MM-Patch/mac-mountain-insights-console
- Local clone: `/Users/patch/mac-mountain-insights-console`

## Lake deploy integration
- Copied into: `lake_deploy/apps/mac-mountain-insights-console/`
- Copy method: rsync excluding `.git`

## Notes
- No (redacted) references found in repo source.
- Secret scan results captured in:
 - `docs/reference/mac_mountain_repo_secret_scan_2026-01-30.txt`
- Inventory captured in:
 - `docs/reference/mac_mountain_repo_inventory_2026-01-30.md`

## Governance
- Repo content uses env var placeholders for credentials.
- No embedded JWTs found (local scan for token patterns returned none).
