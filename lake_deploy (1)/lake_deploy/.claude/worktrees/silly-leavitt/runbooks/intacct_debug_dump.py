#!/usr/bin/env python

"""
intacct_debug_dump.py

Usage:
  - Set env via:  source ~/intacct_env.sh PROD  (or SANDBOX / DEV)
  - Run:          python intacct_debug_dump.py

It will:
  - Build a readByQuery for a given object and text query
  - Call Intacct using your existing IntacctClient plumbing
  - Write the raw XML response to ~/intacct_debug_<env>_<object>.xml
"""

import os
from pathlib import Path
from xml.etree import ElementTree as ET

from intacct_client import IntacctClient, IntacctClientError


def debug_dump_read_by_query(
    obj: str,
    query_expr: str,
    pagesize: int = 50,
    label: str = "debug",
) -> Path:
    client = IntacctClient()

    function_xml = f"""
    <readByQuery>
      <object>{obj}</object>
      <fields>*</fields>
      <query>{query_expr}</query>
      <pagesize>{pagesize}</pagesize>
    </readByQuery>
    """

    # Use the private helpers to build and post the XML
    request_xml = client._build_request_xml(function_xml)  # type: ignore

    # We want the raw text, so we can't just call _post_xml (which parses).
    import requests

    headers = {
        "Content-Type": "application/xml; charset=utf-8",
        "Accept": "application/xml",
    }

    resp = requests.post(client.endpoint_url, data=request_xml.encode("utf-8"), headers=headers, timeout=180)
    resp.raise_for_status()

    # Write raw XML to a file labeled by env + object
    company = os.environ.get("INTACCT_COMPANY_ID", "UNKNOWN")
    env_label = company.replace("-", "_")
    out_path = Path.home() / f"intacct_debug_{env_label}_{obj}_{label}.xml"

    out_path.write_text(resp.text, encoding="utf-8")
    print(f"Wrote raw Intacct response to: {out_path}")

    # Print basic status + counts from the parsed XML
    root = ET.fromstring(resp.text)
    status = root.findtext(".//result/status")
    totalcount = root.findtext(".//result/totalcount")
    records = root.findall(f".//data//{obj}")

    print(f"Status={status!r}, totalcount={totalcount!r}, records={len(records)}")
    return out_path


def main() -> None:
    # You can tweak these three values to try different things
    obj = os.environ.get("INTACCT_DEBUG_OBJECT", "GLENTRY")
    query_expr = os.environ.get("INTACCT_DEBUG_QUERY", "RECORDNO > '0'")
    pagesize = int(os.environ.get("INTACCT_DEBUG_PAGESIZE", "50"))

    print(f"Debugging object={obj}, query={query_expr!r}, pagesize={pagesize}")
    debug_dump_read_by_query(obj=obj, query_expr=query_expr, pagesize=pagesize)


if __name__ == "__main__":
    main()
