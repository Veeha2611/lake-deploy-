import json
import time
from typing import List, Dict

import boto3

CURATED_DATABASE = "curated"
ATHENA_OUTPUT = "s3://gwi-raw-us-east-2-pc/athena-results/orchestration/"
S3_BUCKET = "gwi-raw-us-east-2-pc"
RUN_ARTIFACT_PREFIX = "curated/_runs"

CTAS_QUERIES = [
    {
        "name": "curated_intacct_gl_entries",
        "query": """
CREATE TABLE IF NOT EXISTS curated.curated_intacct_gl_entries
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt']
)
AS
SELECT
  recordno,
  entry_date,
  batch_id,
  customer_id,
  location_id,
  amount,
  memo,
  description,
  CAST(dimensions['key'] AS STRING) AS dimension_key,
  '{run_date}' AS dt
FROM gwi_raw.raw_intacct_gl_entries
WHERE run_date = '{run_date}' AND location_id = '10';
""",
    },
    {
        "name": "curated_platt_customer",
        "query": """
CREATE TABLE IF NOT EXISTS curated.curated_platt_customer
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt']
)
AS
SELECT
  customer_id,
  customer_name,
  sales_rep,
  status,
  created_at,
  '{run_date}' AS dt
FROM gwi_raw.raw_platt_customer
WHERE dt = '{run_date}';
""",
    },
    {
        "name": "curated_salesforce_accounts",
        "query": """
CREATE TABLE IF NOT EXISTS curated.curated_salesforce_accounts
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt']
)
AS
SELECT
  sf_account_id AS account_id,
  name,
  industry,
  region,
  annual_revenue,
  created_date,
  '{run_date}' AS dt
FROM gwi_raw.raw_salesforce_accounts
WHERE dt = '{run_date}';
""",
    },
    {
        "name": "curated_salesforce_opportunities",
        "query": """
CREATE TABLE IF NOT EXISTS curated.curated_salesforce_opportunities
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt']
)
AS
SELECT
  sf_opportunity_id AS opportunity_id,
  account_id,
  stage,
  amount,
  close_date,
  probability,
  '{run_date}' AS dt
FROM gwi_raw.raw_salesforce_opportunities
WHERE dt = '{run_date}';
""",
    },
    {
        "name": "curated_vetro_exports",
        "query": """
CREATE TABLE IF NOT EXISTS curated.curated_vetro_exports
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY'
)
AS
SELECT
  plan_id,
  export_ts,
  status,
  data,
  '{run_date}' AS dt
FROM gwi_raw.raw_vetro_exports
LIMIT 1000;
""",
    },
    {
        "name": "curated_dim_customer",
        "query": """
CREATE TABLE IF NOT EXISTS curated.curated_dim_customer
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt']
)
AS
WITH combined AS (
  SELECT
    customer_id,
    customer_id AS canonical_id,
    customer_name,
    'platt' AS source,
    dt
  FROM curated.curated_platt_customer
  WHERE dt = '{run_date}'
  UNION ALL
  SELECT
    customer_id,
    customer_id AS canonical_id,
    memo AS customer_name,
    'intacct' AS source,
    dt
  FROM curated.curated_intacct_gl_entries
  WHERE dt = '{run_date}'
)
SELECT
  canonical_id AS customer_id,
  MAX(customer_name) AS customer_name,
  COUNT(DISTINCT source) AS source_count,
  CASE WHEN COUNT(DISTINCT source) > 1 THEN 'HIGH' ELSE 'LOW' END AS confidence_flag,
  '{run_date}' AS dt
FROM combined
GROUP BY canonical_id;
""",
    },
    {
        "name": "curated_fact_revenue",
        "query": """
CREATE TABLE IF NOT EXISTS curated.curated_fact_revenue
WITH (
  format = 'PARQUET',
  parquet_compression = 'SNAPPY',
  partitioned_by = ARRAY['dt']
)
AS
SELECT
  gl.recordno,
  gl.entry_date,
  gl.customer_id,
  gl.amount AS revenue_amount,
  pl.customer_name AS platt_customer,
  sf.stage AS sf_stage,
  sf.amount AS sf_pipeline_amount,
  '{run_date}' AS dt
FROM curated.curated_intacct_gl_entries gl
LEFT JOIN curated.curated_platt_customer pl
  ON gl.customer_id = pl.customer_id AND pl.dt = gl.dt
LEFT JOIN curated.curated_salesforce_opportunities sf
  ON pl.customer_id = sf.account_id AND sf.dt = gl.dt
WHERE gl.dt = '{run_date}';
""",
    },
]

VALIDATION_QUERIES = [
    {
        "name": "ctas_row_count",
        "query": "SELECT '{run_date}' AS dt, COUNT(*) AS rows FROM curated_intacct_gl_entries WHERE dt = '{run_date}'"
    },
    {
        "name": "dim_customer_count",
        "query": "SELECT '{run_date}' AS dt, COUNT(DISTINCT customer_id) AS customers FROM curated_dim_customer WHERE dt = '{run_date}'"
    },
    {
        "name": "null_customers",
        "query": "SELECT '{run_date}' AS dt, COUNT(*) AS null_customer_ids FROM curated_intacct_gl_entries WHERE dt = '{run_date}' AND customer_id IS NULL"
    },
    {
        "name": "fact_revenue_rows",
        "query": "SELECT '{run_date}' AS dt, COUNT(*) AS rows FROM curated_fact_revenue WHERE dt = '{run_date}'"
    },
]

athena = boto3.client("athena")
s3 = boto3.client("s3")


def run_query(query: str) -> Dict:
    response = athena.start_query_execution(
        QueryString=query,
        QueryExecutionContext={"Database": CURATED_DATABASE},
        ResultConfiguration={"OutputLocation": ATHENA_OUTPUT},
    )
    query_id = response["QueryExecutionId"]
    while True:
        status_resp = athena.get_query_execution(QueryExecutionId=query_id)
        state = status_resp["QueryExecution"]["Status"]["State"]
        if state in ("SUCCEEDED", "FAILED", "CANCELLED"):
            return {
                "id": query_id,
                "state": state,
                "query": query,
                "completion": status_resp["QueryExecution"]["Status"].get("CompletionDateTime")
            }
        time.sleep(5)


def handler(event, context):
    run_date = event.get("runDate") or event.get("run_date")
    if not run_date:
        raise ValueError("runDate is required")

    ctas_results: List[Dict] = []
    for entry in CTAS_QUERIES:
        query = entry["query"].format(run_date=run_date)
        result = run_query(query)
        if result["state"] != "SUCCEEDED":
            raise RuntimeError(f"CTAS {entry['name']} failed: {result['state']}")
        result["name"] = entry["name"]
        ctas_results.append(result)

    validation_results: List[Dict] = []
    for entry in VALIDATION_QUERIES:
        query = entry["query"].format(run_date=run_date)
        result = run_query(query)
        if result["state"] != "SUCCEEDED":
            raise RuntimeError(f"Validation {entry['name']} failed: {result['state']}")
        result["name"] = entry["name"]
        validation_results.append(result)

    summary = {
        "dt": run_date,
        "ctas": [{"name": r["name"], "queryExecutionId": r["id"], "state": r["state"]} for r in ctas_results],
        "validations": [{"name": r["name"], "queryExecutionId": r["id"], "state": r["state"]} for r in validation_results],
        "status": "SUCCESS",
    }

    validation_payload = {
        "dt": run_date,
        "results": validation_results,
        "status": "SUCCESS",
    }

    run_key = f"{RUN_ARTIFACT_PREFIX}/dt={run_date}/run_summary.json"
    validation_key = f"{RUN_ARTIFACT_PREFIX}/dt={run_date}/validation_results.json"

    s3.put_object(Bucket=S3_BUCKET, Key=run_key, Body=json.dumps(summary).encode("utf-8"))
    s3.put_object(Bucket=S3_BUCKET, Key=validation_key, Body=json.dumps(validation_payload).encode("utf-8"))

    return summary
