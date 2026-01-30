# Lake Curation Runbook

This runbook explains how to detect new raw data partitions, register them with Glue/Athena, generate curated Parquet datasets, and validate the results. Every step center around the helper scripts and SQL assets in the `curation/` directory.

## Step 1 — Detect new raw partitions
1. Activate any AWS profile or environment you need (defaults to `AWS_PROFILE=default`).
2. Run `python3 curation/discover_partitions.py --dt-range YYYY-MM-DD:YYYY-MM-DD` to scan `s3://gwi-raw-us-east-2-pc/raw/` for newly landed partitions and compare them against Glue/Athena metadata.
3. Review the JSON report printed on stdout (it lists missing partitions per source) and archive it in `~/lake_runbook/<today>/` for auditing.

## Step 2 — Register raw tables (Glue crawlers or explicit DDL)
- If you already have Glue crawlers for the raw prefixes, run `aws glue start-crawler --name <raw-crawler-name>` after confirming the crawler targets `s3://gwi-raw-us-east-2-pc/raw/<source>/`.
- To avoid crawlers, execute the DDL under `curation/athena_ddl/` via Athena:
  ```sh
  aws athena start-query-execution \
    --query-string "$(< curation/athena_ddl/raw_intacct_gl_entries.sql)" \
    --result-configuration OutputLocation=s3://gwi-raw-us-east-2-pc/athena-query-results/raw-ddl/
  ```
  Repeat for the other DDL files (`raw_platt_customer.sql`, `raw_salesforce_accounts.sql`, `raw_vetro_exports.sql`).
- Run these DDLs after you confirm the schemas from Glue, adjusting columns as needed.

## Step 3 — Refresh partitions
1. For each table that gained a new partition, execute:
   ```sh
   aws glue batch-create-partition --database-name ${GLUE_DATABASE:-gwi_raw} --table-name raw_intacct_gl_entries --partition-inputs file://new_partitions.json
   ```
2. Or simply run `aws glue start-crawler --name <raw-crawler-name>` again and let Glue detect partitions.

## Step 4 — Run CTAS/Transforms into curated layer
1. Use `curation/lake_curate.sh --dt YYYY-MM-DD` (or `--dt-range START:END`) to orchestrate everything:
   - It calls `discover_partitions.py`.
   - It applies Athena DDL for raw tables.
   - It runs the CTAS statements in `curation/athena_ctas/` to populate curated Parquet sinks (partitioned by `dt`).
2. Each CTAS file uses a `{{dt}}` placeholder that gets replaced with the requested date when the script executes.
3. Curated targets include:
   - `curated_intacct_gl_entries` (flattened GL entries with location filtering)
   - `curated_platt_customer`
   - `curated_salesforce_accounts` / `curated_salesforce_opportunities`
   - `curated_vetro_exports`
   - `curated_dim_customer`
   - `curated_fact_revenue`

## Step 5 — Validation queries
Use Athena (or `lake_curate.sh`’s built-in validation stage) to run the following per-date checks:
1. Row count differences:
   ```sql
   SELECT '{{dt}}' AS dt, COUNT(*) AS rows FROM curated_intacct_gl_entries WHERE dt='{{dt}}';
   ```
2. Null/duplicate checks:
   ```sql
   SELECT dt, COUNT(*) AS missing_customer FROM curated_intacct_gl_entries WHERE customer_id IS NULL;
   ```
3. Schema drift guard (check unexpected columns/partition counts) via Glue table descriptions vs. expected column lists.
4. Cross-source joins sanity:
   ```sql
   SELECT dt, COUNT(*) FROM curated_fact_revenue WHERE dt='{{dt}}';
   ```
5. Capture all validation results in `~/lake_runbook/<today>/validation_{{dt}}.log`.

## Step 6 — Backfill a date range
1. Loop over historical dates and feed them to `lake_curate.sh`:
   ```sh
   for dt in $(python3 - <<'PY'
from datetime import datetime, timedelta
start = datetime(2025,1,1)
end = datetime(2025,12,31)
while start <= end:
    print(start.strftime('%Y-%m-%d'))
    start += timedelta(days=1)
PY
); do
  ./curation/lake_curate.sh --dt "$dt"
done
   ```
2. Monitor the run logs at `~/lake_runbook/<today>/` for failure reasons.

## Supporting artifacts
- `curation/lake_curate.sh` orchestrates detection, catalog updates, CTAS, and validation within a dated run folder.
- `curation/discover_partitions.py` is the authoritative detector for new S3 partitions relative to Glue/Athena.
- `curation/athena_ddl/` lists the raw table definitions, while `curation/athena_ctas/` houses CTAS statements that write to `s3://gwi-raw-us-east-2-pc/curated/`.
- The curated schema includes a canonical `curated_dim_customer` and a cross-source `curated_fact_revenue` so anything downstream can join on consistent keys.

## Passings split runbook note
1. **New raw spine:** three CSV-backed prefixes under `s3://gwi-raw-us-east-2-pc/raw/sheets/…/dt=2026-01-21/` now host `passings_pipeline_totals.csv`, `passings_business_totals.csv`, and `passings_bulk_retail_map.csv`. Each table is registered manually (see the `raw_sheets.*` DDLs) and contains the minimal columns necessary for the bulk/retail split (`entity_key`, `passings_count` for totals; `bulk_retail` for the map).
2. **View definition:** `curated_core.v_passings_bulk_retail_split` unions pipeline/business totals, joins to the mapping on `entity_key`, and reports counts + context percentages—everything is enforced via INNER JOIN so missing mappings drop the job early (sanity query ensures zero unmapped rows).
3. **Answering the question:** The final select runs directly from that view, producing business and pipeline split rows with counts & pct, which should be logged in the run-specific audit folder after each update before pushing into Notion/Notebooks.

## Hands-off orchestration
- For 100% automated nightly runs use the Step Functions workflow in `orchestration/`; it kicks off the scheduled crawlers, waits for them, runs Athena CTAS/validation, and writes `run_summary.json` + `validation_results.json` under `s3://gwi-raw-us-east-2-pc/curated/_runs/dt=.../`.
- If you need on-demand re-runs, call `curation/lake_curate.sh --dt YYYY-MM-DD` manually using the same curated SQL assets to keep records consistent with the automated path.
