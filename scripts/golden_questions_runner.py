#!/usr/bin/env python3
import json
import os
import sys
import urllib.request


def load_suite():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(base_dir, "automation", "tests", "alex_questions.json"),
        os.path.join(
            base_dir,
            "apps",
            "mac-app-v2",
            "lambda",
            "query-broker",
            "metadata",
            "golden_questions.json",
        ),
        os.path.join(base_dir, "metadata", "golden_questions.json"),
    ]
    for path in candidates:
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    raise FileNotFoundError("No golden questions suite found in known locations.")


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
    suite = load_suite()
    questions = suite.get("questions", [])
    failures = []

    for item in questions:
        qid = item.get("id")
        question = item.get("question")
        expected_metric_key = item.get("expected_metric_key")
        expect_ok = item.get("expect_ok", True)
        expect_evidence = item.get("expect_evidence_pack", True)
        expect_err_contains = item.get("expect_error_contains") or []
        payload = {"question": question}
        try:
            resp = post_json(url, payload)
        except Exception as exc:
            failures.append((qid, f"request_failed: {exc}"))
            continue

        ok = bool(resp.get("ok", False))
        if ok != bool(expect_ok):
            failures.append((qid, f"unexpected_ok: got={ok} expected={expect_ok}"))
            continue

        # For expected failures (guardrails), assert the error contains one of the expected fragments.
        if not expect_ok:
            haystack = json.dumps(resp).lower()
            if expect_err_contains and not any(str(frag).lower() in haystack for frag in expect_err_contains):
                failures.append((qid, "missing_expected_error_fragment"))
            continue

        if expect_evidence and not resp.get("evidence_pack"):
            failures.append((qid, "missing_evidence_pack"))
            continue

        if resp.get("answer_markdown") in (None, ""):
            failures.append((qid, "missing_answer_markdown"))
            continue

        if resp.get("plan_status") == "invalid_plan":
            failures.append((qid, "invalid_plan"))
            continue

        if expected_metric_key and resp.get("metric_key") and resp.get("metric_key") != expected_metric_key:
            failures.append((qid, f"metric_key_mismatch: got={resp.get('metric_key')} expected={expected_metric_key}"))
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
