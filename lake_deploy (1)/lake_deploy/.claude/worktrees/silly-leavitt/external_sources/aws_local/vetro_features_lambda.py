import io
import json
import os
import zipfile
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin, urlencode

import boto3
import botocore
import requests

BASE_URL = os.environ.get("VETRO_BASE_URL", "https://api.vetro.io/v3/")
S3_BUCKET = os.environ.get("S3_BUCKET", "gwi-raw-us-east-2-pc")
TOKEN_SECRET_NAME = os.environ.get("TOKEN_SECRET_NAME", "vetro/api_token")
REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "30"))
DEFAULT_RATE_LIMIT_WAIT_SECONDS = int(os.environ.get("DEFAULT_RATE_LIMIT_WAIT_SECONDS", "3700"))
EXPORT_COOLDOWN_SECONDS = int(os.environ.get("EXPORT_COOLDOWN_SECONDS", "3700"))
MAX_PLAN_ATTEMPTS_PER_RUN = int(os.environ.get("MAX_PLAN_ATTEMPTS_PER_RUN", "25"))

s3 = boto3.client("s3")
secrets = boto3.client("secretsmanager")


def utc_now_dt():
    return datetime.now(timezone.utc)


def utc_now():
    return utc_now_dt().strftime("%Y-%m-%dT%H:%M:%SZ")


def today_dt():
    return utc_now_dt().strftime("%Y-%m-%d")


def utc_after_seconds(seconds):
    return (utc_now_dt() + timedelta(seconds=max(0, int(seconds)))).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_utc(ts):
    if not ts:
        return None
    raw = str(ts).strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


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


def retry_after_seconds(response, fallback=DEFAULT_RATE_LIMIT_WAIT_SECONDS):
    header = response.headers.get("Retry-After")
    if not header:
        return int(fallback)
    try:
        wait = float(header)
        if wait < 0:
            return int(fallback)
        return int(wait)
    except ValueError:
        return int(fallback)


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
        return {"status": 429, "retry_after_seconds": retry_after_seconds(r)}
    r.raise_for_status()
    payload = r.json()
    download_url = payload.get("download_url")
    export_id = payload.get("export_id")
    if not download_url:
        raise RuntimeError(f"No download_url in export response for plan {plan_id}")

    zresp = requests.get(download_url, timeout=300)
    if zresp.status_code == 429:
        return {"status": 429, "retry_after_seconds": retry_after_seconds(zresp)}
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
    if not st or not isinstance(st, dict):
        return {
            "index": 0,
            "last_plan_id": None,
            "last_status": None,
            "last_method": None,
            "last_http_status": None,
            "last_error": None,
            "next_export_allowed_utc": None,
            "rate_limited": False,
            "updated_utc": None,
        }
    st.setdefault("index", 0)
    st.setdefault("last_plan_id", None)
    st.setdefault("last_status", None)
    st.setdefault("last_method", None)
    st.setdefault("last_http_status", None)
    st.setdefault("last_error", None)
    st.setdefault("next_export_allowed_utc", None)
    st.setdefault("rate_limited", False)
    st.setdefault("updated_utc", None)
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


def normalize_index(index, plan_count):
    if plan_count <= 0:
        return 0
    try:
        idx = int(index or 0)
    except (ValueError, TypeError):
        idx = 0
    return idx % plan_count


def write_features_snapshot(plan_id, dt, features, http_status, method, export_id=None):
    ndjson = ndjson_from_features(features)
    key = f"raw/vetro_features/plan_id={plan_id}/dt={dt}/features.ndjson"
    payload_bytes = ndjson.encode("utf-8")
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=payload_bytes, ContentType="application/x-ndjson")

    inv = compute_field_inventory(features, max_items=200)
    write_inventory(plan_id, dt, inv)

    bytes_written = len(payload_bytes)
    summary = {
        "plan_id": plan_id,
        "dt": dt,
        "feature_count": len(features),
        "http_status": http_status,
        "bytes_written": bytes_written,
        "method": method,
        "updated_utc": utc_now(),
    }
    if export_id:
        summary["export_id"] = export_id
    s3_put_json(f"raw/vetro_features/plan_id={plan_id}/dt={dt}/summary.json", summary)
    return bytes_written


def set_rate_limited(state, plan_id, wait_seconds, error_code):
    wait_seconds = max(1, int(wait_seconds or DEFAULT_RATE_LIMIT_WAIT_SECONDS))
    state.update({
        "last_plan_id": plan_id,
        "last_status": "rate_limited",
        "last_method": "rate_limit",
        "last_error": error_code,
        "next_export_allowed_utc": utc_after_seconds(wait_seconds),
        "rate_limited": True,
        "updated_utc": utc_now(),
    })


def ingest_one_plan(token):
    dt = today_dt()
    plan_ids = get_plan_ids_from_s3()
    if not plan_ids:
        return {"status": "error", "error": "plan_ids_missing"}

    state = read_state()
    idx = normalize_index(state.get("index", 0), len(plan_ids))
    max_attempts = max(1, min(MAX_PLAN_ATTEMPTS_PER_RUN, len(plan_ids)))
    attempts = 0
    last_reason = None

    while attempts < max_attempts:
        plan_id = plan_ids[idx]
        next_export_allowed = parse_utc(state.get("next_export_allowed_utc"))
        export_allowed = not next_export_allowed or utc_now_dt() >= next_export_allowed

        r = get_plan_features(token, plan_id)
        http_status = r.status_code

        if http_status == 200:
            payload = r.json()
            features = parse_features_payload(payload)
            bytes_written = write_features_snapshot(
                plan_id=plan_id,
                dt=dt,
                features=features,
                http_status=http_status,
                method="direct_api",
            )
            state.update({
                "index": normalize_index(idx + 1, len(plan_ids)),
                "last_plan_id": plan_id,
                "last_status": "success",
                "last_method": "direct_api",
                "last_http_status": http_status,
                "last_error": None,
                "rate_limited": False,
                "updated_utc": utc_now(),
            })
            write_state(state)
            return {
                "status": "success",
                "plan_id": plan_id,
                "feature_count": len(features),
                "method": "direct_api",
                "bytes_written": bytes_written,
            }

        if http_status in (404, 405):
            if export_allowed:
                export_res = fetch_features_via_export(token, plan_id)
                if export_res.get("status") == 429:
                    wait = export_res.get("retry_after_seconds", DEFAULT_RATE_LIMIT_WAIT_SECONDS)
                    set_rate_limited(state, plan_id, wait, "429_export")
                    last_reason = "export_rate_limited"
                    idx = normalize_index(idx + 1, len(plan_ids))
                    attempts += 1
                    continue

                features = export_res.get("features", [])
                export_id = export_res.get("export_id")
                bytes_written = write_features_snapshot(
                    plan_id=plan_id,
                    dt=dt,
                    features=features,
                    http_status=200,
                    method="export_fallback",
                    export_id=export_id,
                )
                state.update({
                    "index": normalize_index(idx + 1, len(plan_ids)),
                    "last_plan_id": plan_id,
                    "last_status": "success",
                    "last_method": "export_fallback",
                    "last_http_status": 200,
                    "last_error": None,
                    "next_export_allowed_utc": utc_after_seconds(EXPORT_COOLDOWN_SECONDS),
                    "rate_limited": False,
                    "updated_utc": utc_now(),
                })
                write_state(state)
                return {
                    "status": "success",
                    "plan_id": plan_id,
                    "feature_count": len(features),
                    "method": "export_fallback",
                    "bytes_written": bytes_written,
                    "export_id": export_id,
                }

            # Export cooldown is active. Skip this plan so one throttled plan never blocks the queue.
            state.update({
                "last_plan_id": plan_id,
                "last_status": "deferred_export_cooldown",
                "last_method": "deferred",
                "last_http_status": http_status,
                "last_error": "export_cooldown_active",
                "updated_utc": utc_now(),
            })
            last_reason = "export_cooldown_active"
            idx = normalize_index(idx + 1, len(plan_ids))
            attempts += 1
            continue

        if http_status == 429:
            wait = retry_after_seconds(r)
            set_rate_limited(state, plan_id, wait, "429_api")
            state["index"] = idx
            write_state(state)
            return {
                "status": "rate_limited",
                "plan_id": plan_id,
                "reason": "api_rate_limited",
                "next_export_allowed_utc": state.get("next_export_allowed_utc"),
            }

        state.update({
            "last_plan_id": plan_id,
            "last_status": "error",
            "last_method": "direct_api",
            "last_http_status": http_status,
            "last_error": f"http_{http_status}",
            "updated_utc": utc_now(),
        })
        last_reason = f"http_{http_status}"
        idx = normalize_index(idx + 1, len(plan_ids))
        attempts += 1

    state.update({
        "index": idx,
        "updated_utc": utc_now(),
    })
    if state.get("last_status") not in {"success", "rate_limited"}:
        state["last_status"] = "no_progress"
    write_state(state)
    return {
        "status": state.get("last_status", "no_progress"),
        "attempts": max_attempts,
        "next_index": idx,
        "reason": last_reason or state.get("last_error"),
        "next_export_allowed_utc": state.get("next_export_allowed_utc"),
    }


def lambda_handler(event, context):
    mode = (event or {}).get("mode") or os.environ.get("MODE") or "INGEST"
    mode = mode.upper()

    token = get_token()
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
