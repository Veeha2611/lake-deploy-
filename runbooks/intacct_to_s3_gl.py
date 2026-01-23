#!/usr/bin/env python

"""
Intacct → S3 GLACCOUNT export

- Uses IntacctClient from intacct_client.py
- Reads all credentials from INTACCT_* env vars
- Uses your default AWS profile/region (set in VS Code env)
- Writes NDJSON to:
  s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_accounts/<run_date>/gl_accounts.jsonl

Behavior:
- If Intacct returns status != "success", raises IntacctClientError.
- If status == "success" but 0 records, logs and exits cleanly (no S3 write).
"""

import datetime as dt
import json
from typing import Dict, Iterable

import boto3
from xml.etree import ElementTree as ET

from intacct_client import IntacctClient, IntacctClientError


BUCKET_NAME = "gwi-raw-us-east-2-pc"
BASE_PREFIX = "raw/intacct_json/gl_accounts"


def flatten_glaccount(elem: ET.Element) -> Dict[str, str]:
    """
    Turn a <GLACCOUNT> XML element into a flat dict of tag -> text.
    You can customize mapping/renames later as needed.
    """
    record: Dict[str, str] = {}
    for child in list(elem):
        record[child.tag] = (child.text or "").strip()
    return record


def export_glaccounts_to_s3(records: Iterable[Dict[str, str]]) -> str:
    """
    Write GLACCOUNT records as NDJSON to S3 and return the s3:// URI.
    """
    session = boto3.Session()  # picks up AWS_PROFILE/AWS_REGION from env
    s3 = session.client("s3")

    run_date = dt.date.today().isoformat()
    key = f"{BASE_PREFIX}/{run_date}/gl_accounts.jsonl"

    # Build NDJSON in memory (fine for modest volumes; can be streamed later).
    lines = [json.dumps(rec, ensure_ascii=False) for rec in records]
    body = "\n".join(lines) + ("\n" if lines else "")

    print(f"Writing {len(lines)} GLACCOUNT records to s3://{BUCKET_NAME}/{key} ...")
    s3.put_object(Bucket=BUCKET_NAME, Key=key, Body=body.encode("utf-8"))

    uri = f"s3://{BUCKET_NAME}/{key}"
    print(f"Done. Wrote GLACCOUNT data to {uri}")
    return uri


def main() -> None:
    client = IntacctClient()

    # Call the GLACCOUNT API via the client
    root = client.get_gl_accounts()

    status = root.findtext(".//result/status")
    totalcount = root.findtext(".//result/totalcount")
    gl_elems = root.findall(".//data//GLACCOUNT")

    print(f"Intacct GLACCOUNT status={status!r}, totalcount={totalcount!r}, records={len(gl_elems)}")

    if status != "success":
        raise IntacctClientError(
            f"Intacct GLACCOUNT call did not succeed, status={status!r}"
        )

    if len(gl_elems) == 0:
        # ✅ Soft outcome: nothing to write, but not an error
        print("No GLACCOUNT records returned; nothing to write to S3.")
        return

    # Flatten XML to dicts
    flattened = [flatten_glaccount(elem) for elem in gl_elems]

    # Export to S3
    export_glaccounts_to_s3(flattened)


if __name__ == "__main__":
    main()
