import json
import os
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import boto3
from botocore.exceptions import ClientError

REGION = os.environ.get("AWS_REGION", "us-east-2")
WORKGROUP = os.environ.get("ATHENA_WORKGROUP", "primary")
BUCKET = os.environ.get("SSOT_BUCKET", "gwi-raw-us-east-2-pc")
RAW_PREFIX_ROOT = os.environ.get("SSOT_RAW_PREFIX_ROOT", "orchestration")
DEFAULT_RUN_DATE = datetime.now(timezone.utc).date().isoformat()

athena = boto3.client("athena", region_name=REGION)
glue = boto3.client("glue", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)


class AthenaRunner:
    def __init__(self, workgroup: str = WORKGROUP) -> None:
        self.workgroup = workgroup
        self.qids: Dict[str, str] = {}

    def run(self, *, name: str, sql: str, database: str) -> Tuple[str, str]:
        resp = athena.start_query_execution(
            QueryString=sql,
            QueryExecutionContext={"Database": database},
            WorkGroup=self.workgroup,
        )
        qid = resp["QueryExecutionId"]
        self.qids[name] = qid
        state = self._wait(qid)
        return qid, state

    def run_value(self, *, name: str, sql: str, database: str) -> Tuple[str, str, Optional[str]]:
        qid, state = self.run(name=name, sql=sql, database=database)
        if state != "SUCCEEDED":
            return qid, state, None
        rows = athena.get_query_results(QueryExecutionId=qid)["ResultSet"]["Rows"]
        if len(rows) < 2 or not rows[1]["Data"]:
            return qid, state, None
        return qid, state, rows[1]["Data"][0].get("VarCharValue")

    @staticmethod
    def _wait(qid: str) -> str:
        while True:
            state = athena.get_query_execution(QueryExecutionId=qid)["QueryExecution"]["Status"]["State"]
            if state in {"SUCCEEDED", "FAILED", "CANCELLED"}:
                return state
            time.sleep(1)


def glue_table_exists(database: str, table: str) -> bool:
    try:
        glue.get_table(DatabaseName=database, Name=table)
        return True
    except glue.exceptions.EntityNotFoundException:
        return False


def get_columns(database: str, table: str, runner: AthenaRunner) -> List[str]:
    sql = (
        "SELECT column_name FROM information_schema.columns "
        f"WHERE table_schema = '{database}' AND table_name = '{table}' ORDER BY ordinal_position"
    )
    qid, state = runner.run(name=f"cols_{database}_{table}", sql=sql, database="default")
    if state != "SUCCEEDED":
        return []
    rows = athena.get_query_results(QueryExecutionId=qid)["ResultSet"]["Rows"][1:]
    return [r["Data"][0].get("VarCharValue", "") for r in rows]


def first_present(columns: Sequence[str], candidates: Sequence[str]) -> Optional[str]:
    colset = set(columns)
    for c in candidates:
        if c in colset:
            return c
    return None


def date_cast_expr(column: str) -> str:
    # Accept both MM/DD/YYYY and YYYY-MM-DD; fall back to NULL.
    return (
        "CAST(COALESCE("
        f"TRY(CAST(date_parse({column}, '%m/%d/%Y') AS date)),"
        f"TRY(CAST(date_parse({column}, '%Y-%m-%d') AS date))"
        ") AS date)"
    )


@dataclass
class EntityPolicy:
    system: str
    entity: str
    raw_db: str
    raw_table: str
    key_candidates: Sequence[str]
    business_date_candidates: Sequence[str] = field(default_factory=tuple)
    updated_at_candidates: Sequence[str] = field(default_factory=tuple)
    required_columns: Sequence[str] = field(default_factory=tuple)
    allow_future_days: int = 1

    @property
    def curated_raw(self) -> str:
        return f"{self.system}_{self.entity}_curated_raw"

    @property
    def current(self) -> str:
        return f"{self.system}_{self.entity}_current"

    @property
    def exceptions(self) -> str:
        return f"{self.system}_{self.entity}_exceptions"


def entity_policies() -> List[EntityPolicy]:
    sf_common_updated = ("systemmodstamp", "lastmodifieddate", "createddate")
    return [
        EntityPolicy(
            system="intacct",
            entity="gl_entries",
            raw_db="gwi_raw_intacct",
            raw_table="gl_entries",
            key_candidates=("recordno",),
            business_date_candidates=("entry_date", "batch_date"),
            updated_at_candidates=("entry_date", "batch_date"),
            required_columns=("recordno", "entry_date"),
        ),
        EntityPolicy(
            system="salesforce",
            entity="account",
            raw_db="raw_salesforce_prod",
            raw_table="account",
            key_candidates=("id",),
            business_date_candidates=("createddate",),
            updated_at_candidates=sf_common_updated,
            required_columns=("id",),
        ),
        EntityPolicy(
            system="salesforce",
            entity="contact",
            raw_db="raw_salesforce_prod",
            raw_table="contact",
            key_candidates=("id",),
            business_date_candidates=("createddate",),
            updated_at_candidates=sf_common_updated,
            required_columns=("id",),
        ),
        EntityPolicy(
            system="salesforce",
            entity="opportunity",
            raw_db="raw_salesforce_prod",
            raw_table="opportunity",
            key_candidates=("id",),
            business_date_candidates=("closedate", "createddate"),
            updated_at_candidates=sf_common_updated,
            required_columns=("id",),
        ),
        EntityPolicy(
            system="salesforce",
            entity="contract",
            raw_db="raw_salesforce_prod",
            raw_table="contract",
            key_candidates=("id", "contractnumber"),
            business_date_candidates=("startdate", "activateddate", "createddate"),
            updated_at_candidates=sf_common_updated,
            required_columns=("id",),
        ),
        EntityPolicy(
            system="platt",
            entity="customer",
            raw_db="raw_platt",
            raw_table="customer",
            key_candidates=("id", "customer_id", "name"),
            business_date_candidates=("date", "timestamp"),
            updated_at_candidates=("timestamp", "date"),
            required_columns=("id",),
        ),
        EntityPolicy(
            system="platt",
            entity="billing",
            raw_db="raw_platt",
            raw_table="billing",
            key_candidates=("bill_id", "billing_id", "id", "recordno"),
            business_date_candidates=("bill_date", "date", "entry_date"),
            updated_at_candidates=("timestamp", "bill_date", "date"),
        ),
        EntityPolicy(
            system="gaiia",
            entity="customers",
            raw_db="raw_gaiia",
            raw_table="customers",
            key_candidates=("id", "customer_id"),
            business_date_candidates=("created_at", "createdat"),
            updated_at_candidates=("updated_at", "updatedat", "created_at", "createdat"),
        ),
        EntityPolicy(
            system="gaiia",
            entity="invoices",
            raw_db="raw_gaiia",
            raw_table="invoices",
            key_candidates=("id", "invoice_id"),
            business_date_candidates=("invoice_date", "date", "created_at", "createdat"),
            updated_at_candidates=("updated_at", "updatedat", "created_at", "createdat"),
        ),
        EntityPolicy(
            system="vetro",
            entity="raw_files",
            raw_db="raw_vetro",
            raw_table="raw_vetro_files",
            key_candidates=("plan_id", "id"),
            business_date_candidates=("dt",),
            updated_at_candidates=("dt",),
        ),
    ]


def ensure_databases(runner: AthenaRunner) -> Dict[str, str]:
    qids: Dict[str, str] = {}
    for db in ("curated_core", "curated_recon", "curated_ssot"):
        qid, state = runner.run(name=f"create_db_{db}", sql=f"CREATE DATABASE IF NOT EXISTS {db}", database="default")
        if state != "SUCCEEDED":
            raise RuntimeError(f"Failed to create database {db}")
        qids[db] = qid
    return qids


def build_curated_raw_sql(policy: EntityPolicy, columns: Sequence[str]) -> Tuple[str, Dict[str, Optional[str]]]:
    key_col = first_present(columns, policy.key_candidates)
    business_col = first_present(columns, policy.business_date_candidates)
    updated_col = first_present(columns, policy.updated_at_candidates)

    if not key_col:
        raise ValueError(f"No key column found for {policy.system}.{policy.entity}")

    dt_expr = "dt" if "dt" in columns else "CAST(current_date AS varchar)"

    business_expr = date_cast_expr(business_col) if business_col else "CAST(dt AS date)"

    updated_expr = date_cast_expr(updated_col) if updated_col else business_expr

    select_cols = ",\n  ".join(columns)

    sql = f"""
CREATE OR REPLACE VIEW curated_core.{policy.curated_raw} AS
SELECT
  {select_cols},
  CAST({dt_expr} AS varchar) AS run_date,
  CAST({business_expr} AS date) AS business_date,
  CAST({updated_expr} AS date) AS updated_at
FROM {policy.raw_db}.{policy.raw_table}
""".strip()

    return sql, {"key": key_col, "business": business_col, "updated": updated_col}


def build_ranked_cte(policy: EntityPolicy, key_col: str) -> str:
    # Prefer updated_at, then run_date as ingested ordering.
    return (
        "WITH ranked AS (\n"
        "  SELECT\n"
        "    *,\n"
        f"    row_number() OVER (PARTITION BY {key_col} ORDER BY updated_at DESC NULLS LAST, run_date DESC) AS _rn\n"
        f"  FROM curated_core.{policy.curated_raw}\n"
        ")\n"
    )


def build_exceptions_sql(policy: EntityPolicy, key_col: str) -> str:
    cte = build_ranked_cte(policy, key_col)
    allow_days = policy.allow_future_days
    return (
        f"CREATE OR REPLACE VIEW curated_recon.{policy.exceptions} AS\n"
        f"{cte}"
        "SELECT\n"
        "  run_date,\n"
        f"  {key_col} AS entity_key,\n"
        "  business_date,\n"
        "  updated_at,\n"
        "  _rn,\n"
        "  CASE\n"
        f"    WHEN {key_col} IS NULL THEN 'missing_key'\n"
        f"    WHEN business_date > date_add('day', {allow_days}, CAST(run_date AS date)) THEN 'future_dated'\n"
        "    WHEN _rn > 1 THEN 'dedupe_excluded'\n"
        "    ELSE 'other'\n"
        "  END AS reason_code\n"
        "FROM ranked\n"
        f"WHERE {key_col} IS NULL\n"
        f"   OR business_date > date_add('day', {allow_days}, CAST(run_date AS date))\n"
        "   OR _rn > 1"
    )


def build_current_sql(policy: EntityPolicy, key_col: str) -> str:
    cte = build_ranked_cte(policy, key_col)
    allow_days = policy.allow_future_days
    return (
        f"CREATE OR REPLACE VIEW curated_core.{policy.current} AS\n"
        f"{cte}"
        "SELECT *\n"
        "FROM ranked\n"
        "WHERE _rn = 1\n"
        f"  AND {key_col} IS NOT NULL\n"
        f"  AND business_date <= date_add('day', {allow_days}, CAST(run_date AS date))"
    )


def collect_proofs(policy: EntityPolicy, run_date: str, runner: AthenaRunner) -> Dict[str, Dict[str, Optional[str]]]:
    proofs: Dict[str, Dict[str, Optional[str]]] = {}
    ssot_count_sql = f"SELECT COUNT(*) FROM curated_core.{policy.current} WHERE run_date = '{run_date}'"
    proofs["ssot_count"] = _proof(runner, f"proof_{policy.system}_{policy.entity}_ssot_count", ssot_count_sql, "curated_core")

    ssot_max_sql = (
        f"SELECT CAST(MAX(business_date) AS varchar) FROM curated_core.{policy.current} "
        f"WHERE run_date = '{run_date}'"
    )
    proofs["ssot_max_business_date"] = _proof(
        runner, f"proof_{policy.system}_{policy.entity}_ssot_max_business_date", ssot_max_sql, "curated_core"
    )

    exc_count_sql = f"SELECT COUNT(*) FROM curated_recon.{policy.exceptions} WHERE run_date = '{run_date}'"
    proofs["exception_count"] = _proof(
        runner, f"proof_{policy.system}_{policy.entity}_exception_count", exc_count_sql, "curated_recon"
    )

    exc_max_sql = (
        f"SELECT CAST(MAX(business_date) AS varchar) FROM curated_recon.{policy.exceptions} "
        f"WHERE run_date = '{run_date}' AND reason_code = 'future_dated'"
    )
    proofs["exception_max_future_date"] = _proof(
        runner, f"proof_{policy.system}_{policy.entity}_exception_max_future_date", exc_max_sql, "curated_recon"
    )

    return proofs


def _proof(runner: AthenaRunner, name: str, sql: str, database: str) -> Dict[str, Optional[str]]:
    qid, state, value = runner.run_value(name=name, sql=sql, database=database)
    return {"qid": qid, "state": state, "value": value}


def guard_from_proofs(run_date: str, proofs: Dict[str, Dict[str, Optional[str]]], allow_days: int) -> Dict[str, Optional[object]]:
    ssot_count = int(proofs["ssot_count"]["value"] or 0)
    max_business_date_raw = proofs["ssot_max_business_date"]["value"]
    max_business_date: Optional[date] = None
    if max_business_date_raw:
        try:
            max_business_date = datetime.strptime(max_business_date_raw, "%Y-%m-%d").date()
        except ValueError:
            max_business_date = None

    run_dt = datetime.strptime(run_date, "%Y-%m-%d").date()
    allowed_max = run_dt + timedelta(days=allow_days)
    max_ok: Optional[bool]
    if max_business_date is None:
        max_ok = None
    else:
        max_ok = max_business_date <= allowed_max

    guard_ok = ssot_count > 0 and (max_ok is True or max_ok is None)

    return {
        "ssot_has_data": ssot_count > 0,
        "max_business_date": max_business_date_raw,
        "max_business_date_within_policy": max_ok,
        "freshness_guard_ok": guard_ok,
        "exception_count": int(proofs["exception_count"]["value"] or 0),
        "max_future_date": proofs["exception_max_future_date"]["value"],
    }


def ensure_rollup_table(runner: AthenaRunner) -> str:
    location = f"s3://{BUCKET}/curated_recon/ssot_daily_summary/"
    sql = f"""
CREATE EXTERNAL TABLE IF NOT EXISTS curated_recon.ssot_daily_summary (
  run_date string,
  system string,
  entity string,
  ssot_count bigint,
  exception_count bigint,
  guard_ok boolean,
  max_business_date string,
  max_future_date string,
  ssot_count_qid string,
  ssot_max_business_date_qid string,
  exception_count_qid string,
  exception_max_future_date_qid string,
  run_id string
)
STORED AS PARQUET
LOCATION '{location}'
""".strip()
    qid, state = runner.run(name="create_ssot_daily_summary", sql=sql, database="curated_recon")
    if state != "SUCCEEDED":
        raise RuntimeError("Failed to create curated_recon.ssot_daily_summary")
    return qid


def insert_rollup_rows(run_date: str, rows: List[Dict[str, object]], runner: AthenaRunner) -> str:
    if not rows:
        raise ValueError("No SSOT rows to insert")
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    row_keys = (
        "run_date",
        "system",
        "entity",
        "ssot_count",
        "exception_count",
        "guard_ok",
        "max_business_date",
        "max_future_date",
        "ssot_count_qid",
        "ssot_max_business_date_qid",
        "exception_count_qid",
        "exception_max_future_date_qid",
        "run_id",
    )
    values: List[str] = []
    for r in rows:
        with_run_id = dict(r)
        with_run_id["run_id"] = run_id
        values.append("(" + ", ".join(_lit(with_run_id[k]) for k in row_keys) + ")")
    values_sql = ",\n".join(values)
    sql = "INSERT INTO curated_recon.ssot_daily_summary VALUES\n" + values_sql
    qid, state = runner.run(name="insert_ssot_daily_summary", sql=sql, database="curated_recon")
    if state != "SUCCEEDED":
        raise RuntimeError("Failed to insert curated_recon.ssot_daily_summary")
    return qid


def _lit(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def write_manifest(system: str, run_date: str, manifest: Dict[str, object]) -> str:
    key = f"{RAW_PREFIX_ROOT}/{system}_daily/run_date={run_date}/manifest.json"
    body = json.dumps(manifest, indent=2).encode("utf-8")
    s3.put_object(Bucket=BUCKET, Key=key, Body=body, ContentType="application/json")
    return f"s3://{BUCKET}/{key}"


def group_by_system(policies: Iterable[EntityPolicy]) -> Dict[str, List[EntityPolicy]]:
    grouped: Dict[str, List[EntityPolicy]] = {}
    for p in policies:
        grouped.setdefault(p.system, []).append(p)
    return grouped


def latest_dt_for(policy: EntityPolicy, runner: AthenaRunner) -> str:
    cols = get_columns(policy.raw_db, policy.raw_table, runner)
    if "dt" not in cols:
        return DEFAULT_RUN_DATE
    sql = f"SELECT CAST(MAX(dt) AS varchar) FROM {policy.raw_db}.{policy.raw_table}"
    qid, state, val = runner.run_value(name=f"latest_dt_{policy.system}_{policy.entity}", sql=sql, database=policy.raw_db)
    if state != "SUCCEEDED" or not val:
        return DEFAULT_RUN_DATE
    return val


def required_columns_missing(columns: Sequence[str], required: Sequence[str]) -> List[str]:
    colset = set(columns)
    return [c for c in required if c not in colset]


def process_entity(policy: EntityPolicy, runner: AthenaRunner) -> Dict[str, object]:
    if not glue_table_exists(policy.raw_db, policy.raw_table):
        return {"status": "pending", "reason": "raw_table_missing"}

    columns = get_columns(policy.raw_db, policy.raw_table, runner)
    missing_required = required_columns_missing(columns, policy.required_columns)
    if missing_required:
        return {"status": "pending", "reason": f"missing_required:{','.join(missing_required)}"}

    run_date = latest_dt_for(policy, runner)

    curated_raw_sql, detected = build_curated_raw_sql(policy, columns)
    curated_raw_qid, curated_raw_state = runner.run(
        name=f"curated_raw_{policy.system}_{policy.entity}", sql=curated_raw_sql, database="curated_core"
    )
    if curated_raw_state != "SUCCEEDED":
        return {"status": "error", "reason": "curated_raw_failed", "qid": curated_raw_qid}

    key_col = detected["key"]
    assert key_col is not None

    exceptions_sql = build_exceptions_sql(policy, key_col)
    exceptions_qid, exceptions_state = runner.run(
        name=f"exceptions_{policy.system}_{policy.entity}", sql=exceptions_sql, database="curated_recon"
    )
    if exceptions_state != "SUCCEEDED":
        return {"status": "error", "reason": "exceptions_failed", "qid": exceptions_qid}

    current_sql = build_current_sql(policy, key_col)
    current_qid, current_state = runner.run(
        name=f"current_{policy.system}_{policy.entity}", sql=current_sql, database="curated_core"
    )
    if current_state != "SUCCEEDED":
        return {"status": "error", "reason": "current_failed", "qid": current_qid}

    proofs = collect_proofs(policy, run_date, runner)
    guard = guard_from_proofs(run_date, proofs, policy.allow_future_days)

    return {
        "status": "ssot_enforced",
        "run_date": run_date,
        "detected_columns": detected,
        "qids": {
            "curated_raw": curated_raw_qid,
            "exceptions": exceptions_qid,
            "current": current_qid,
        },
        "proofs": proofs,
        "guard": guard,
    }


def lambda_handler(event, context):  # pragma: no cover - used in Lambda but also runnable locally
    runner = AthenaRunner()
    started = datetime.now(timezone.utc)

    ensure_databases(runner)
    rollup_create_qid = ensure_rollup_table(runner)

    systems = group_by_system(entity_policies())
    manifests: Dict[str, Dict[str, object]] = {}
    rollup_rows: List[Dict[str, object]] = []

    for system, policies in systems.items():
        system_manifest: Dict[str, object] = {
            "system": system,
            "started_at": started.isoformat(),
            "entities": {},
            "errors": [],
            "rollup_create_qid": rollup_create_qid,
        }
        for policy in policies:
            try:
                result = process_entity(policy, runner)
            except Exception as exc:  # keep other entities moving
                result = {"status": "error", "reason": f"{type(exc).__name__}:{exc}"}
                system_manifest["errors"].append(f"{policy.entity}:{type(exc).__name__}")
            system_manifest["entities"][policy.entity] = result

            if result.get("status") == "ssot_enforced":
                run_date = str(result["run_date"])
                proofs = result["proofs"]
                guard = result["guard"]
                rollup_rows.append(
                    {
                        "run_date": run_date,
                        "system": system,
                        "entity": policy.entity,
                        "ssot_count": int(proofs["ssot_count"]["value"] or 0),
                        "exception_count": int(proofs["exception_count"]["value"] or 0),
                        "guard_ok": bool(guard["freshness_guard_ok"]),
                        "max_business_date": guard["max_business_date"],
                        "max_future_date": guard["max_future_date"],
                        "ssot_count_qid": proofs["ssot_count"]["qid"],
                        "ssot_max_business_date_qid": proofs["ssot_max_business_date"]["qid"],
                        "exception_count_qid": proofs["exception_count"]["qid"],
                        "exception_max_future_date_qid": proofs["exception_max_future_date"]["qid"],
                        "run_id": None,
                    }
                )

        # write per-system manifest using the max run_date we saw for that system (or today)
        run_dates = [
            str(v.get("run_date"))
            for v in system_manifest["entities"].values()
            if isinstance(v, dict) and v.get("run_date")
        ]
        manifest_run_date = max(run_dates) if run_dates else DEFAULT_RUN_DATE
        system_manifest["run_date"] = manifest_run_date
        system_manifest["finished_at"] = datetime.now(timezone.utc).isoformat()
        system_manifest["qids"] = runner.qids
        manifest_path = write_manifest(system, manifest_run_date, system_manifest)
        system_manifest["manifest_path"] = manifest_path
        manifests[system] = system_manifest

    rollup_insert_qid = insert_rollup_rows(DEFAULT_RUN_DATE, rollup_rows, runner)

    today_summary_sql = (
        "SELECT system, entity, run_date, ssot_count, exception_count, guard_ok, max_business_date, max_future_date "
        "FROM curated_recon.ssot_daily_summary "
        f"WHERE run_date = '{DEFAULT_RUN_DATE}' ORDER BY system, entity"
    )
    summary_qid, summary_state = runner.run(name="proof_ssot_daily_summary", sql=today_summary_sql, database="curated_recon")

    return {
        "status": "ok",
        "run_date": DEFAULT_RUN_DATE,
        "rollup_insert_qid": rollup_insert_qid,
        "summary_qid": summary_qid,
        "summary_state": summary_state,
        "manifests": {k: v["manifest_path"] for k, v in manifests.items()},
        "qids": runner.qids,
    }


if __name__ == "__main__":
    result = lambda_handler({}, {})
    print(json.dumps(result, indent=2))
