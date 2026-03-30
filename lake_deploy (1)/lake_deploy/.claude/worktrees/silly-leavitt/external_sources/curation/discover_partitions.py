#!/usr/bin/env python3
"""Identify raw S3 partitions that are not yet registered in Glue/Athena."""

from argparse import ArgumentParser
from dataclasses import dataclass
import json
import os
from typing import Dict, Iterable, List, Set

import boto3

BUCKET = os.environ.get("DATA_LAKE_BUCKET", "gwi-raw-us-east-2-pc")
GLUE_DATABASE = os.environ.get("GLUE_DATABASE", "gwi_raw")

@dataclass
class Source:
    name: str
    prefix: str
    partition_key: str
    table: str

SOURCES: List[Source] = [
    Source("intacct_gl_entries", "raw/intacct_json/gl_entries", "run_date", "raw_intacct_gl_entries"),
    Source("platt_customer", "raw/platt/customer", "dt", "raw_platt_customer"),
    Source("vetro_exports", "raw/vetro", "plan_id", "raw_vetro_exports"),
    Source("salesforce_accounts", "raw/salesforce/accounts", "dt", "raw_salesforce_accounts"),
]


def paired_dates(start: str, end: str) -> Iterable[str]:
    from datetime import datetime, timedelta

    begin = datetime.strptime(start, "%Y-%m-%d")
    stop = datetime.strptime(end, "%Y-%m-%d")
    delta = timedelta(days=1)
    current = begin
    while current <= stop:
        yield current.strftime("%Y-%m-%d")
        current += delta


def list_s3_partitions(source: Source) -> Set[str]:
    s3 = boto3.client("s3")
    paginator = s3.get_paginator("list_objects_v2")
    key_prefix = f"{source.prefix}/{source.partition_key}="
    partitions: Set[str] = set()
    for page in paginator.paginate(Bucket=BUCKET, Prefix=key_prefix, Delimiter="/"):
        for common in page.get("CommonPrefixes", []):
            suffix = common["Prefix"][len(key_prefix):].rstrip("/")
            if suffix:
                partitions.add(suffix)
    return partitions


def list_glue_partitions(source: Source) -> Set[str]:
    glue = boto3.client("glue")
    paginator = glue.get_paginator("get_partitions")
    partitions: Set[str] = set()
    try:
        for page in paginator.paginate(DatabaseName=GLUE_DATABASE, TableName=source.table):
            for partition in page.get("Partitions", []):
                values = partition.get("Values", [])
                if values:
                    partitions.add(values[0])
    except glue.exceptions.EntityNotFoundException:
        pass
    return partitions


def build_report(target_sources: List[Source]) -> Dict:
    report: Dict[str, Dict] = {}
    for source in target_sources:
        s3_parts = list_s3_partitions(source)
        glue_parts = list_glue_partitions(source)
        missing = sorted(list(s3_parts - glue_parts))
        report[source.name] = {
            "prefix": source.prefix,
            "partition_key": source.partition_key,
            "s3_partitions": sorted(s3_parts),
            "glue_partitions": sorted(glue_parts),
            "missing_glue_partitions": missing,
        }
    return report


def parse_sources(names: List[str]) -> List[Source]:
    if not names:
        return SOURCES
    lookup = {source.name: source for source in SOURCES}
    return [lookup[name] for name in names if name in lookup]


def main() -> None:
    parser = ArgumentParser(description="Report which raw partitions exist in S3 but not Glue")
    parser.add_argument("--sources", help="Comma-separated source names to check", default="")
    parser.add_argument("--dt", help="Single dt or run_date to highlight", default="")
    parser.add_argument("--dt-range", help="Range YYYY-MM-DD:YYYY-MM-DD", default="")
    args = parser.parse_args()

    source_names = args.sources.split(",") if args.sources else []
    target_sources = parse_sources([name for name in source_names if name])
    report = build_report(target_sources)

    payload = {"report": report}

    if args.dt:
        payload["highlight"] = args.dt
    if args.dt_range:
        try:
            start, end = args.dt_range.split(":")
            payload["range"] = list(paired_dates(start, end))
        except ValueError:
            raise SystemExit("--dt-range must be START:END")

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
