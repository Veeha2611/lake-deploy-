#!/usr/bin/env bash
set -euo pipefail

export AWS_REGION=${AWS_REGION:-us-east-2}
export AWS_DEFAULT_REGION="$AWS_REGION"
export AWS_PAGER=""

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Apply SSOT rollup DDL
python3 - <<'PY'
import boto3, time, pathlib

region = "us-east-2"
ath = boto3.client("athena", region_name=region)

ddl_path = pathlib.Path("sql/ssot/00_ssot_daily_summary.sql")
sql = ddl_path.read_text()

qid = ath.start_query_execution(
    QueryString=sql,
    QueryExecutionContext={"Database": "curated_recon"},
    WorkGroup="primary",
)["QueryExecutionId"]

while True:
    st = ath.get_query_execution(QueryExecutionId=qid)["QueryExecution"]["Status"]["State"]
    if st in {"SUCCEEDED", "FAILED", "CANCELLED"}:
        break
    time.sleep(1)

if st != "SUCCEEDED":
    raise SystemExit(f"DDL failed: {qid} {st}")
print(f"SSOT DDL applied. QID={qid}")
PY

echo "Deploy complete (DDL + code landing)."
