# Security and Secrets Handling

Hard rules:
- Never commit secrets. No tokens, cookies, passwords, keys, or raw credentials.
- All credentials must live in AWS Secrets Manager or SSM Parameter Store.
- Code may reference only secret *names* (for example: `salesforce/prod/oauth`).

Approved patterns:
- Lambda/ECS reads secrets at runtime via IAM.
- IaC provisions secret containers but not secret values.
- Manifests and logs must not include secret values.

Local workflow:
1) Store secrets outside the repo (for example: `~/.secrets`).
2) Use environment variables that point to secret names only.
3) Run secret scans before every push.

Secret scan commands:
- `git grep -n -E "(AKIA|ASIA|SECRET|TOKEN|PASSWORD|PRIVATE KEY|BEGIN RSA|BEGIN OPENSSH)"`
- `rg -n "(authorization:|bearer |client_secret|refresh_token|api[_-]?key)"`

If a secret is exposed:
1) Rotate the secret in AWS immediately.
2) Remove it from git history.
3) Document the incident and rotation.
