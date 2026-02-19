import json
import os
import time
from datetime import datetime, timezone
from urllib.parse import urljoin

import boto3
import requests

s3 = boto3.client("s3")
secrets = boto3.client("secretsmanager")

S3_BUCKET = os.environ.get("S3_BUCKET", "gwi-raw-us-east-2-pc")
S3_PREFIX = os.environ.get("S3_PREFIX", "raw/gaiia")
S3_CHECKPOINT_PREFIX = os.environ.get("S3_CHECKPOINT_PREFIX", "raw/gaiia/graphql/_checkpoints").rstrip("/")
SECRET_NAME = os.environ.get("GAIIA_SECRET_NAME", "gaiia/api_keys")
BASE_URL_OVERRIDE = os.environ.get("GAIIA_BASE_URL", "")
API_URL_OVERRIDE = os.environ.get("GAIIA_API_URL", "")
QUERY_REGISTRY_KEY = os.environ.get("GAIIA_QUERY_REGISTRY_KEY", "")
QUERY_REGISTRY_RAW = os.environ.get("GAIIA_QUERY_REGISTRY", "")
ENDPOINTS = [e.strip() for e in os.environ.get("GAIIA_ENDPOINTS", "").split(",") if e.strip()]
AUTH_HEADER = os.environ.get("GAIIA_AUTH_HEADER", "X-Gaiia-Api-Key")
AUTH_PREFIX = os.environ.get("GAIIA_AUTH_PREFIX", "")
REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "30"))
PAGE_DELAY_S = float(os.environ.get("GAIIA_PAGE_DELAY_S", "0.15"))
RATE_LIMIT_MAX_RETRIES = int(os.environ.get("GAIIA_RATE_LIMIT_MAX_RETRIES", "8"))
RATE_LIMIT_BACKOFF_S = float(os.environ.get("GAIIA_RATE_LIMIT_BACKOFF_S", "2.0"))
SAFE_STOP_REMAINING_MS = int(os.environ.get("GAIIA_SAFE_STOP_REMAINING_MS", "30000"))


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
    return requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)


def load_query_registry() -> list:
    if QUERY_REGISTRY_RAW.strip():
        return json.loads(QUERY_REGISTRY_RAW)
    if not QUERY_REGISTRY_KEY:
        return []
    obj = s3.get_object(Bucket=S3_BUCKET, Key=QUERY_REGISTRY_KEY)
    return json.loads(obj["Body"].read().decode("utf-8"))


def render_placeholders(value, replacements):
    if isinstance(value, str):
        out = value
        for key, replacement in replacements.items():
            out = out.replace(f"{{{{{key}}}}}", str(replacement))
        return out
    if isinstance(value, list):
        return [render_placeholders(v, replacements) for v in value]
    if isinstance(value, dict):
        return {k: render_placeholders(v, replacements) for k, v in value.items()}
    return value


def post_graphql(api_url, token, query, variables):
    headers = {"Content-Type": "application/json"}
    if token:
        headers[AUTH_HEADER] = f"{AUTH_PREFIX}{token}"
    payload = {"query": query, "variables": variables or {}}
    return requests.post(api_url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT)


def extract_page_info(data, root_field):
    node = (data or {}).get(root_field) or {}
    page = node.get("pageInfo") or {}
    return {
        "hasNextPage": bool(page.get("hasNextPage")),
        "endCursor": page.get("endCursor"),
    }


def is_rate_limit_error(payload) -> bool:
    # Gaiia rate limit shows up as GraphQL errors (often with HTTP 200).
    errs = (payload or {}).get("errors") or []
    for e in errs:
        if not isinstance(e, dict):
            continue
        msg = (e.get("message") or "").lower()
        if "rate limit" in msg:
            return True
    return False


def checkpoint_key(tenant: str, entity: str, dt: str) -> str:
    return f"{S3_CHECKPOINT_PREFIX}/tenant={tenant}/entity={entity}/dt={dt}/checkpoint.json"


def load_checkpoint(tenant: str, entity: str, dt: str):
    key = checkpoint_key(tenant, entity, dt)
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
        return json.loads(obj["Body"].read().decode("utf-8"))
    except Exception:
        return None


def save_checkpoint(tenant: str, entity: str, dt: str, after: str, part: int) -> str:
    key = checkpoint_key(tenant, entity, dt)
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=json.dumps({"tenant": tenant, "entity": entity, "dt": dt, "after": after, "part": part}).encode("utf-8"),
        ContentType="application/json",
    )
    return key


def delete_checkpoint(tenant: str, entity: str, dt: str):
    key = checkpoint_key(tenant, entity, dt)
    try:
        s3.delete_object(Bucket=S3_BUCKET, Key=key)
    except Exception:
        pass


def lambda_handler(event, context):
    secret = load_secret()
    base_url = (API_URL_OVERRIDE or BASE_URL_OVERRIDE or secret.get("base_url") or "").rstrip("/")
    if not base_url:
        return {"status": "error", "error": "missing base_url"}

    tenants = {
        "lymefiber": secret.get("lymefiber_key"),
        "dvfiber": secret.get("dvfiber_key"),
        "gwi": secret.get("gwi_key"),
    }

    dt = today_dt()
    results = []
    registry = load_query_registry()

    for tenant, token in tenants.items():
        if not token:
            results.append({"tenant": tenant, "status": "skipped", "reason": "missing token"})
            continue
        if registry:
            replacements = {**secret, "tenant": tenant}
            for entry in registry:
                entity = entry.get("entity") or "unknown"
                query = entry.get("query") or ""
                root_field = entry.get("root_field") or entity
                paginate = entry.get("paginate", True)
                page_size = int(entry.get("page_size") or entry.get("pageSize") or 200)
                max_pages = int(entry.get("max_pages") or 1000)
                base_vars = render_placeholders(entry.get("variables") or {}, replacements)
                try:
                    part = 1
                    after = None
                    ck = load_checkpoint(tenant, entity, dt)
                    if isinstance(ck, dict):
                        after = ck.get("after") or None
                        try:
                            part = int(ck.get("part") or part)
                        except Exception:
                            part = part
                    while True:
                        if context and getattr(context, "get_remaining_time_in_millis", None):
                            if context.get_remaining_time_in_millis() < SAFE_STOP_REMAINING_MS:
                                ck_key = save_checkpoint(tenant, entity, dt, after, part)
                                results.append(
                                    {
                                        "tenant": tenant,
                                        "entity": entity,
                                        "status": "paused",
                                        "reason": "approaching_timeout",
                                        "checkpoint_key": ck_key,
                                    }
                                )
                                break

                        variables = dict(base_vars)
                        if "first" not in variables:
                            variables["first"] = page_size
                        if after:
                            variables["after"] = after
                        else:
                            variables.pop("after", None)
                        retry = 0
                        while True:
                            resp = post_graphql(base_url, token, query, variables)
                            try:
                                payload = resp.json()
                            except Exception:
                                payload = None

                            if payload and payload.get("errors") and is_rate_limit_error(payload):
                                retry += 1
                                if retry > RATE_LIMIT_MAX_RETRIES:
                                    ck_key = save_checkpoint(tenant, entity, dt, after, part)
                                    results.append(
                                        {
                                            "tenant": tenant,
                                            "entity": entity,
                                            "status": "paused",
                                            "reason": "rate_limited",
                                            "status_code": resp.status_code,
                                            "checkpoint_key": ck_key,
                                        }
                                    )
                                    payload = None
                                    break
                                time.sleep(RATE_LIMIT_BACKOFF_S * retry)
                                continue
                            break

                        # Count nodes for this page (for mirror verification). This is derived from the same
                        # native response we land to S3, so it avoids time-drift when comparing later.
                        nodes_count = None
                        try:
                            if payload and not payload.get("errors"):
                                data = payload.get("data") or {}
                                conn = (data or {}).get(root_field) or {}
                                nodes = conn.get("nodes") or []
                                if isinstance(nodes, list):
                                    nodes_count = len(nodes)
                        except Exception:
                            nodes_count = None

                        key = f"{S3_PREFIX}/{entity}/tenant={tenant}/dt={dt}/part-{part:04d}.json"
                        s3.put_object(
                            Bucket=S3_BUCKET,
                            Key=key,
                            Body=resp.text.encode("utf-8"),
                            ContentType="application/json",
                        )
                        if payload and payload.get("errors"):
                            results.append({
                                "tenant": tenant,
                                "entity": entity,
                                "status": "error",
                                "status_code": resp.status_code,
                                "s3_key": key,
                                "errors": payload.get("errors"),
                            })
                            break
                        results.append(
                            {
                                "tenant": tenant,
                                "entity": entity,
                                "status_code": resp.status_code,
                                "s3_key": key,
                                "nodes_count": nodes_count,
                            }
                        )

                        if not paginate:
                            delete_checkpoint(tenant, entity, dt)
                            break
                        if not payload:
                            break
                        data = payload.get("data")
                        page = extract_page_info(data, root_field)
                        if not page.get("hasNextPage"):
                            delete_checkpoint(tenant, entity, dt)
                            break
                        after = page.get("endCursor")
                        part += 1
                        if part > max_pages:
                            results.append({
                                "tenant": tenant,
                                "entity": entity,
                                "status": "error",
                                "error": "max_pages_exceeded",
                            })
                            break
                        time.sleep(PAGE_DELAY_S)
                except Exception as e:
                    results.append({"tenant": tenant, "entity": entity, "status": "error", "error": str(e)})
        else:
            if not ENDPOINTS:
                results.append({"tenant": tenant, "status": "skipped", "reason": "GAIIA_ENDPOINTS empty"})
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

    # Summarize landed pages and node counts to support deterministic mirror verification.
    summary = {}
    for r in results:
        tenant = r.get("tenant")
        entity = r.get("entity")
        if not tenant or not entity:
            continue
        if r.get("status_code") == 200 and isinstance(r.get("nodes_count"), int):
            ent = summary.setdefault(tenant, {}).setdefault(entity, {"pages": 0, "nodes": 0})
            ent["pages"] += 1
            ent["nodes"] += int(r["nodes_count"])

    meta_key = f"{S3_PREFIX}/_meta/dt={dt}/run.json"
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=meta_key,
        Body=json.dumps({"ts": utc_now(), "dt": dt, "results": results, "summary": summary}).encode("utf-8"),
        ContentType="application/json",
    )

    return {"status": "ok", "results": results}
