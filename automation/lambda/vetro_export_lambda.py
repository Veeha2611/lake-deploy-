import json
import os
import tempfile
import zipfile
import logging
from datetime import datetime, timezone

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


def lambda_handler(event, context):
    plan_ids = [p.strip() for p in os.environ["PLAN_IDS"].split(",") if p.strip()]
    token = get_secret(os.environ["VETRO_TOKEN_SECRET"])

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
        with urlopen(Request(download_url, headers=headers), timeout=300) as r, open(zip_path, "wb") as f:
            f.write(r.read())

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
