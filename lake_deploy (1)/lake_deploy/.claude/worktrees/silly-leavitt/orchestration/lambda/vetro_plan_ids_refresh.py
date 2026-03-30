import csv
import io
import json
import os
from datetime import datetime, timezone
from typing import List, Tuple

import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")

SOURCE_BUCKET = os.getenv("SOURCE_BUCKET", "gwi-raw-us-east-2-pc")
SOURCE_PREFIX = os.getenv("SOURCE_PREFIX", "raw/sheets/vetro_as_built_plan_ids/")
OUTPUT_BUCKET = os.getenv("OUTPUT_BUCKET", "gwi-raw-us-east-2-pc")
OUTPUT_KEY = os.getenv("OUTPUT_KEY", "orchestration/vetro_daily/plan_ids.json")
OUTPUT_MANIFEST_KEY = os.getenv(
    "OUTPUT_MANIFEST_KEY", "orchestration/vetro_daily/plan_ids_manifest.json"
)
PLAN_ID_COLUMN = os.getenv("PLAN_ID_COLUMN")  # optional explicit column name


def _list_latest_object(bucket: str, prefix: str) -> Tuple[str, datetime]:
    paginator = s3.get_paginator("list_objects_v2")
    latest_key = None
    latest_ts = None
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj.get("Key")
            ts = obj.get("LastModified")
            if not key or not ts:
                continue
            if latest_ts is None or ts > latest_ts:
                latest_ts = ts
                latest_key = key
    if not latest_key or not latest_ts:
        raise RuntimeError("no_source_objects_found")
    return latest_key, latest_ts


def _detect_plan_id_column(headers: List[str]) -> str:
    if PLAN_ID_COLUMN and PLAN_ID_COLUMN in headers:
        return PLAN_ID_COLUMN
    lowered = [h.lower() for h in headers]
    for h in headers:
        if h.lower() == "plan_id":
            return h
    for h in headers:
        h_low = h.lower()
        if "plan" in h_low and "id" in h_low:
            return h
    if len(headers) == 1:
        return headers[0]
    raise RuntimeError("plan_id_column_not_found")


def _extract_plan_ids(raw: str) -> List[str]:
    reader = csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames:
        raise RuntimeError("csv_missing_header")
    column = _detect_plan_id_column(reader.fieldnames)
    plan_ids: List[str] = []
    for row in reader:
        if not row:
            continue
        value = row.get(column)
        if value is None:
            continue
        value = str(value).strip()
        if value:
            plan_ids.append(value)
    # Deduplicate preserving order
    seen = set()
    deduped = []
    for pid in plan_ids:
        if pid in seen:
            continue
        seen.add(pid)
        deduped.append(pid)
    return deduped


def lambda_handler(event, context):
    latest_key, latest_ts = _list_latest_object(SOURCE_BUCKET, SOURCE_PREFIX)
    try:
        obj = s3.get_object(Bucket=SOURCE_BUCKET, Key=latest_key)
        raw = obj["Body"].read().decode("utf-8")
    except ClientError as exc:
        raise RuntimeError(f"failed_to_read_source:{exc}") from exc

    plan_ids = _extract_plan_ids(raw)
    if not plan_ids:
        raise RuntimeError("no_plan_ids_found")

    payload = json.dumps(plan_ids, indent=2).encode("utf-8")
    s3.put_object(
        Bucket=OUTPUT_BUCKET,
        Key=OUTPUT_KEY,
        Body=payload,
        ContentType="application/json",
    )

    manifest = {
        "source_bucket": SOURCE_BUCKET,
        "source_key": latest_key,
        "source_last_modified": latest_ts.isoformat(),
        "plan_id_count": len(plan_ids),
        "output_bucket": OUTPUT_BUCKET,
        "output_key": OUTPUT_KEY,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    s3.put_object(
        Bucket=OUTPUT_BUCKET,
        Key=OUTPUT_MANIFEST_KEY,
        Body=json.dumps(manifest, indent=2).encode("utf-8"),
        ContentType="application/json",
    )

    return {
        "status": "ok",
        "plan_id_count": len(plan_ids),
        "output_key": OUTPUT_KEY,
        "manifest_key": OUTPUT_MANIFEST_KEY,
    }
