#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.request


def load_suite():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base_dir, "tests", "network_mix_domain_questions.json")
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def post_json(url, payload, timeout=120):
    data = json.dumps(payload).encode("utf-8")
    token = os.environ.get("MAC_APP_AUTH_TOKEN", "").strip()
    headers = {"Content-Type": "application/json"}
    if token:
        if not token.lower().startswith("bearer "):
            token = f"Bearer {token}"
        headers["Authorization"] = token
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
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
    suite = load_suite()
    url = base.rstrip("/") + suite.get("api_path", "/query")

    tests = suite.get("tests", [])
    failures = []

    # Keep pressure low; the prod lambda has low reserved concurrency.
    sleep_s = float(os.environ.get("TEST_SLEEP_SECONDS", "0.5"))

    for item in tests:
        test_id = item.get("id")
        question = item.get("question")
        expect = item.get("expect", {})

        try:
            resp = post_json(url, {"question": question})
        except Exception as exc:
            failures.append((test_id, f"request_failed: {exc}"))
            time.sleep(sleep_s)
            continue

        answer = resp.get("answer_markdown") or ""
        mode = expect.get("mode")
        expected_qid = expect.get("question_id")

        if mode == "supported":
            if expected_qid and resp.get("question_id") != expected_qid:
                failures.append(
                    (test_id, f"wrong_question_id: expected {expected_qid} got {resp.get('question_id')}")
                )
            if expect.get("require_evidence_pack") and not resp.get("evidence_pack"):
                failures.append((test_id, "missing_evidence_pack"))
            if not answer.strip():
                failures.append((test_id, "missing_answer_markdown"))
        elif mode == "not_supported":
            must = expect.get("must_contain") or ["NOT SUPPORTED YET:", "NEXT STEP:"]
            try:
                assert_contains(answer, must, test_id)
            except Exception as exc:
                failures.append((test_id, str(exc)))
        else:
            failures.append((test_id, f"unknown_expect_mode: {mode}"))

        time.sleep(sleep_s)

    if failures:
        for test_id, reason in failures:
            print(f"FAIL {test_id}: {reason}")
        sys.exit(1)

    print(f"PASS {len(tests)} network mix domain questions")
    return 0


if __name__ == "__main__":
    sys.exit(main())

