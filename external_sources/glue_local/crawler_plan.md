# Glue Crawler Plan

## Existing crawlers and coverage
| Crawler Name | Description | S3 Target | Schedule |
| --- | --- | --- | --- |
| intacct_vendors_json_crawler | Crawls Intacct `vendors` JSON | `s3://gwi-raw-us-east-2-pc/raw/intacct_json/vendors/` | 02:10 UTC |
| intacct_customers_json_crawler | Crawls Intacct `customers` JSON | `s3://gwi-raw-us-east-2-pc/raw/intacct_json/customers/` | 02:12 UTC |
| intacct_gl_accounts_json_crawler | Crawls GL account master | `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_accounts/` | 02:14 UTC |
| intacct_ap_bills_json_crawler | Crawls AP bills | `s3://gwi-raw-us-east-2-pc/raw/intacct_json/ap_bills/` | 02:16 UTC |
| intacct_ap_payments_json_crawler | Crawls AP payments | `s3://gwi-raw-us-east-2-pc/raw/intacct_json/ap_payments/` | 02:18 UTC |
| intacct_gl_entries_json_crawler | Crawls GL entries | `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/` | 02:20 UTC |
| platt-raw-crawler | Crawls all Platt raw tables | `s3://gwi-raw-us-east-2-pc/raw/platt/` | 02:22 UTC |
| salesforce-raw-crawler | Crawls Salesforce exports | `s3://gwi-raw-us-east-2-pc/raw/salesforce/` | 02:24 UTC |

## Gap: Vetro automation
The raw Vetro exports needed for curated datasets land under `s3://gwi-raw-us-east-2-pc/raw/vetro/plan_id=<plan_id>/`. Add `vetro-raw-crawler` (schedule 02:26 UTC) per the inventory in `glue/crawlers.yaml`. It ensures the Step Functions workflow sees the newest Vetro JSON.

## Adding a new dataset checklist
1. Add the crawler metadata to `glue/crawlers.yaml` (name, targets, schedule, classifier, policies).
2. Update `glue/deploy_crawlers.yaml` with a corresponding `AWS::Glue::Crawler` resource referencing the new target + table prefix.
3. Run `glue/deploy_crawlers.sh` to redeploy the stack and confirm the crawler exists (`aws glue get-crawler --name <name>`).
4. Add raw Athena DDL under `curation/athena_ddl/` and register it via the curation runbook.
5. Update `curation/athena_ctas/` with curated CTAS, dimension/fact mappings, and add entries to `lake_curate.sh`/`orchestration/lambda/lake_orchestrator.py` to include the new dataset.
