#!/usr/bin/env python3
import json
import os
import sys
import urllib.request


def load_questions():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base_dir, "metadata", "golden_questions.json")
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def post_json(url, payload):
    data = json.dumps(payload).encode("utf-8")
    token = os.environ.get("MAC_APP_AUTH_TOKEN", "").strip()
    headers = {"Content-Type": "application/json"}
    if token:
        if not token.lower().startswith("bearer "):
            token = f"Bearer {token}"
        headers["Authorization"] = token
    req = urllib.request.Request(
        url,
        data=data,
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    base = os.environ.get("MAC_APP_API_BASE", "https://0vyy63hwe5.execute-api.us-east-2.amazonaws.com/prod")
    url = base.rstrip("/") + "/query"
    action_url = base.rstrip("/") + "/cases/action"
    suite = load_questions()
    questions = suite.get("questions", [])
    failures = []

    for item in questions:
        qid = item.get("id")
        question = item.get("question")
        payload = {"question": question}
        try:
            resp = post_json(url, payload)
        except Exception as exc:
            failures.append((qid, f"request_failed: {exc}"))
            continue

        if not resp.get("evidence_pack"):
            failures.append((qid, "missing_evidence_pack"))
            continue

        if resp.get("answer_markdown") in (None, ""):
            failures.append((qid, "missing_answer_markdown"))
            continue

        if resp.get("plan_status") == "invalid_plan":
            failures.append((qid, "invalid_plan"))
            continue

        if not resp.get("ok", False):
            failures.append((qid, "response_not_ok"))
            continue

        # Minimal end-to-end action checks (contract requirements).
        # Keep this small to avoid excessive Athena load.
        if qid == "q01_total_mrr":
            case_id = resp.get("case_id")
            if not case_id:
                failures.append((qid, "missing_case_id_for_actions"))
                continue

            try:
                verify_resp = post_json(action_url, {"case_id": case_id, "action": "VERIFY_ACROSS_SYSTEMS"})
            except Exception as exc:
                failures.append((qid, f"verify_action_failed: {exc}"))
                continue

            verification = verify_resp.get("verification") if isinstance(verify_resp, dict) else None
            if not verification or not verification.get("status"):
                failures.append((qid, "verify_missing_verification_status"))
                continue

            try:
                report_resp = post_json(action_url, {"case_id": case_id, "action": "BUILD_REPORT"})
            except Exception as exc:
                failures.append((qid, f"build_report_failed: {exc}"))
                continue

            if not report_resp.get("download_url") or not report_resp.get("s3_key"):
                failures.append((qid, "build_report_missing_artifact"))
                continue

    if failures:
        for qid, reason in failures:
            print(f"FAIL {qid}: {reason}")
        sys.exit(1)

    print(f"PASS {len(questions)} golden questions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
