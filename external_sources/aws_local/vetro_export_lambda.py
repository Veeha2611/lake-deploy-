import json
import os
import tempfile
import zipfile
import logging
from datetime import datetime, timezone
from typing import Iterable

import boto3
from botocore.exceptions import ClientError
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

secrets = boto3.client("secretsmanager")
s3 = boto3.client("s3")


def get_secret(secret_arn: str) -> str:
    resp = secrets.get_secret_value(SecretId=secret_arn)
    value = resp.get("SecretString") or resp["SecretBinary"].decode("utf-8")
    return value.strip()


def read_state(bucket: str, key: str) -> dict:
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        return json.loads(obj["Body"].read())
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchKey":
            return {"index": 0}
        raise


def write_state(bucket: str, key: str, state: dict) -> None:
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(state, indent=2).encode("utf-8"),
    )


def read_plan_ids_from_s3(bucket: str, key: str) -> list:
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        data = json.loads(obj["Body"].read())
        if isinstance(data, dict):
            ids = data.get("plan_ids") or data.get("plans")
        else:
            ids = data
        if not isinstance(ids, list):
            return []
        return [str(p).strip() for p in ids if str(p).strip()]
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchKey":
            return []
        raise


def iter_features_from_json(data) -> Iterable[dict]:
    if isinstance(data, dict):
        if isinstance(data.get("features"), list):
            for f in data["features"]:
                if isinstance(f, dict):
                    yield f
            return
        if isinstance(data.get("data"), list):
            for f in data["data"]:
                if isinstance(f, dict):
                    yield f
            return
    if isinstance(data, list):
        for f in data:
            if isinstance(f, dict):
                yield f


def iter_features_from_file(path: str) -> Iterable[dict]:
    lower = path.lower()
    if lower.endswith(".ndjson"):
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(obj, dict):
                    yield obj
        return

    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            data = json.load(f)
        yielded = False
        for f in iter_features_from_json(data):
            yielded = True
            yield f
        if not yielded and isinstance(data, dict) and data.get("type") == "FeatureCollection":
            for f in data.get("features") or []:
                if isinstance(f, dict):
                    yield f
    except Exception:
        return


def write_features_outputs(tmp_dir: str, export_bucket: str, plan_id: str, dt: str, extract_dir: str) -> dict:
    candidates = []
    for root, _, files in os.walk(extract_dir):
        for name in files:
            lname = name.lower()
            if "feature" not in lname:
                continue
            if not (lname.endswith(".json") or lname.endswith(".geojson") or lname.endswith(".ndjson")):
                continue
            path = os.path.join(root, name)
            try:
                size = os.path.getsize(path)
            except OSError:
                size = 0
            candidates.append((size, path))

    if not candidates:
        return {"feature_count": 0, "bytes_written": 0, "inventory": None}

    candidates.sort(reverse=True)
    out_path = os.path.join(tmp_dir, f"features_{plan_id}.ndjson")
    feature_count = 0
    inv_top = set()
    inv_props = set()
    inventory_limit = 200

    with open(out_path, "w", encoding="utf-8") as out:
        for _, path in candidates:
            found_any = False
            for feat in iter_features_from_file(path):
                found_any = True
                out.write(json.dumps(feat, separators=(",", ":")) + "\n")
                feature_count += 1
                if inventory_limit > 0:
                    inv_top.update(feat.keys())
                    props = feat.get("properties")
                    if isinstance(props, dict):
                        inv_props.update(props.keys())
                    inventory_limit -= 1
            if found_any:
                break

    if feature_count == 0:
        return {"feature_count": 0, "bytes_written": 0, "inventory": None}

    s3_key = f"raw/vetro_features/plan_id={plan_id}/dt={dt}/features.ndjson"
    s3.upload_file(out_path, export_bucket, s3_key)

    inv = {
        "plan_id": plan_id,
        "dt": dt,
        "top_level_keys": sorted(inv_top),
        "properties_keys": sorted(inv_props),
    }
    inv_key = f"raw/vetro_features/_meta/field_inventory/dt={dt}/plan_id={plan_id}.json"
    s3.put_object(Bucket=export_bucket, Key=inv_key, Body=json.dumps(inv).encode("utf-8"))

    bytes_written = os.path.getsize(out_path)
    return {"feature_count": feature_count, "bytes_written": bytes_written, "inventory": inv}


def lambda_handler(event, context):
    plan_ids = []
    plan_ids_bucket = os.environ.get("PLAN_IDS_S3_BUCKET")
    plan_ids_key = os.environ.get("PLAN_IDS_S3_KEY")
    if plan_ids_bucket and plan_ids_key:
        plan_ids = read_plan_ids_from_s3(plan_ids_bucket, plan_ids_key)
    if not plan_ids:
        plan_ids = [p.strip() for p in os.environ["PLAN_IDS"].split(",") if p.strip()]
    if not plan_ids:
        raise RuntimeError("No plan IDs available from S3 or PLAN_IDS env")
    REDACTED

    base_url = os.environ.get("VETRO_BASE_URL_V3", "https://api.vetro.io/v3").rstrip("/")
    export_bucket = os.environ["EXPORT_BUCKET"]
    export_prefix = os.environ["EXPORT_PREFIX"].rstrip("/")
    state_bucket = os.environ["STATE_BUCKET"]
    state_key = os.environ["STATE_KEY"]

    state = read_state(state_bucket, state_key)
    index = int(state.get("index", 0)) % len(plan_ids)
    plan_id = plan_ids[index]

    logger.info("Starting export for plan_id=%s index=%s", plan_id, index)

    headers = {"token": token}
    export_url = f"{base_url}/export/plan/{plan_id}"

    try:
        with urlopen(Request(export_url, headers=headers), timeout=60) as resp:
            payload = json.load(resp)
    except HTTPError as e:
        if e.code == 429:
            logger.warning("Rate limited (429) for plan %s", plan_id)
            state["last_error"] = "429"
            state["last_plan_id"] = plan_id
            write_state(state_bucket, state_key, state)
            return {"status": "rate_limited", "plan_id": plan_id}
        body = e.read().decode()
        logger.error("HTTP %s for plan %s: %s", e.code, plan_id, body)
        raise
    except URLError as e:
        logger.error("Network error calling Vetro: %s", e)
        raise

    download_url = payload.get("download_url")
    export_id = payload.get("export_id")
    if not download_url or not export_id:
        raise RuntimeError(f"Incomplete payload for plan {plan_id}: {payload}")

    dt = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    s3_prefix = f"{export_prefix}/plan_id={plan_id}/dt={dt}"

    with tempfile.TemporaryDirectory() as tmp:
        zip_path = os.path.join(tmp, f"plan_{plan_id}_{export_id}.zip")
        with urlopen(Request(download_url, headers=headers), timeout=300) as r:
            content = r.read()
        if not content.startswith(b"PK"):
            snippet = content[:200].decode("utf-8", errors="ignore")
            logger.error("Export download is not a ZIP for plan %s: %s", plan_id, snippet)
            raise RuntimeError(f"Export download not zip for plan {plan_id}")
        with open(zip_path, "wb") as f:
            f.write(content)

        extract_dir = os.path.join(tmp, "unzipped")
        os.makedirs(extract_dir, exist_ok=True)

        with zipfile.ZipFile(zip_path) as z:
            z.extractall(extract_dir)

        for root, _, files in os.walk(extract_dir):
            for name in files:
                local_path = os.path.join(root, name)
                rel = os.path.relpath(local_path, extract_dir)
                key = f"{s3_prefix}/{rel}"
                s3.upload_file(local_path, export_bucket, key)
                logger.info("Uploaded s3://%s/%s", export_bucket, key)

        feat_res = write_features_outputs(tmp, export_bucket, plan_id, dt, extract_dir)
        summary = {
            "plan_id": plan_id,
            "dt": dt,
            "feature_count": feat_res["feature_count"],
            "bytes_written": feat_res["bytes_written"],
        }
        summary_key = f"raw/vetro_features/plan_id={plan_id}/dt={dt}/summary.json"
        s3.put_object(Bucket=export_bucket, Key=summary_key, Body=json.dumps(summary).encode("utf-8"))

    next_index = (index + 1) % len(plan_ids)
    new_state = {
        "index": next_index,
        "last_plan_id": plan_id,
        "last_export_id": export_id,
        "last_success_dt": dt,
    }
    write_state(state_bucket, state_key, new_state)

    logger.info("Completed plan %s export_id=%s next_index=%s", plan_id, export_id, next_index)
    return {"status": "success", "plan_id": plan_id, "export_id": export_id}
