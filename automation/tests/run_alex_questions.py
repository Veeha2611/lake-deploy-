#!/usr/bin/env python3
import json
import os
import sys
import urllib.request


def load_suite():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base_dir, "tests", "alex_questions.json")
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
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def assert_contains(text, needles, test_id):
    for needle in needles:
        if needle not in text:
            raise AssertionError(f"{test_id}: missing '{needle}' in answer_markdown")


def main():
    base = os.environ.get(
        "MAC_APP_API_BASE",
        "https://0vyy63hwe5.execute-api.us-east-2.amazonaws.com/prod",
    )
    url = base.rstrip("/") + "/query"

    suite = load_suite()
    tests = suite.get("tests", [])
    failures = []

    require_verify = os.environ.get("REQUIRE_VERIFY_ACTION", "").strip() == "1"
    require_exports = os.environ.get("REQUIRE_REPORT_EXPORT_ACTION", "").strip() == "1"

    for item in tests:
        test_id = item.get("id")
        question = item.get("question")
        expect = item.get("expect", {})
        try:
            resp = post_json(url, {"question": question})
        except Exception as exc:
            failures.append((test_id, f"request_failed: {exc}"))
            continue

        answer = resp.get("answer_markdown") or ""
        mode = expect.get("mode")
        expected_qid = expect.get("question_id")

        if mode == "supported":
            if expected_qid and resp.get("question_id") != expected_qid:
                failures.append((test_id, f"wrong_question_id: expected {expected_qid} got {resp.get('question_id')}"))
                continue
            if expect.get("require_evidence_pack") and not resp.get("evidence_pack"):
                failures.append((test_id, "missing_evidence_pack"))
                continue
            if not answer.strip():
                failures.append((test_id, "missing_answer_markdown"))
                continue

            case_id = resp.get("case_id")
            actions = resp.get("actions_available") or []
            if case_id:
                if "SHOW_EVIDENCE" not in actions:
                    failures.append((test_id, "missing_show_evidence_action"))
                    continue
                if require_verify and "VERIFY_ACROSS_SYSTEMS" not in actions:
                    failures.append((test_id, "missing_verify_action"))
                    continue
                if require_exports:
                    for action in ("EXPORT_CSV", "EXPORT_XLSX", "BUILD_REPORT"):
                        if action not in actions:
                            failures.append((test_id, f"missing_{action.lower()}_action"))
                            break
        elif mode == "not_supported":
            must = expect.get("must_contain") or ["NOT SUPPORTED YET:", "NEXT STEP:"]
            try:
                assert_contains(answer, must, test_id)
            except Exception as exc:
                failures.append((test_id, str(exc)))
                continue
        else:
            failures.append((test_id, f"unknown_expect_mode: {mode}"))

    if failures:
        for test_id, reason in failures:
            print(f"FAIL {test_id}: {reason}")
        sys.exit(1)

    print(f"PASS {len(tests)} alex questions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
