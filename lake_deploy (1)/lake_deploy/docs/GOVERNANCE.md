# Data Lake Governance (SSOT + IaC)

## Purpose
This document defines the **governance rules** for the `lake_deploy` data lake and the SSOT (Single Source of Truth) layer.

It is written so an IaC team can codify the infrastructure safely while preserving the existing operating logic.

## SSOT Principles (Non-Negotiable)
- **Deterministic**: joins and identities must be reproducible (no manual-only logic in the critical path).
- **Evidence-backed**: every SSOT claim must be supported by query evidence (Athena QIDs) and S3 proof artifacts.
- **Partitioned by time**: all time-series data must support incremental loads (never “one giant file”).
- **Source-parity aware**: we prove what is mirrored (and what is not) against native sources.

## Authoritative Systems By Domain
Policy source-of-truth by domain (see also: `docs/ssot/SSOT_CANONICAL_MODEL.md`).

| Domain | Primary System of Record | Secondary Inputs | Notes |
|---|---|---|---|
| Customer identity / Accounts | Salesforce | Platt, Intacct, Gaiia, Vetro | Crosswalks bind source IDs to a canonical SSOT ID. |
| Financial accounting (GL, close) | Intacct | Platt (billing detail) | Intacct remains the accounting truth; billing supports reconciliation. |
| Billing (invoices, line items, MRR) | Platt | Intacct (posting) | Platt provides invoice detail; rollups must reconcile to finance gates. |
| Network / GIS / Assets | Vetro + Gaiia | Platt (procurement context) | GIS and service location layers must be cast-safe and queryable. |
| Projects / pipeline | Salesforce (plus Monday operationalization where applicable) | Vetro | One canonical workflow per process; avoid competing “project masters”. |

## Canonical Entity Keys
All canonical SSOT entities use a stable `ssot_*_id` plus one or more source IDs.

Minimum required canonical identifiers:
- `ssot_account_id` (aka `ssot_customer_id` in some legacy contexts): customer/account identity node
- `ssot_location_id`: service location / address node
- `ssot_asset_id`: network asset node (strand, device, etc.)
- `ssot_invoice_id`: invoice identity node

Crosswalk contracts (high level):
- Every crosswalk row must declare: `source_system`, `source_id`, `ssot_*_id`, `match_rule`, `match_confidence`, `effective_at`.
- “High confidence” mappings must be **1:1** and stable across time partitions.

## Partitioning Conventions
Required partitions:
- `dt=YYYY-MM-DD`: preferred for daily snapshots and curated layers.
- `run_date=YYYY-MM-DD`: used for ingestion runs and orchestration artifacts.

Rules:
- No mixed partition keys for the same dataset.
- Do not change page size / query parameters mid-run when resuming paginated ingestions.
- Partition projection must match the physical S3 layout and be validated with repairs/checks.

## Reconciliation Tolerances (SSOT Gates)
Tolerances apply to **derived metrics and workbook reconciliation** (not to raw mirroring, which should be exact unless a tolerance is explicitly approved).

Recommended default tolerances:
- Revenue / MRR rollups: **±0.5%** (period total)
- Customer counts (active/billing): **±0.2%**
- Coverage counts (networks/plans/layers): **0%** unless explicitly documented

Any exception to these tolerances must be:
- documented with evidence paths
- time-bounded (ETA and owner)

## Freshness SLAs
These SLAs gate dashboards and SSOT status.

Recommended defaults:
- Financials (Intacct close, Platt billing): **<= 1 day lag**
- CRM (Salesforce accounts, pipeline): **<= 1 day lag**
- Operations (projects updates, tickets, ops telemetry): **<= 6 hours lag**
- GIS (Vetro layers): **<= 1 day lag**

## Evidence Requirements (What “PASS” Means)
Every SSOT audit must produce (at minimum):
- `status.json` (PASS/FAIL + timestamp + notes)
- `athena_values.json` (raw result snapshot)
- `qids.tsv` (Athena execution IDs)
- S3 evidence prefixes (dt/run_date included)

## IaC Boundaries: Codify vs Application Logic
Infrastructure codifies **where data lives**, **how it is scheduled**, **how it is secured**, and **how it is observed**.
Application logic governs **how metrics are computed and displayed**.

IaC must codify:
- S3 buckets/prefix contracts, encryption, lifecycle, access policies
- Glue databases/crawlers (where applicable) and table definitions
- Athena workgroups, output locations, and guardrails
- Orchestration runtime (Lambda/ECS/EventBridge), retries, and concurrency controls
- Secrets Manager secret *names* and IAM access (never secret values)
- CI checks (sanitization, drift detection, smoke checks)

Application logic (not IaC) includes:
- SSOT metric definitions and tile semantics
- crosswalk matching rules (SQL/ETL logic) once the infra plumbing is stable
