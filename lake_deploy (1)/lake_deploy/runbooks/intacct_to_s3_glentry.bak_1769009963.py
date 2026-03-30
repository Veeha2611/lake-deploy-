#!/usr/bin/env python3
"""
Pull GLENTRY records from Intacct, flatten them, and upload NDJSON to S3 with
fail-fast guards, narrow query defaults, and detailed heartbeats.
"""

from argparse import ArgumentParser
import datetime as dt
import logging
import os
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from requests.exceptions import ReadTimeout, RequestException
from xml.etree import ElementTree as ET

from glentry_utils import flatten_glentry, write_metadata_json, write_ndjson_records
from intacct_client import IntacctClient, IntacctClientError
from upload_glentry_ndjson_to_s3 import upload_heartbeat, upload_metadata, upload_to_s3

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

DEFAULT_BUCKET = "gwi-raw-us-east-2-pc"
DEFAULT_PREFIX = "raw/intacct_json/gl_entries"


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in ("1", "true", "yes", "on")


GLENTRY_USE_NARROW = _parse_bool(os.environ.get("GLENTRY_USE_NARROW", "true"))
GLENTRY_LOCATION_ID = os.environ.get("GLENTRY_LOCATION_ID", "10")
GLENTRY_LOOKBACK_DAYS = int(os.environ.get("GLENTRY_LOOKBACK_DAYS", "30"))
GLENTRY_EXTRA_QUERY = os.environ.get("GLENTRY_EXTRA_GLENTRY_QUERY", "").strip()
GLENTRY_PAGE_SIZE = int(os.environ.get("GLENTRY_PAGE_SIZE", "50"))
GLENTRY_HTTP_TIMEOUT_SECONDS = int(os.environ.get("GLENTRY_HTTP_TIMEOUT_SECONDS", "180"))
GLENTRY_HTTP_RETRIES = max(int(os.environ.get("GLENTRY_HTTP_RETRIES", "3")), 1)
GLENTRY_ALLOW_EMPTY_UPLOAD = _parse_bool(os.environ.get("GLENTRY_ALLOW_EMPTY_UPLOAD", "false"))
GLENTRY_BACKOFF_DELAYS = [2, 5, 10]
GLENTRY_DATE_FORMAT = os.environ.get("GLENTRY_DATE_FORMAT", "YYYY-MM-DD").upper()
GLENTRY_LOOKBACK_DATE = date.today() - timedelta(days=GLENTRY_LOOKBACK_DAYS)


def write_failure_marker(base_dir: Path, reason: str) -> None:
    marker = base_dir / "glentry_failure.txt"
    marker.write_text(f"{dt.datetime.utcnow().isoformat()} {reason}\n", encoding="utf-8")

def format_lookback_date() -> str:
    if GLENTRY_DATE_FORMAT == "MM/DD/YYYY":
        return GLENTRY_LOOKBACK_DATE.strftime("%m/%d/%Y")
    return GLENTRY_LOOKBACK_DATE.strftime("%Y-%m-%d")


def build_glentry_query(min_recordno: int) -> str:
    filters: List[str] = [f"RECORDNO > '{min_recordno}'"]
    if GLENTRY_USE_NARROW:
        filters.append(f"LOCATION = '{GLENTRY_LOCATION_ID}'")
        filters.append(f"ENTRY_DATE >= '{format_lookback_date()}'")
    if GLENTRY_EXTRA_QUERY:
        filters.append(GLENTRY_EXTRA_QUERY)
    return " AND ".join(filters)


def build_function_xml(min_recordno: int, pagesize: int) -> str:
    query_expr = build_glentry_query(min_recordno)
    return f"""
        <readByQuery>
          <object>GLENTRY</object>
          <fields>*</fields>
          <query>{query_expr}</query>
          <pagesize>{pagesize}</pagesize>
        </readByQuery>
    """


def summarize_response(root: ET.Element) -> (str, str, int, List[str], int):
    status = root.findtext(".//result/status") or "<missing>"
    totalcount = root.findtext(".//result/totalcount") or "0"
    data_section = root.find(".//data")
    record_count = len(list(data_section)) if data_section is not None else 0
    descriptions = [
        desc.text.strip()
        for desc in root.findall(".//errormessage//description2")
        if desc.text and desc.text.strip()
    ]
    error_nodes = len(root.findall(".//errormessage"))
    return status, totalcount, record_count, descriptions, error_nodes


def persist_metadata(
    root: ET.Element,
    run_date: str,
    args: Any,
    metadata_path: Path,
    min_recordno: int,
    pagesize: int,
) -> (str, str, int, List[str], int):
    status, totalcount, record_count, descriptions, error_nodes = summarize_response(root)
    metadata: Dict[str, Any] = {
        "run_date": run_date,
        "timestamp": dt.datetime.utcnow().isoformat(),
        "query": build_glentry_query(min_recordno),
        "status": status,
        "totalcount": totalcount,
        "record_count": record_count,
        "error_descriptions": descriptions,
        "min_recordno": min_recordno,
        "pagesize": pagesize,
    }
    write_metadata_json(metadata, metadata_path)
    upload_metadata(metadata, run_date, args.bucket, args.prefix)
    return status, totalcount, record_count, descriptions, error_nodes


def execute_with_retries(client: IntacctClient, request_xml: str) -> ET.Element:
    attempts = 0
    while True:
        try:
            return client._post_xml(request_xml)
        except ReadTimeout as exc:
            attempts += 1
            if attempts >= GLENTRY_HTTP_RETRIES:
                raise
            backoff = GLENTRY_BACKOFF_DELAYS[min(attempts - 1, len(GLENTRY_BACKOFF_DELAYS) - 1)]
            logging.warning(
                "GLENTRY request timed out on attempt %d/%d; sleeping %ds before retry",
                attempts,
                GLENTRY_HTTP_RETRIES,
                backoff,
            )
            time.sleep(backoff)


def request_glentries(client: IntacctClient, min_recordno: int, pagesize: int) -> ET.Element:
    function_xml = build_function_xml(min_recordno, pagesize)
    request_xml = client._build_request_xml(function_xml)
    return execute_with_retries(client, request_xml)


def failure_reason_from_details(
    status: str, descriptions: List[str], extra: Optional[str] = None
) -> str:
    parts = [f"status={status}"]
    if descriptions:
        parts.append(f"errors={'|'.join(descriptions)}")
    if extra:
        parts.append(extra)
    return "; ".join(parts)


def main() -> None:
    parser = ArgumentParser(description="Live GLENTRY ingest to S3")
    parser.add_argument("--min-recordno", type=int, default=0, help="Starting RECORDNO filter")
    parser.add_argument("--pagesize", type=int, default=GLENTRY_PAGE_SIZE, help="Page size for readByQuery")
    parser.add_argument("--bucket", default=DEFAULT_BUCKET, help="S3 bucket")
    parser.add_argument("--prefix", default=DEFAULT_PREFIX, help="S3 key prefix")
    parser.add_argument("--ndjson-dir", type=Path, default=Path("glentry_ndjson"), help="Local NDJSON output directory")
    parser.add_argument("--run-date", help="Use this date (YYYY-MM-DD) for output naming")
    args = parser.parse_args()

    run_date = args.run_date or dt.date.today().isoformat()
    args.ndjson_dir.mkdir(parents=True, exist_ok=True)
    response_path = args.ndjson_dir / f"glentry_{run_date}_response.xml"
    metadata_path = args.ndjson_dir / f"glentry_{run_date}_metadata.json"

    client = IntacctClient(timeout_seconds=GLENTRY_HTTP_TIMEOUT_SECONDS)
    try:
        root = request_glentries(client, args.min_recordno, args.pagesize)
    except IntacctClientError as exc:
        root = exc.response
        if root is not None:
            response_path.write_bytes(ET.tostring(root, encoding="utf-8"))
            status, totalcount, record_count, descriptions, _ = persist_metadata(
                root, run_date, args, metadata_path, args.min_recordno, args.pagesize
            )
            reason = failure_reason_from_details(status, descriptions, extra=str(exc))
        else:
            reason = str(exc)
        upload_heartbeat("failure", f"GLENTRY call failed: {reason}", args.bucket)
        write_failure_marker(args.ndjson_dir, reason)
        return
    except RequestException as exc:
        upload_heartbeat("failure", f"GLENTRY request error: {exc}", args.bucket)
        write_failure_marker(args.ndjson_dir, str(exc))
        return

    response_path.write_bytes(ET.tostring(root, encoding="utf-8"))
    status, totalcount, record_count, descriptions, error_nodes = persist_metadata(
        root, run_date, args, metadata_path, args.min_recordno, args.pagesize
    )

    if error_nodes or status.lower() != "success":
        reason = failure_reason_from_details(status, descriptions)
        logging.error("GLENTRY call reported failure: %s", reason)
        upload_heartbeat("failure", reason, args.bucket)
        write_failure_marker(args.ndjson_dir, reason)
        return

    if record_count == 0 and not GLENTRY_ALLOW_EMPTY_UPLOAD:
        reason = f"Intacct returned zero GLENTRY rows (totalcount={totalcount}) — skipping upload"
        logging.warning(reason)
        upload_heartbeat("failure", reason, args.bucket)
        write_failure_marker(args.ndjson_dir, reason)
        return

    flattened = [flatten_glentry(elem) for elem in find_entries(root)]
    ndjson_path = args.ndjson_dir / f"glentry_{run_date}.jsonl"
    written = write_ndjson_records(flattened, ndjson_path)
    logging.info("Wrote %d GLENTRY rows to %s", written, ndjson_path)

    upload_to_s3(ndjson_path, args.bucket, args.prefix)
    success_reason = f"GLENTRY ingest success ({record_count} rows; totalcount={totalcount})"
    upload_heartbeat("success", success_reason, args.bucket)


def find_entries(root: ET.Element) -> List[ET.Element]:
    data_section = root.find(".//data")
    if data_section is None:
        return []
    return data_section.findall("GLENTRY") + data_section.findall("glentry")


if __name__ == "__main__":
    main()
