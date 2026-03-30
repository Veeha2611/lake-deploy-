#!/usr/bin/env bash
set -euo pipefail

export AWS_REGION=${AWS_REGION:-us-east-2}
export AWS_DEFAULT_REGION="$AWS_REGION"
export AWS_PAGER=""

TODAY=${TODAY:-$(date -u +%F)}
BUCKET=${BUCKET:-gwi-raw-us-east-2-pc}

check_manifest() {
  local system="$1"
  local key="orchestration/${system}_daily/run_date=${TODAY}/manifest.json"
  if aws s3api head-object --bucket "$BUCKET" --key "$key" >/dev/null 2>&1; then
    echo "manifest:${system}=true"
  else
    echo "manifest:${system}=false"
  fi
}

check_manifest intacct
check_manifest salesforce
check_manifest vetro

python3 - <<'PY'
import boto3, time, os

today = os.environ.get("TODAY")
region = os.environ.get("AWS_REGION", "us-east-2")
ath = boto3.client("athena", region_name=region)

def run(sql, db):
    qid = ath.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": db},
        WorkGroup="primary",
    )["QueryExecutionId"]
    while True:
        st = ath.get_query_execution(QueryExecutionId=qid)["QueryExecution"]["Status"]["State"]
        if st in ("SUCCEEDED", "FAILED", "CANCELLED"):
            break
        time.sleep(1)
    return qid, st

checks = [
    ("intacct_ssot_count", f"SELECT COUNT(*) FROM curated_core.intacct_gl_entries_current WHERE run_date='{today}'", "curated_core"),
    ("intacct_ssot_max_date", f"SELECT CAST(MAX(business_date) AS varchar) FROM curated_core.intacct_gl_entries_current WHERE run_date='{today}'", "curated_core"),
    ("ssot_rollup", f"SELECT COUNT(*) FROM curated_recon.ssot_daily_summary WHERE run_date='{today}'", "curated_recon"),
]

for name, sql, db in checks:
    qid, st = run(sql, db)
    print(f"athena:{name}:qid={qid}:state={st}")
PY
