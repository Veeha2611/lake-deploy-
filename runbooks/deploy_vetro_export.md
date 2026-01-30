# Deploy Vetro Export

## Overview
Deliver the MAC + Query Layer governance export by defining Athena artifacts, shipping Lambda code, and deploying the automation stack.

## Steps
1. **Create Athena DB (if missing)** – Run `CREATE DATABASE IF NOT EXISTS vetro_raw_db;` in Athena; this ensures the raw table has a home.
2. **Athena DDL** – Execute `athena/raw/01_raw_vetro_ddl.sql` to define `vetro_raw_db.raw_line`.
3. **Partition projection** – Execute `athena/raw/02_raw_vetro_projection.sql` to keep dt partitions projected.
4. **JSON discovery** – Use the sampling query in `athena/curated/10_curated_vetro_rollup.sql` to inspect `passings`, `system`, and `business_model` fields.
5. **Package Lambda** – Zip `automation/lambda/vetro_export_lambda.py` (zip must include dependencies if needed) and upload to `s3://gwi-raw-us-east-2-pc/orchestration/lambda-code/vetro_export_lambda.zip`.
6. **Deploy CloudFormation** – Run `runbooks/deploy_vetro_export.sh` (see script for required parameters).
7. **Monitor** – Use `runbooks/validate_vetro_export.sh` to confirm logs, objects, partitions, and alarms.
8. **Release log** – Update `release-log/RELEASE_LOG.md` with the latest tag, commit SHAs, and pointers to the DD Pack + MAC architecture docs.
