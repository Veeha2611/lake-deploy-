import io
import json
import os
import zipfile
from datetime import datetime, timezone
from urllib.parse import urljoin, urlencode

import boto3
import botocore
import requests

BASE_URL = os.environ.get("VETRO_BASE_URL", "https://api.vetro.io/v3/")
S3_BUCKET = os.environ.get("S3_BUCKET", "gwi-raw-us-east-2-pc")
TOKEN_SECRET_NAME = os.environ.get("TOKEN_SECRET_NAME", "vetro/api_token")
REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "30"))

s3 = boto3.client("s3")
secrets = boto3.client("secretsmanager")


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today_dt():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def s3_put_json(key, payload):
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"),
        ContentType="application/json",
    )


def s3_get_json(key):
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
        return json.loads(obj["Body"].read().decode("utf-8"))
    except botocore.exceptions.ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return None
        raise


def get_token():
    resp = secrets.get_secret_value(SecretId=TOKEN_SECRET_NAME)
    secret = resp.get("SecretString")
    if secret:
        try:
            data = json.loads(secret)
            val = data.get("token") or data.get("api_token") or secret
            return "".join(val.split()) if isinstance(val, str) else val
        except json.JSONDecodeError:
            return "".join(secret.split())
    val = resp.get("SecretBinary")
    return "".join(val.split()) if isinstance(val, str) else val


def vetro_get(url, token, params=None):
    headers = {"token": token, "Accept": "application/json"}
    if params:
        url = f"{url}?{urlencode(params)}"
    r = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    return r


def list_plans(token):
    plans = []
    next_url = urljoin(BASE_URL, "plans")
    while next_url:
        r = vetro_get(next_url, token)
        if r.status_code == 429:
            return {"status": 429, "plans": plans, "next_url": next_url}
        r.raise_for_status()
        payload = r.json()
        items = payload.get("data") or payload.get("plans") or []
        plans.extend(items)
        next_url = payload.get("next")
        if next_url and not next_url.startswith("http"):
            next_url = urljoin(BASE_URL, next_url.lstrip("/"))
    return {"status": 200, "plans": plans, "next_url": None}


def discover_plan_ids(token):
    res = list_plans(token)
    if res["status"] == 429:
        return {"status": 429, "plan_ids": [], "error": "rate_limited"}
    plan_ids = []
    for p in res["plans"]:
        pid = p.get("id") or p.get("plan_id")
        if pid is not None:
            plan_ids.append(pid)
    return {"status": 200, "plan_ids": sorted(set(plan_ids))}


def get_plan_features(token, plan_id):
    url1 = urljoin(BASE_URL, f"plans/{plan_id}/features")
    r = vetro_get(url1, token)
    if r.status_code == 200:
        return r
    url2 = urljoin(BASE_URL, "features")
    r2 = vetro_get(url2, token, params={"plan_id": plan_id})
    return r2


def parse_features_payload(payload):
    if isinstance(payload, dict):
        if "features" in payload and isinstance(payload["features"], list):
            return payload["features"]
        if "data" in payload and isinstance(payload["data"], list):
            return payload["data"]
    if isinstance(payload, list):
        return payload
    return []


def parse_features_from_bytes(raw_bytes):
    try:
        payload = json.loads(raw_bytes.decode("utf-8"))
        feats = parse_features_payload(payload)
        if feats:
            return feats
        if isinstance(payload, dict) and payload.get("type") == "FeatureCollection":
            return payload.get("features", []) or []
    except Exception:
        pass

    features = []
    for line in raw_bytes.decode("utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            features.append(obj)
        except Exception:
            continue
    return features


def fetch_features_via_export(token, plan_id):
    export_url = urljoin(BASE_URL, f"export/plan/{plan_id}")
    r = vetro_get(export_url, token)
    if r.status_code == 429:
        return {"status": 429}
    r.raise_for_status()
    payload = r.json()
    download_url = payload.get("download_url")
    export_id = payload.get("export_id")
    if not download_url:
        raise RuntimeError(f"No download_url in export response for plan {plan_id}")

    zresp = requests.get(download_url, timeout=300)
    zresp.raise_for_status()
    zdata = zresp.content

    features = []
    with zipfile.ZipFile(io.BytesIO(zdata)) as zf:
        for name in zf.namelist():
            lname = name.lower()
            if "feature" not in lname:
                continue
            with zf.open(name) as f:
                raw = f.read()
            feats = parse_features_from_bytes(raw)
            if feats:
                features.extend(feats)
    return {"status": 200, "features": features, "export_id": export_id}


def ndjson_from_features(features):
    lines = []
    for f in features:
        lines.append(json.dumps(f, separators=(",", ":")))
    return "\n".join(lines) + ("\n" if lines else "")


def compute_field_inventory(features, max_items=200):
    top_keys = set()
    prop_keys = set()
    for f in features[:max_items]:
        if isinstance(f, dict):
            top_keys.update(f.keys())
            props = f.get("properties")
            if isinstance(props, dict):
                prop_keys.update(props.keys())
    return {"top_level_keys": sorted(top_keys), "properties_keys": sorted(prop_keys)}


def read_state():
    key = "raw/vetro_features/_state/plan_index.json"
    st = s3_get_json(key)
    if not st:
        return {"index": 0, "last_plan_id": None, "last_status": None, "last_error": None, "updated_utc": None}
    return st


def write_state(state):
    key = "raw/vetro_features/_state/plan_index.json"
    s3_put_json(key, state)


def get_plan_ids_from_s3():
    key = "raw/vetro_features/_meta/plan_ids.json"
    data = s3_get_json(key)
    if not data or "plan_ids" not in data:
        return []
    return data["plan_ids"]


def write_plan_ids(plan_ids):
    key = "raw/vetro_features/_meta/plan_ids.json"
    payload = {"updated_utc": utc_now(), "plan_ids": plan_ids}
    s3_put_json(key, payload)


def write_inventory(plan_id, dt, inv):
    key = f"raw/vetro_features/_meta/field_inventory/dt={dt}/plan_id={plan_id}.json"
    payload = {"plan_id": plan_id, "dt": dt, "updated_utc": utc_now(), **inv}
    s3_put_json(key, payload)


def write_summary(plan_id, dt, feature_count, http_status, bytes_written):
    key = f"raw/vetro_features/plan_id={plan_id}/dt={dt}/summary.json"
    payload = {
        "plan_id": plan_id,
        "dt": dt,
        "feature_count": feature_count,
        "http_status": http_status,
        "bytes_written": bytes_written,
        "updated_utc": utc_now(),
    }
    s3_put_json(key, payload)


def ingest_one_plan(token):
    dt = today_dt()
    plan_ids = get_plan_ids_from_s3()
    if not plan_ids:
        return {"status": "error", "error": "plan_ids_missing"}

    state = read_state()
    idx = int(state.get("index", 0) or 0)
    if idx >= len(plan_ids):
        idx = 0

    plan_id = plan_ids[idx]
    r = get_plan_features(token, plan_id)
    features = []
    http_status = r.status_code
    export_id = None

    if r.status_code == 200:
        payload = r.json()
        features = parse_features_payload(payload)
    elif r.status_code in (404, 405):
        export_res = fetch_features_via_export(token, plan_id)
        if export_res.get("status") == 429:
            state.update({
                "last_plan_id": plan_id,
                "last_status": "rate_limited",
                "last_error": "429",
                "updated_utc": utc_now(),
            })
            write_state(state)
            return {"status": "rate_limited", "plan_id": plan_id}
        features = export_res.get("features", [])
        export_id = export_res.get("export_id")
        http_status = 200 if features is not None else r.status_code
    elif r.status_code == 429:
        state.update({
            "last_plan_id": plan_id,
            "last_status": "rate_limited",
            "last_error": "429",
            "updated_utc": utc_now(),
        })
        write_state(state)
        return {"status": "rate_limited", "plan_id": plan_id}
    else:
        state.update({
            "last_plan_id": plan_id,
            "last_status": "error",
            "last_error": f"http_{r.status_code}",
            "updated_utc": utc_now(),
        })
        write_state(state)
        return {"status": "error", "plan_id": plan_id, "http_status": r.status_code}

    ndjson = ndjson_from_features(features)
    key = f"raw/vetro_features/plan_id={plan_id}/dt={dt}/features.ndjson"
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=ndjson.encode("utf-8"), ContentType="application/x-ndjson")

    inv = compute_field_inventory(features, max_items=200)
    write_inventory(plan_id, dt, inv)

    bytes_written = len(ndjson.encode("utf-8"))
    write_summary(plan_id, dt, len(features), http_status, bytes_written)

    state.update({
        "index": idx + 1,
        "last_plan_id": plan_id,
        "last_status": "success",
        "last_error": None,
        "updated_utc": utc_now(),
    })
    write_state(state)

    return {"status": "success", "plan_id": plan_id, "feature_count": len(features)}


def lambda_handler(event, context):
    mode = (event or {}).get("mode") or os.environ.get("MODE") or "INGEST"
    mode = mode.upper()

    REDACTED
    try:
        print(f"vetro_base_url={BASE_URL} token_len={len(token) if token else 0}")
    except Exception:
        print("vetro_token_len=unknown")
    if mode == "DISCOVER":
        res = discover_plan_ids(token)
        if res["status"] == 200:
            write_plan_ids(res["plan_ids"])
        return res

    return ingest_one_plan(token)
