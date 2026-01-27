# Codex Agent Rules (Data Lake)

This repo uses a strict push protocol for all completed data lake work.

Required workflow for completed changes:
1) Stage only relevant files.
2) Run a secret scan before every commit/push.
3) Commit in logical chunks with clear messages.
4) Push to `MM-Patch/lake_deploy`.

Hard rules:
- Never commit secrets (tokens, cookies, passwords, keys, raw credentials).
- Credentials must live in AWS Secrets Manager or SSM by secret name only.
- If work is partial/blocked or might leak secrets, do not push; explain the gap.

Suggested secret scans:
- `git grep -n -E "(AKIA|ASIA|SECRET|TOKEN|PASSWORD|PRIVATE KEY|BEGIN RSA|BEGIN OPENSSH)"`
- `rg -n "(authorization:|bearer |client_secret|refresh_token|api[_-]?key)"`
