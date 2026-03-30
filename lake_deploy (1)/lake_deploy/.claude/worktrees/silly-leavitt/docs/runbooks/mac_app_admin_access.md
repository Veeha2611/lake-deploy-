# MAC App Admin Access (Cognito)

This runbook provides a quick CLI to add/remove MAC App admins and send access notifications.

## Prereqs
- AWS credentials with access to Cognito user pool in `us-east-2`.
- SES verified sender for automatic notification emails.

## Commands

Add an admin (sends Cognito invite email + capability note):
```bash
python3 /Users/patch/lake_deploy/scripts/mac_admin_access.py add --email user@macmtn.com
```

Add admin + send notification email via SES:
```bash
export MAC_ADMIN_SES_FROM=it@macmtn.com
python3 /Users/patch/lake_deploy/scripts/mac_admin_access.py add --email user@macmtn.com --notify
```

Skip capability notification:
```bash
python3 /Users/patch/lake_deploy/scripts/mac_admin_access.py add --email user@macmtn.com --no-notify
```

Resend invite:
```bash
python3 /Users/patch/lake_deploy/scripts/mac_admin_access.py resend --email user@macmtn.com
```

Remove admin (optional disable):
```bash
python3 /Users/patch/lake_deploy/scripts/mac_admin_access.py remove --email user@macmtn.com --disable
```

List current admins:
```bash
python3 /Users/patch/lake_deploy/scripts/mac_admin_access.py list
```

## Defaults / Configuration
- Stack name: `MacAppV2Stack` (override with `MAC_APP_STACK_NAME`)
- Region: `us-east-2` (override with `AWS_REGION`)
- Group: `mac-admin` (override with `MAC_ADMIN_GROUP`)
- Allowed domain: `macmtn.com` (override with `MAC_ALLOWED_DOMAIN`)
- User pool ID auto-resolved from CloudFormation output `MacAppUserPoolId` unless `MAC_APP_USER_POOL_ID` is set.
- SES sender (required for notifications): `MAC_ADMIN_SES_FROM` or `SES_FROM` (must be verified in SES).
- Optional admin tool allowlist: `ADMIN_TOOL_ALLOWLIST` (comma-separated emails).
- Optional Google IdP (Cognito Hosted UI):
  - `MAC_GOOGLE_OAUTH_CLIENT_ID`
  - `MAC_GOOGLE_OAUTH_CLIENT_SECRET`
  - If set, the User Pool client enables Google as a federated IdP.

## Notes
- Users must sign in with `@macmtn.com` emails unless `--allow-non-domain` is explicitly provided.
- Access is read-only to SSOT data; admin privileges only affect scenario operations and app tooling.
 - To surface the Google login button in the UI, set `authProvider: 'google'` or `authProviders: ['google']` in the public config (or `VITE_AUTH_PROVIDER=google`).

## In-app Admin Panel
Admins can manage access in the app under `Settings` → `Access Administration`.
