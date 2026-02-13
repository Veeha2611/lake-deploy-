# Thread Export Prompt (Use in Each Thread)

**Goal**: Export your full thread history and evidence into the intake folder for SSOT validation and GitHub staging.  
**Do not include secrets. Do not include Base44 endpoints.**

---

## Prompt (copy/paste into each thread)

You are **Thread: <THREAD_TITLE>**.  
Export **all** of your work into:

`/Users/patch/lake_deploy/intake/threads_inbox_2026-02-12/<THREAD_FOLDER>/`

Where `<THREAD_FOLDER>` is a short, stable slug (e.g. `01_intacct_gl_backfill`).

### Required files (all must exist)
1) `summary.md`
   - What you did
   - What is blocked
   - Next steps (explicit)

2) `evidence/index.md`
   - Local evidence paths
   - S3 evidence paths (with dt / run_date)
   - All QIDs used

3) `qids.tsv`
4) `athena_values.json`
5) `status.json` (PASS/FAIL + timestamp + notes)
6) `files_changed.txt` (repo‑relative paths)
7) `commands_run.txt` (timestamped commands)
8) `s3_paths.txt` (all S3 prefixes touched)

### Rules
- **No secrets** (tokens, passwords, API keys, cookies).
- **No Base44 endpoints** in AWS‑only mode.
- Only include **lake‑derived evidence**.

### If you modified code
Include:
- `diff_summary.md` (brief diff description)
- `tests_run.txt` (even if “not run”)

### Finish
Confirm the folder is complete and ready for SSOT review.

---

## Additional Deliverables (Infrastructure Requirements)

If your thread includes GitHub documentation updates for infrastructure requirements, include these deliverables in your output (and commit them only after sanitization passes):

- Create `docs/ACCESS_AND_ENVIRONMENT.md`:
  - AWS account access, role model, MFA
  - services required, regions
  - migration constraints (Mac Mountain -> LightCraft)
  - least-privilege roles (avoid blanket admin)

- Create `docs/CI_CD_AND_TERRAFORM_BACKEND.md`:
  - GitHub repo permissions and branch protection expectations
  - CI/CD model
  - Terraform remote state backend (S3 + encryption + versioning + locking)
  - environment separation strategy
  - required secret names (names only)

- Create `docs/OBSERVABILITY_AND_ALERTING.md`:
  - CloudWatch logs/alarms/dashboards
  - CloudTrail audit logging
  - alerting for pipeline failures, DQ breaches, and reconciliation variance

- Update `docs/IAC_KICKOFF_BRIEF.md`:
  - Add a one-page "Access Checklist" section that links to the three docs above.

Before committing:
- Run `./scripts/sanitize_scan.sh` and confirm PASS.

---

## Additional Deliverables (MAC AI Console / Network Mix Domain)

If your thread modifies the MAC AI Console routing, templates, or workbook-parity behavior (Network Mix / Customer Mix / Revenue Mix), include these deliverables in your output:

1) `domain_registry.md`
   - Finite domain registry + canonical metric definitions.
   - Explicit grain (subscriptions vs billed customers vs passings).
   - Explicit filters, source views, and known gaps.

2) `question_matrix.csv` (or `.md`)
   - Exhaustive question matrix for the domain:
     - count / list / revenue / % mix / inclusion-exclusion / drill-down variants
   - For each row: expected `question_id` + required params.

3) `routing_rules.md`
   - Deterministic normalization rules used for routing (no fuzzy guessing).
   - Explicit fail-closed cases (ambiguous grain/segment).

4) `tests_run.txt`
   - Include the domain regression suite result (PASS/FAIL) and command used.

Rules:
- Do not require the user to type “workbook”.
- If a question is ambiguous on grain (e.g., “customers”), fail closed with:
  - `NOT SUPPORTED YET: ...`
  - `NEXT STEP: ...`
- Any mismatch to workbook logic must be recorded as a gap with an explicit next step (ingest/model/export fix).
