# CI/CD And Terraform Backend

This document describes the expected CI/CD model and the Terraform backend requirements for IaC codification.

## GitHub Repository Permissions
Recommended baseline:
- Branch protection on `main`:
  - require pull requests
  - require at least 1 approval
  - require status checks to pass
  - restrict force pushes
- Enforce least-privilege repository roles:
  - maintainers: merge/release
  - contributors: PR-only
  - CI identities: read-only repository access with OIDC-based AWS access

## CI/CD Model (High Level)
Minimum required pipelines:
- **Sanitization scan**: block prohibited terms and unsafe content from landing.
- **Static checks**: formatting/lint where applicable.
- **IaC checks**:
  - `terraform fmt -check`
  - `terraform validate`
  - `terraform plan` against the appropriate environment

Recommended AWS access model for CI:
- GitHub Actions OIDC -> `sts:AssumeRoleWithWebIdentity`
- No long-lived AWS access keys stored in GitHub
- Separate roles per environment (dev/stage/prod), scoped to least privilege

## Terraform Remote State Backend
Required characteristics:
- S3 backend (one bucket per account or per environment)
- Encryption at rest (SSE-KMS)
- Bucket versioning enabled
- Public access blocked
- DynamoDB lock table for state locking

Recommended backend layout:
- State bucket: `tfstate-<org>-<env>-<region>`
- State key prefix: `lake_deploy/<stack_or_module>/terraform.tfstate`
- Lock table: `tfstate-locks-<org>-<env>`

Operational requirements:
- Backend resources must be created once and managed separately from the main stacks.
- State access must be tightly scoped to the CI deploy role and a limited set of maintainers.

## Environment Separation Strategy
Recommended approach:
- Separate environments by AWS account where possible.
- If a single account is required, separate by:
  - distinct Terraform workspaces or per-env root modules
  - consistent resource naming and tagging (e.g., `env=dev|stage|prod`)
  - isolated S3 prefixes and IAM roles per environment

## Required Secret Names (Names Only)
Application and ingestion dependencies typically reference these secret names:
- `salesforce/api_credentials`
- `intacct/credentials`
- `platt/credentials`
- `gaiia/api_keys`
- `monday/prod`

Notes:
- Secret values must not be stored in Git, CI logs, or Terraform state.
- IaC should reference secret *names* and enforce access via IAM policies.

