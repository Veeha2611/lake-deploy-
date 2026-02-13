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
API_URL_OVERRIDE = os.environ.get("GAIIA_API_URL", "")
QUERY_REGISTRY_KEY = os.environ.get("GAIIA_QUERY_REGISTRY_KEY", "")
QUERY_REGISTRY_RAW = os.environ.get("GAIIA_QUERY_REGISTRY", "")
ENDPOINTS = [e.strip() for e in os.environ.get("GAIIA_ENDPOINTS", "").split(",") if e.strip()]
AUTH_HEADER = os.environ.get("GAIIA_AUTH_HEADER", "X-Gaiia-Api-Key")
AUTH_PREFIX = os.environ.get("GAIIA_AUTH_PREFIX", "")
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
                    while True:
                        variables = dict(base_vars)
                        if "first" not in variables:
                            variables["first"] = page_size
                        if after:
                            variables["after"] = after
                        else:
                            variables.pop("after", None)
                        resp = post_graphql(base_url, token, query, variables)
                        try:
                            payload = resp.json()
                        except Exception:
                            payload = None
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
                        results.append({"tenant": tenant, "entity": entity, "status_code": resp.status_code, "s3_key": key})

                        if not paginate:
                            break
                        if not payload:
                            break
                        data = payload.get("data")
                        page = extract_page_info(data, root_field)
                        if not page.get("hasNextPage"):
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

    meta_key = f"{S3_PREFIX}/_meta/dt={dt}/run.json"
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=meta_key,
        Body=json.dumps({"ts": utc_now(), "results": results}).encode("utf-8"),
        ContentType="application/json",
    )

    return {"status": "ok", "results": results}
