# OnPoint Task Order (AWS Resources First) — 2026-02-18

This is the recommended sequence for OnPoint to validate the lake end-to-end and produce a deterministic findings + remediation plan.

Scope: read-only verification + evidence capture (no DDL/DML, no destructive actions).  
Region: `us-east-2`

## Output Expectations (What To Deliver Back)
1. A short findings report (PASS/FAIL per domain: Platt, Intacct, Salesforce, Vetro, Gaiia, SSOT orchestration).
2. A gap list with deterministic closure steps (exact missing partitions/windows, exact jobs to run, and validation query IDs).
3. Evidence pointers (S3 prefixes + Athena QIDs + Glue crawler last status).

## Task Order

### 1) Access + Guardrails (Gate)
Goal: prove you can observe the system without expanding privileges.

Collect:
- AWS account ID you are operating in (expected `702127848627`).
- Your principal identity/role name.
- Confirm read-only access works for: S3, Glue, Athena, EventBridge, AppFlow, Lambda/ECS metadata.

### 2) S3 (Source Of Record)
Goal: confirm data lands where the contracts say it lands, and it is partitioned/organized correctly.

Focus bucket:
- `gwi-raw-us-east-2-pc`

Focus prefixes:
- `raw/` (ingested source landings)
- `curated_core/` and `curated_recon/` (curated + reconciliation outputs)
- `orchestration/` (manifests / run_date outputs)
- `athena-results/orchestration/` (Athena outputs used for evidence)

Collect:
- Latest partitions or run identifiers for each system prefix.
- Object sizes for the latest partitions (sanity for “too small/too large” anomalies).

### 3) Glue Data Catalog + Crawlers (Raw → Catalog)
Goal: confirm tables/partitions will be discoverable via Athena.

Collect:
- Crawler name, schedule, state, last crawl status/time.
- Databases/tables created for: Intacct JSON, Platt, Salesforce AppFlow, Vetro, Gaiia.

PASS if:
- In-scope crawlers are `READY`.
- Last crawl is `SUCCEEDED` recently (typically within 48 hours for daily sources).

### 4) Athena (Queryability + Partition Freshness)
Goal: validate the data is queryable and partitions are current.

Collect:
- Workgroup used (expected `primary`).
- For each key domain table, record: `COUNT(*)`, latest partition date, and QID.

PASS if:
- Queries succeed.
- Counts are non-zero where expected.
- “Latest partition” matches the source freshness expectations.

### 5) EventBridge Schedules (Automation)
Goal: confirm ingestion and curation are actually scheduled and enabled.

Collect:
- Rule name, state, schedule expression.
- Targets for each rule (Lambda/ECS/StepFunction) and their configuration.

PASS if:
- Rules exist, are `ENABLED`, and targets resolve to real compute.

### 6) Salesforce AppFlow (Native → Lake Landings)
Goal: confirm Salesforce-to-S3 is active and writing to the expected prefixes.

Collect:
- Flow status, trigger type/schedule, destination S3 prefix.
- Latest day partition object sizes and row counts (by JSONL line count if applicable).

PASS if:
- Prod flows are `Active` and scheduled.
- Destination prefixes match the documented `raw/salesforce_prod_appflow/...` layout.

### 7) Native-vs-Lake Mirrors (Deterministic Parity)
Goal: prove or disprove that the lake is a like-for-like mirror of native systems.

Intacct:
- Use `intacct/credentials` (Secrets Manager) and native `readByQuery` totalcount as the authoritative baseline.
- Compare to landed JSON metadata (`record_count`) in S3.
- For GLENTRY, verify coverage windows and enumerate gaps (do not trust “ingest succeeded” alone).

Platt:
- Verify that lake raw matches Platt-native counts/timelines (requires VPN connectivity if Platt native is not reachable).

Salesforce:
- Compare Salesforce `COUNT()` to S3 JSONL line counts for the latest partitions (read-only).

### 8) SSOT Orchestration + Evidence-Pack Pattern
Goal: ensure every “SSOT claim” can be backed by an evidence pack.

Collect:
- Evidence pack layout (local folder structure is optional; S3 is required).
- For a representative tile/query, capture: executed SQL, QID, sources, and freshness section.

PASS if:
- For each audited claim, there is a reproducible evidence pointer (QID + S3 location).

## Notes / Constraints To Expect
- Large objects: do not attempt to line-count multi-GB JSON in-flight; use metadata counts.
- Some domains are rate-limited (e.g., Vetro exports) and may lag; record as constraints, not “mystery failures”.
- Secrets must never be printed; validate existence by name and last-changed date only.

