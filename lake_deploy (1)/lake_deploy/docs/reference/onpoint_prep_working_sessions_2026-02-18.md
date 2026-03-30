# OnPoint Working Session Prep (From 2026-02-16 Transcripts)

Source transcripts:
- `/Users/patch/Downloads/08_00_am_-_microsoft_edge_meeting_february_16_transcript.txt`
- `/Users/patch/Downloads/aws_infrastructure_&_data_lake_sync_transcript.txt`

## Goals For The Next OnPoint Session
- Confirm OnPoint has the minimum AWS access needed (read-only) to inspect S3 + Glue Catalog + Athena outputs for SSOT evidence packs.
- Align on **SSOT definitions** for key tiles (MRR, customer identity, bucket summary) and how we prove them (native-vs-lake parity + evidence packs).
- Convert “data quality” into a concrete defect list: view/table, expected behavior, observed behavior, and acceptance tests.
- Establish delivery expectations: what artifacts OnPoint will produce (findings, gap list, remediation plan, validation sign-off).

## Likely Questions From OnPoint (And How To Answer)

### 1) “What are the authoritative source systems and where do they land?”
- Core sources discussed:
  - Platt billing/subscribers (legacy; being sunset, target change noted as **March 1** in the transcript).
  - Intacct accounting (target system for financial truth).
  - Salesforce (CRM; crosswalk to billing keys is “close but not perfect”).
  - Vetro (GIS/plans/passings; export/ingest is rate-limited to ~**1 plan/hour**).
  - Gaiia (support/ticketing + operational events; not treated as sole SSOT identity key).
  - Twilio (not yet ingested to lake; future candidate for call/email event telemetry).
  - NetBox (inventory; came later and may need explicit inclusion in the source list).
- Lake structure framing that was discussed:
  - Raw landings in S3 under a system-specific prefix tree.
  - Cataloging via Glue crawlers, then query via Athena.
  - Curated outputs + recon tables feed SSOT-aligned views/tiles with evidence packs.

### 2) “What do you mean by ‘data quality’ and what’s broken?”
- The request from OnPoint was to narrow “data quality” into:
  - Specific view/table(s) with issues.
  - Exact failure mode (stale partition, zero rows, cast errors, join gaps).
  - Evidence pack or QID showing the issue.
- Practical approach:
  - Use SSOT gates + per-tile audits to produce a short punch list.
  - Track those items in Monday (board referenced in the transcript).

### 3) “How do you prove SSOT / parity without trusting the pipeline?”
- For Intacct specifically, the approach is:
  - Derive truth from **native Intacct** (`readByQuery totalcount` + scoped window probes).
  - Independently derive lake state by scanning landed JSON + metadata.
  - Compare native vs lake counts and enumerate missing windows.
  - Produce an evidence pack with timestamps and identifiers (controlids, QIDs).
- This is explicitly different from “ingestion task succeeded” and was a core theme in the transcripts.

### 4) “What about identity across systems (Salesforce ↔ billing ↔ Intacct)?”
- Key point from transcript:
  - Salesforce has ~33k rows and there was a ~697 delta that couldn’t be crosswalked (near-complete but not perfect).
- How to frame it:
  - SSOT customer identity is multi-scope: billing customers, service customers, subscriptions/network mix, SSOT counts.
  - Crosswalk is treated as a governed join with explicit mapped/unmapped behavior (no silent drops).

### 5) “Why do Owned/Contracted buckets disagree with a manual spreadsheet?”
- This came up as the core mismatch theme: automated logic not matching a manual SoT spreadsheet.
- The technical reconciliation path discussed is:
  - Platt: extract active subscribers + system/network identifier + MRR.
  - Vetro: extract passings (physical network / plan-derived).
  - Use system/network mapping to bucket customers into networks and apply “as-built”/ownership rules.

## Likely Walkthrough Agenda (30–60 minutes)
- Show: `docs/` in `lake_deploy` (architecture/governance/runbooks) as the starting map.
- Show: S3 raw layout (read-only): where each source lands, and how to find the latest partition/run_date.
- Show: Evidence pack pattern (local + S3) for one audit (counts + QIDs + status.json).
- Review: current “known gaps” to prioritize (Intacct full-history parity, ownership/bucket parity, crosswalk residuals, Vetro rate windows).
- Confirm: OnPoint access + ability to reproduce findings independently.

## Concrete Items To Have Ready (Screenshare Checklist)
- AWS account/region context: `us-east-2`.
- S3 bucket names and the raw landing prefixes for: Platt, Salesforce AppFlow, Intacct JSON, Vetro exports.
- Athena workgroup: `primary`.
- A single recent evidence pack folder path in S3 to open during the call.
- Monday board link/board name (for OnPoint to track defects + ownership).
- Summary of what is *not yet* in the lake (e.g., Twilio, if still not ingested).

## Open Risks / Caveats To State Up Front
- Vetro ingestion is rate-limited and can delay GIS freshness; “one plan/hour” constraint was explicitly called out.
- Postal vs physical address naming differences can create “city” mismatch issues (FCC/postal vs municipal naming); expect edge cases.
- Platt is being sunset; transitional period may produce multiple identifiers and residual reconciliation work.

## What We Need From OnPoint (Ask Them Directly)
- Confirm their acceptance criteria for “mirror complete” vs “SSOT ready” per domain (Intacct, Platt, Salesforce, Vetro).
- Provide a prioritized defect list with:
  - Repro steps (SQL/QID or API probe/controlid).
  - Root-cause hypothesis.
  - Fix recommendation (ingest, crawler, schema, crosswalk rule, curated logic).
  - Validation test to close the defect.

