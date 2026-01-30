import json
import os
from datetime import datetime, timezone
from urllib.parse import urljoin

import boto3
import requests

s3 = boto3.client("s3")
secrets = boto3.client("secretsmanager")

S3_BUCKET = os.environ.get("S3_BUCKET", "gwi-raw-us-east-2-pc")
S3_PREFIX = os.environ.get("S3_PREFIX", "raw/gaiia")
SECRET_NAME = os.environ.get("GAIIA_SECRET_NAME", "gaiia/api_keys")
BASE_URL_OVERRIDE = os.environ.get("GAIIA_BASE_URL", "")
ENDPOINTS = [e.strip() for e in os.environ.get("GAIIA_ENDPOINTS", "").split(",") if e.strip()]
AUTH_HEADER = os.environ.get("GAIIA_AUTH_HEADER", "Authorization")
AUTH_PREFIX = os.environ.get("GAIIA_AUTH_PREFIX", "Bearer ")
REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "30"))


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today_dt():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def load_secret():
    resp = secrets.get_secret_value(SecretId=SECRET_NAME)
    raw = resp.get("SecretString")
    if not raw:
        raw = resp.get("SecretBinary", b"").decode("utf-8")
    data = json.loads(raw)
    return data


def slug(s: str) -> str:
    return s.strip("/").replace("/", "_") or "root"


def fetch_endpoint(base_url, endpoint, token):
    url = urljoin(base_url.rstrip("/") + "/", endpoint.lstrip("/"))
    headers = {"Accept": "application/json"}
    if token:
        headers[AUTH_HEADER] = f"{AUTH_PREFIX}{token}"
    r = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    return r


def lambda_handler(event, context):
    if not ENDPOINTS:
        return {"status": "error", "error": "GAIIA_ENDPOINTS empty"}

    secret = load_secret()
    base_url = (BASE_URL_OVERRIDE or secret.get("base_url") or "").rstrip("/")
    if not base_url:
        return {"status": "error", "error": "missing base_url"}

    tenants = {
        "lymefiber": secret.get("lymefiber_key"),
        "dvfiber": secret.get("dvfiber_key"),
        "gwi": secret.get("gwi_key"),
    }

    dt = today_dt()
    results = []

    for tenant, token in tenants.items():
        if not token:
            results.append({"tenant": tenant, "status": "skipped", "reason": "missing token"})
            continue
        for ep in ENDPOINTS:
            try:
                resp = fetch_endpoint(base_url, ep, token)
                key = f"{S3_PREFIX}/tenant={tenant}/endpoint={slug(ep)}/dt={dt}/response.json"
                s3.put_object(
                    Bucket=S3_BUCKET,
                    Key=key,
                    Body=resp.text.encode("utf-8"),
                    ContentType="application/json",
                )
                results.append({"tenant": tenant, "endpoint": ep, "status_code": resp.status_code, "s3_key": key})
            except Exception as e:
                results.append({"tenant": tenant, "endpoint": ep, "status": "error", "error": str(e)})

    meta_key = f"{S3_PREFIX}/_meta/dt={dt}/run.json"
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=meta_key,
        Body=json.dumps({"ts": utc_now(), "results": results}).encode("utf-8"),
        ContentType="application/json",
    )

    return {"status": "ok", "results": results}
