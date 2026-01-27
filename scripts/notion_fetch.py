#!/usr/bin/env python3
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

import boto3
import requests

AWS_REGION = os.environ.get("AWS_REGION", "us-east-2")
BUCKET = os.environ.get("NOTION_SNAPSHOT_BUCKET", "gwi-raw-us-east-2-pc")
SECRET_NAME = os.environ.get("NOTION_SECRET_NAME", "notion/prod")
ROOT_PAGE_ID = os.environ.get("ROOT_PAGE_ID", "")

NOTION_VERSION = "2022-06-28"

s3 = boto3.client("s3", region_name=AWS_REGION)
secrets = boto3.client("secretsmanager", region_name=AWS_REGION)


def load_secret() -> Dict[str, str]:
    data = secrets.get_secret_value(SecretId=SECRET_NAME)
    secret = data.get("SecretString", "")
    payload = json.loads(secret) if secret else {}
    token = payload.get("token")
    root_id = payload.get("root_page_id")
    if ROOT_PAGE_ID:
        root_id = ROOT_PAGE_ID
    if not token or not root_id:
        raise SystemExit("Missing token or root_page_id in Secrets Manager.")
    return {"token": token.strip(), "root_page_id": root_id.strip()}


def notion_headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def notion_get(url: str, token: str, params: Optional[Dict] = None) -> Dict:
    resp = requests.get(url, headers=notion_headers(token), params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def notion_post(url: str, token: str, payload: Dict) -> Dict:
    resp = requests.post(url, headers=notion_headers(token), json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def redact(text: str) -> str:
    # Basic redaction patterns
    patterns = [
        r"(secret|token|apikey|api_key|bearer)\s*[:=]\s*\S+",
        r"AKIA[0-9A-Z]{16}",
        r"ASIA[0-9A-Z]{16}",
        r"\b[0-9a-f]{32}\b",
        r"\b[0-9a-f]{64}\b",
    ]
    redacted = text
    for pat in patterns:
        redacted = re.sub(pat, "[REDACTED]", redacted, flags=re.IGNORECASE)
    return redacted


def extract_plain_text(rich_text: List[Dict]) -> str:
    return "".join([t.get("plain_text", "") for t in rich_text])


def block_to_markdown(block: Dict) -> str:
    t = block.get("type")
    data = block.get(t, {}) if t else {}
    if t in {"paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item"}:
        text = extract_plain_text(data.get("rich_text", []))
        if not text:
            return ""
        if t == "heading_1":
            return f"# {text}"
        if t == "heading_2":
            return f"## {text}"
        if t == "heading_3":
            return f"### {text}"
        if t == "bulleted_list_item":
            return f"- {text}"
        if t == "numbered_list_item":
            return f"1. {text}"
        return text
    if t == "to_do":
        text = extract_plain_text(data.get("rich_text", []))
        checked = data.get("checked")
        box = "[x]" if checked else "[ ]"
        return f"- {box} {text}".strip()
    if t == "code":
        text = extract_plain_text(data.get("rich_text", []))
        lang = data.get("language", "")
        return f"```{lang}\n{text}\n```".strip()
    if t == "quote":
        text = extract_plain_text(data.get("rich_text", []))
        return f"> {text}".strip()
    if t == "divider":
        return "---"
    if t == "child_page":
        title = data.get("title", "")
        return f"## {title}".strip()
    return ""


def fetch_blocks(block_id: str, token: str) -> List[Dict]:
    blocks = []
    cursor = None
    while True:
        params = {"page_size": 100}
        if cursor:
            params["start_cursor"] = cursor
        data = notion_get(f"https://api.notion.com/v1/blocks/{block_id}/children", token, params=params)
        blocks.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return blocks


def fetch_page(page_id: str, token: str) -> Dict:
    return notion_get(f"https://api.notion.com/v1/pages/{page_id}", token)


def fetch_database(db_id: str, token: str) -> List[str]:
    page_ids = []
    cursor = None
    while True:
        payload = {"page_size": 100}
        if cursor:
            payload["start_cursor"] = cursor
        data = notion_post(f"https://api.notion.com/v1/databases/{db_id}/query", token, payload)
        for row in data.get("results", []):
            page_ids.append(row.get("id"))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return page_ids


def walk_tree(root_id: str, token: str) -> Tuple[Dict[str, Dict], Dict[str, List[Dict]]]:
    pages: Dict[str, Dict] = {}
    blocks_map: Dict[str, List[Dict]] = {}
    to_visit = [root_id]
    visited: Set[str] = set()
    while to_visit:
        page_id = to_visit.pop(0)
        if page_id in visited:
            continue
        visited.add(page_id)
        page = fetch_page(page_id, token)
        pages[page_id] = page
        blocks = fetch_blocks(page_id, token)
        blocks_map[page_id] = blocks
        for block in blocks:
            if block.get("type") == "child_page":
                to_visit.append(block.get("id"))
            if block.get("type") == "child_database":
                db_id = block.get("id")
                to_visit.extend(fetch_database(db_id, token))
    return pages, blocks_map


def page_title(page: Dict) -> str:
    props = page.get("properties", {})
    for prop in props.values():
        if prop.get("type") == "title":
            return extract_plain_text(prop.get("title", []))
    return page.get("id", "")


def to_markdown(page_id: str, blocks: List[Dict], title: str) -> str:
    lines = [f"# {title}", ""]
    for block in blocks:
        line = block_to_markdown(block)
        if line:
            lines.append(line)
    return "\n".join(lines)


def s3_put(key: str, body: str) -> None:
    s3.put_object(Bucket=BUCKET, Key=key, Body=body.encode("utf-8"), ContentType="application/json")


def main() -> None:
    secret = load_secret()
    token = secret["token"]
    root_id = secret["root_page_id"]
    run_date = datetime.now(timezone.utc).date().isoformat()

    pages, blocks_map = walk_tree(root_id, token)
    index_rows = []

    for page_id, page in pages.items():
        title = page_title(page)
        blocks = blocks_map.get(page_id, [])
        raw_key = f"knowledge/notion/pages/dt={run_date}/{page_id}.json"
        text_key = f"knowledge/notion/text/dt={run_date}/{page_id}.md"

        raw_payload = redact(json.dumps({"page": page, "blocks": blocks}, ensure_ascii=False))
        s3.put_object(Bucket=BUCKET, Key=raw_key, Body=raw_payload.encode("utf-8"), ContentType="application/json")

        md = to_markdown(page_id, blocks, title)
        md = redact(md)
        s3.put_object(Bucket=BUCKET, Key=text_key, Body=md.encode("utf-8"), ContentType="text/markdown")

        index_rows.append({
            "page_id": page_id,
            "title": title,
            "dt": run_date,
            "s3_key": text_key,
        })

    # write index ndjson
    index_key = f"knowledge/notion/index/dt={run_date}/index.ndjson"
    ndjson = "\n".join(json.dumps(r, ensure_ascii=False) for r in index_rows)
    s3.put_object(Bucket=BUCKET, Key=index_key, Body=ndjson.encode("utf-8"), ContentType="application/x-ndjson")

    print(f"OK: pages={len(pages)} index={index_key}")


if __name__ == "__main__":
    main()
