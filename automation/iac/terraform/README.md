# Terraform (IaC Codification Scaffold)

This folder is a Terraform scaffold intended to help an IaC team codify the existing AWS lake infrastructure.

Principles:
- Start with **inventory + import**, not destructive re-creation.
- Keep changes additive and reversible.
- Never store secrets in Terraform code or state.

## Layout
- `backend.tf`: declares an S3 backend (configuration supplied at init-time).
- `providers.tf`: AWS provider configuration.
- `modules/lake_inventory`: read-only inventory module for key buckets/prefix contracts.

## Getting Started (Read-Only Inventory)
1. Configure AWS credentials for the target account/region.
2. Initialize with backend config (example values; use the approved state bucket/table):
   ```bash
   cd automation/iac/terraform
   terraform init \
     -backend-config="bucket=<STATE_BUCKET>" \
     -backend-config="key=lake_deploy/terraform.tfstate" \
     -backend-config="region=us-east-2" \
     -backend-config="dynamodb_table=<LOCK_TABLE>"
   ```
3. Run:
   ```bash
   terraform plan
   ```

## Import Strategy (When Managing Resources)
When moving from inventory to managed resources:
- create resource blocks with `prevent_destroy`
- import the existing resources into state
- validate drift via `terraform plan`

## Notes
This scaffold does not apply changes by default. It is safe to use for inventory and planning.

