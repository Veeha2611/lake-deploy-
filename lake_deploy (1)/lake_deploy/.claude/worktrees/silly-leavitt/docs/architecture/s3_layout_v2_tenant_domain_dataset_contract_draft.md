# S3 Layout v2 (Tenant/Domain/Dataset) — Draft

Status: DRAFT (do not treat as a production contract until approved)

## Objective
Define a consistent, AWS-aligned S3 naming and partitioning convention that:
- enforces clear layer boundaries (raw vs curated vs presentation)
- supports multi-tenant operation (GWI + acquired/partner networks)
- is deterministic for ingestion and replay
- is easy to catalog (Glue) and query (Athena) without scanning entire buckets

## Buckets (Layer Separation)
Use a separate bucket per layer:

- Raw / Landing:
  - `s3://mm-dl-raw-<region>-<accountid>/`
  - Intended contents: immutable source extracts, append-only ingestion runs.

- Curated:
  - `s3://mm-dl-curated-<region>-<accountid>/`
  - Intended contents: conformed datasets, SSOT-ready models, reconciliations.

- Presentation:
  - `s3://mm-dl-presentation-<region>-<accountid>/`
  - Intended contents: tile-ready snapshots, exports, user-facing reports.

Notes:
- Account/region suffixes allow safe parallel environments and avoid bucket name collisions.
- If multiple environments are required (dev/stage/prod), choose one:
  - Option A: separate accounts (preferred)
  - Option B: suffix bucket names (e.g. `...-prod`, `...-stage`) and enforce strict IAM boundaries

## Path Template (Inside Each Bucket)
All datasets must conform to:

`<tenant>/<domain>/<dataset>/ingestion_year=YYYY/ingestion_month=MM/ingestion_day=DD/run_id=<run_id>/...`

Where:
- `tenant` is one of:
  - `gwi`, `dvfiber`, `lymefiber`, `nwfx`, `lightcraft`
- `domain` is a controlled vocabulary (examples below)
- `dataset` is a stable snake_case identifier
- `run_id` is required for replay safety and determinism

### Recommended `run_id` formats
Choose one consistent format (do not mix formats within a dataset):
- Daily schedule: `run_id=YYYY-MM-DD`
- Backfill window: `run_id=backfill_<YYYY-MM-DD>_<YYYY-MM-DD>_<seq>`
- API pagination export: `run_id=resultid_full_<YYYY-MM-DD>_<YYYY-MM-DD>_ps<pagesize>`
- Ad hoc/manual: `run_id=manual_<YYYYMMDDTHHMMSSZ>_<operator>`

## Partitioning Rules
1. Partition by ingestion date only:
   - `ingestion_year`, `ingestion_month`, `ingestion_day`
2. Store business/event date as a column in the data:
   - recommended: `event_dt` (date) and/or `event_ts` (timestamp)
3. Never overwrite a prior `run_id` path:
   - re-runs must use a new `run_id` value (or `run_seq=...`), even if the ingestion date is the same.

Rationale:
- ingestion partitions model how data arrives (freshness + replay)
- event dates model how the business happened (analytics)
- `run_id` prevents accidental double-count or overwrite collisions

## File Format Rules (By Layer)
Raw:
- Prefer compressed newline-delimited JSON (JSONL/NDJSON) or delimited text with compression.
- If JSON, standardize on one-record-per-line.
- Large exports should be chunked (avoid single multi-GB objects where possible).

Curated:
- Prefer columnar formats (Parquet) with stable schemas.
- Use explicit schema evolution rules (additive preferred, breaking changes gated).

Presentation:
- Use Parquet for snapshot tables; CSV/XLSX only for explicit exports.

## Domain Vocabulary (Draft)
Suggested domains (expand as needed):
- `billing` (Platt/Intacct financial + subscription facts)
- `crm` (Salesforce entities)
- `network` (network mix, passings, service locations, plans)
- `oss` (operational support systems like Gaiia tickets/outages)
- `contact_center` (IVR/call/email telemetry, e.g., Twilio)
- `infra` (inventory systems like NetBox)
- `infra_logs` (CloudTrail/CloudWatch/app logs if intentionally retained)

## Dataset Naming Rules
- snake_case
- avoid vendor names unless necessary for disambiguation
- include the source system as a suffix when multiple sources produce similar entities:
  - examples: `customer_salesforce`, `customer_platt`, `customer_intacct`

## Concrete Examples (Mapped From Current Lake)
These examples show how existing sources map into v2.

### Intacct (Accounting)
Raw:
- `gwi/billing/intacct_glentry_json/ingestion_year=YYYY/ingestion_month=MM/ingestion_day=DD/run_id=resultid_full_YYYY-MM-DD_YYYY-MM-DD_ps2000/part-*.jsonl.gz`
- `gwi/billing/intacct_apbill_json/...`

Curated:
- `gwi/billing/intacct_glentry/ingestion_year=.../run_id=.../part-*.parquet`
- `gwi/billing/intacct_exceptions/...` (reconciliation outputs)

Notes:
- Preserve native scope windows in `run_id` for deterministic mirror audits.

### Platt (Legacy Billing / Subscribers)
Raw:
- `gwi/billing/platt_billing_fact/.../run_id=YYYY-MM-DD/billing_fact.csv.gz`
- `gwi/billing/platt_iheader/.../run_id=YYYY-MM-DD/iheader.psv.gz`
- `gwi/billing/platt_customer/...`
- `gwi/billing/platt_custrate/...`

Curated:
- `gwi/billing/mrr_monthly/...`
- `gwi/billing/subscriptions_current/...`

Notes:
- If Platt native requires VPN, v2 should still keep raw landings immutable and auditable.

### Salesforce (CRM)
Raw:
- `gwi/crm/salesforce_account/.../run_id=YYYY-MM-DD/account.jsonl.gz`
- `gwi/crm/salesforce_contract/...`
- `gwi/crm/salesforce_opportunity/...`

Notes:
- AppFlow currently lands into `year/month/day`; v2 should normalize to `ingestion_year/month/day`.

### Vetro (GIS / Plans / Passings)
Raw:
- `gwi/network/vetro_plan_export/.../run_id=plan_id_<id>_<YYYYMMDDTHHMMSSZ>/...`
- `gwi/network/vetro_plans_list/.../run_id=YYYY-MM-DD/plan_ids.json`

Curated:
- `gwi/network/passings/...`
- `gwi/network/service_locations/...`

Notes:
- Vetro rate limits imply `run_id` should encode plan scope and time to support safe resumption.

### Gaiia (Tickets / Outages)
Raw:
- `gwi/oss/gaiia_tickets/.../run_id=YYYY-MM-DD/...`
- `gwi/oss/gaiia_outages/.../run_id=YYYY-MM-DD/...`

## Glue/Athena Expectations
- Each dataset should map to exactly one Glue table per layer.
- Partition keys for all tables should be consistent:
  - `tenant`, `ingestion_year`, `ingestion_month`, `ingestion_day`, `run_id`
- Downstream SSOT views/tiles must filter by ingestion partition to avoid full scans.

## Migration Plan (Non-Breaking)
1. Create the three buckets and IAM boundaries (read/write roles by layer).
2. Pick one source (Salesforce or Platt) and dual-write for 1–2 cycles:
   - legacy prefix continues (no breakage)
   - v2 prefix populated for validation
3. Add parallel Glue tables for v2 datasets and validate parity.
4. Cut curated/presentation consumers over only after parity passes.
5. Deprecate legacy prefixes after all readers are migrated.

