import os, sys, time, json
import boto3

REGION = os.getenv("AWS_REGION","us-east-2")
WG = os.getenv("ATHENA_WORKGROUP","primary")
OUT = os.getenv("ATHENA_OUTPUT","s3://gwi-raw-us-east-2-pc/athena-results/orchestration/")

sql = sys.stdin.read().strip()
if not sql:
    print("ERROR: no SQL on stdin", file=sys.stderr); sys.exit(2)

# enforce single statement
parts = [p.strip() for p in sql.strip().rstrip(";").split(";") if p.strip()]
if len(parts) != 1:
    print("ERROR: provide exactly one statement", file=sys.stderr); sys.exit(3)
sql = parts[0]

ath = boto3.client("athena", region_name=REGION)

qid = ath.start_query_execution(
    QueryString=sql,
    WorkGroup=WG,
    ResultConfiguration={"OutputLocation": OUT},
)["QueryExecutionId"]

print(qid)  # ONLY QID to stdout

while True:
    st = ath.get_query_execution(QueryExecutionId=qid)["QueryExecution"]["Status"]["State"]
    if st in ("SUCCEEDED","FAILED","CANCELLED"):
        print(f"STATUS={st}", file=sys.stderr)
        if st != "SUCCEEDED":
            reason = ath.get_query_execution(QueryExecutionId=qid)["QueryExecution"]["Status"].get("StateChangeReason","")
            print(f"REASON={reason}", file=sys.stderr)
            sys.exit(10)
        break
    time.sleep(1)

res = ath.get_query_results(QueryExecutionId=qid, MaxResults=50)
rows = res["ResultSet"]["Rows"]
cols = [c.get("VarCharValue","") for c in rows[0]["Data"]] if rows else []
data = []
for r in rows[1:]:
    data.append([d.get("VarCharValue","") for d in r["Data"]])
print(json.dumps({"qid": qid, "columns": cols, "preview_rows": data[:25]}, indent=2), file=sys.stderr)
