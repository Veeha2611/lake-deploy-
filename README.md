# lake_deploy

## Contents
- `athena/raw/`: Athena DDL + partition projection for `vetro_raw_db.raw_line`.
- `athena/curated/`: Curated view templates and JSON discovery query.
- `athena/raw/legacy_ddls/` + `athena/curated/legacy_ctas/`: Legacy DDL/CTAS from prior builds.
- `automation/lambda/`: Lambda handler that cycles through plans, honors signed URLs, and writes raw JSON to the designated S3 prefix.
- `automation/cf/`: CloudFormation stack for the Lambda, schedule, DLQ, monitoring, and IAM permissions.
- `docs/`: Full data lake bible (architecture, schema, runbooks, proofs, security).
- `runbooks/`: Operational runbooks and helper scripts for deployment and validation.
- `external_sources/`: Imported legacy scripts/configs (sanitized, reference only).
- `release-log/`: Release log template that enforces MAC tagging, IaC pointers, and deadline reminders.

## Deployment order
1. Create the Athena database if it does not exist: `CREATE DATABASE IF NOT EXISTS vetro_raw_db;`.
2. Run `athena/raw/01_raw_vetro_ddl.sql` to define `vetro_raw_db.raw_line`.
3. Apply `athena/raw/02_raw_vetro_projection.sql` to enable date partition projection.
4. Sample 7 days of raw JSON via `athena/curated/10_curated_vetro_rollup.sql` to confirm JSON paths.
5. Zip and upload the Lambda code (`automation/lambda/vetro_export_lambda.py`) to the orchestrator bucket.
6. Deploy the CloudFormation stack in `automation/cf/vetro_export_stack.yaml`.
7. Use `runbooks/deploy_vetro_export.sh` and `runbooks/validate_vetro_export.sh` to automate execution and verification.
8. Document the delivery in `release-log/RELEASE_LOG.md` using the MAC tagging scheme and IaC pointers.

## Naming conventions
- Athena artifacts carry numeric prefixes (`01_`, `02_`, `10_`) to clarify sequencing.
- Automation artifacts live under `automation/lambda` and `automation/cf` with descriptive names.
- Runbook scripts are verb-noun (`deploy_vetro_export.sh`, `validate_vetro_export.sh`) and paired with markdown guidance.
- Release tags follow `mac-YYYYMMDD-vX` and must include IaC pointers for Athena SQL, the CloudFormation template, and the Lambda zip.

## Data Lake Bible
Start here: `docs/data_lake_bible.md`
