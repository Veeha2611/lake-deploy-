#!/usr/bin/env python3
import argparse
import json
import os
import sys
import urllib.request


def post_json(url, payload):
    data = json.dumps(payload).encode("utf-8")
    token = os.environ.get("MAC_APP_AUTH_TOKEN", "").strip()
    headers = {"Content-Type": "application/json"}
    if token:
        if not token.lower().startswith("bearer "):
            token = f"Bearer {token}"
        headers["Authorization"] = token
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_json_file(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def main():
    parser = argparse.ArgumentParser(description="Trigger a case report export via the MAC API.")
    parser.add_argument("--case-id", required=True, help="Case identifier returned by /query.")
    parser.add_argument(
        "--report-spec",
        required=False,
        help="Optional path to a report_spec JSON payload (passed through to BUILD_REPORT).",
    )
    parser.add_argument(
        "--out",
        required=False,
        help="Optional path to write the full JSON response.",
    )
    args = parser.parse_args()

    base = os.environ.get("MAC_APP_API_BASE", "https://0vyy63hwe5.execute-api.us-east-2.amazonaws.com/prod")
    action_url = base.rstrip("/") + "/cases/action"

    payload = {"case_id": args.case_id, "action": "BUILD_REPORT"}
    if args.report_spec:
        payload["report_spec"] = load_json_file(args.report_spec)

    resp = post_json(action_url, payload)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(resp, fh, indent=2, sort_keys=True)
            fh.write("\n")

    # Print only non-sensitive references.
    download_url = resp.get("download_url")
    s3_key = resp.get("s3_key")
    if download_url or s3_key:
        print(json.dumps({"case_id": args.case_id, "s3_key": s3_key, "download_url": download_url}, indent=2))
        return 0

    print(json.dumps(resp, indent=2))
    return 1


if __name__ == "__main__":
    sys.exit(main())

