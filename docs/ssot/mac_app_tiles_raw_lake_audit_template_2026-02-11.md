# MAC App Tiles Raw‑Lake SSOT Audit Template (No Views)

**Purpose**: Validate Finance KPI, Unit Economics, Operations, and Ownership tiles using **raw lake tables only**. Do **not** use curated views or workbooks. This audit proves the tiles can be derived from raw lake data with deterministic joins and evidence.

## Inputs (fill in)
- `RUN_DATE`: 2026-02-11
- `AWS_REGION`: us-east-2
- `ATHENA_WORKGROUP`: primary
- `ATHENA_OUTPUT_LOCATION`: s3://gwi-raw-us-east-2-pc/athena-results/orchestration/

## Evidence output (must exist)
- Local: `lake_deploy/ssot_audit/mac_app_tiles_raw_${RUN_DATE}/`
- S3: `s3://gwi-raw-us-east-2-pc/curated_recon/mac_app_tiles_raw_audit/dt=${RUN_DATE}/`

## Raw sources (required)
Use **raw** tables only. If a column is unclear, run `DESCRIBE` first and record the schema in evidence.

**Platt (billing + customer)**
- `raw_platt.iheader_raw` (invoice header totals; authoritative for MRR)
- `raw_platt.platt_as_billed_24m` (line items; authoritative for active subscriptions)
- `raw_platt.customer` or `raw_platt.platt_customer_snapshot_raw` (customer attributes)

**CCI (cost + tickets)**
- `raw_sheets.cci_summary`
- `raw_sheets.cci_tickets_raw`

**Vetro mapping (network ownership)**
- `raw_sheets.vetro_network_plan_map_auto`
- `raw_sheets.vetro_as_built_plan_ids`

## Phase 1 — Schema confirmation (required)
Run and save results in `schema_*.json`:
- `DESCRIBE raw_platt.iheader_raw;`
- `DESCRIBE raw_platt.platt_as_billed_24m;`
- `DESCRIBE raw_platt.customer;`
- `DESCRIBE raw_platt.platt_customer_snapshot_raw;`
- `DESCRIBE raw_sheets.cci_summary;`
- `DESCRIBE raw_sheets.cci_tickets_raw;`
- `DESCRIBE raw_sheets.vetro_network_plan_map_auto;`
- `DESCRIBE raw_sheets.vetro_as_built_plan_ids;`

If any table is missing or columns are unknown, **STOP** and record the error.

## Phase 2 — Finance KPI (raw billing only)
**Goal**: compute `latest_total_mrr`, `TTM MRR`, `YTD MRR`, and `billing_customers` from raw billing.

1) Build raw billing base at customer+month grain:
```
WITH billing_base AS (
  SELECT
    customer AS customer_id,
    DATE_PARSE(CONCAT(SUBSTR(date, 1, 7), '-01'), '%Y-%m-%d') AS period_month,
    TRY_CAST(total AS double) AS billed_mrr
  FROM raw_platt.iheader_raw
  WHERE dt = (SELECT MAX(dt) FROM raw_platt.iheader_raw)
    AND date IS NOT NULL
    AND total IS NOT NULL
  GROUP BY 1, 2
)
SELECT * FROM billing_base LIMIT 10;
```
2) Compute latest month totals + TTM + YTD:
```
WITH billing_base AS (...)
SELECT
  MAX(period_month) AS latest_month,
  SUM(CASE WHEN period_month = MAX(period_month) OVER() THEN billed_mrr ELSE 0 END) AS latest_total_mrr,
  SUM(CASE WHEN period_month >= DATE_ADD('month', -11, MAX(period_month) OVER()) THEN billed_mrr ELSE 0 END) AS ttm_mrr,
  SUM(CASE WHEN period_month >= DATE_TRUNC('year', MAX(period_month) OVER()) THEN billed_mrr ELSE 0 END) AS ytd_mrr,
  COUNT(DISTINCT CASE WHEN period_month = MAX(period_month) OVER() THEN customer_id END) AS billing_customers
FROM billing_base;
```

**Pass criteria**
- All metrics computed without NULLs.
- `billing_customers` > 0.

## Phase 3 — Active subscriptions (raw custrate)
**Goal**: compute active subscriptions from raw line items (authoritative raw source).

```
WITH latest AS (
  SELECT MAX(DATE_TRUNC('month', COALESCE(
    TRY(date_parse(invoice_date, '%Y-%m-%d %H:%i:%s.%f')),
    TRY(date_parse(invoice_date, '%Y-%m-%d'))
  ))) AS latest_month
  FROM raw_platt.platt_as_billed_24m
),
lines AS (
  SELECT
    customer_id,
    COALESCE(NULLIF(crid, ''), NULLIF(gl_item, ''), NULLIF(line_description, '')) AS service_key,
    TRY_CAST(line_amount AS double) AS line_amount,
    COALESCE(
      TRY(date_parse(invoice_date, '%Y-%m-%d %H:%i:%s.%f')),
      TRY(date_parse(invoice_date, '%Y-%m-%d'))
    ) AS invoice_dt
  FROM raw_platt.platt_as_billed_24m
  WHERE TRY_CAST(line_amount AS double) IS NOT NULL
)
SELECT
  COUNT(DISTINCT CONCAT(customer_id, '|', service_key)) AS active_subscriptions
FROM lines
WHERE line_amount > 0
  AND invoice_dt IS NOT NULL
  AND DATE_TRUNC('month', invoice_dt) = (SELECT latest_month FROM latest);
```

If any of `invoice_date`, `line_amount`, or `customer_id` is missing, **STOP** and document the missing column.

## Phase 4 — Unit economics (raw billing + raw CCI)
**Goal**: compute gross margin and A–E band distribution from raw data.

1) Build customer MRR base (use **billing_base** from Phase 2, latest month only):
```
WITH billing_base AS (...)
SELECT customer_id, SUM(billed_mrr) AS total_mrr
FROM billing_base
WHERE period_month = (SELECT MAX(period_month) FROM billing_base)
GROUP BY 1;
```
2) Join to CCI summary:
```
WITH billing_latest AS (...)
SELECT
  b.customer_id,
  b.total_mrr,
  TRY_CAST(NULLIF(REGEXP_REPLACE(c.cci_cost, '[^0-9.-]', ''), '') AS double) AS total_cci_cost,
  (b.total_mrr - TRY_CAST(NULLIF(REGEXP_REPLACE(c.cci_cost, '[^0-9.-]', ''), '') AS double)) AS gross_margin_dollars,
  CASE WHEN b.total_mrr = 0 THEN NULL ELSE (b.total_mrr - TRY_CAST(NULLIF(REGEXP_REPLACE(c.cci_cost, '[^0-9.-]', ''), '') AS double)) / b.total_mrr END AS gross_margin_pct
FROM billing_latest b
LEFT JOIN raw_sheets.cci_summary c
  ON c.guarantor = b.customer_id;
```
3) Derive A–E bands (define thresholds explicitly in SQL) and count by band.

**Pass criteria**
- All rows with MRR > 0 have non‑NULL band.
- Band totals sum to latest billed customer count.

## Phase 5 — Operations (raw tickets only)
**Goal**: compute ticket volume and burden from raw ticket feed.

Because `raw_sheets.cci_tickets_raw` is unstructured, **you must document** which columns are used and provide evidence samples.

1) Identify ticket id column and usable date column using `DESCRIBE` + sample rows.
2) Compute:
```
SELECT COUNT(*) AS total_tickets
FROM raw_sheets.cci_tickets_raw
WHERE <ticket_id_col> IS NOT NULL
  AND <ticket_id_col> <> <header_value>;
```
3) Compute ticket trend by month using either a real ticket date column **or** the ingest month `dt` if no ticket date exists. If using `dt`, record this as a limitation in `status.json`.

**Pass criteria**
- total_tickets > 0
- trend query returns non‑empty rows

## Phase 6 — Ownership (raw network mapping + raw billing)
**Goal**: bucket billed customers into owned/contracted/clec using raw mapping tables.

1) Build customer→system key mapping from raw_platt.customer or raw_platt.platt_customer_snapshot_raw.
   - If **no system key exists**, **STOP** and create a raw sheet mapping first (e.g., `raw_sheets.platt_customer_system_map_raw`).
2) Join to raw_sheets.vetro_network_plan_map_auto to map system→network/bucket.
3) Aggregate latest billed MRR by bucket:
```
WITH billing_latest AS (...),
customer_system AS (
  SELECT <customer_id_col> AS customer_id, <system_col> AS system_key
  FROM raw_platt.customer
),
network_map AS (
  SELECT system_key, network
  FROM raw_sheets.vetro_network_plan_map_auto
)
SELECT
  COALESCE(nm.network, 'Unmapped') AS bucket,
  COUNT(DISTINCT b.customer_id) AS customer_count,
  SUM(b.total_mrr) AS total_mrr
FROM billing_latest b
LEFT JOIN customer_system cs ON cs.customer_id = b.customer_id
LEFT JOIN network_map nm ON UPPER(cs.system_key) = nm.system_key
GROUP BY 1;
```

**Pass criteria**
- Buckets sum to latest billed customer count.
- Total MRR matches Phase 2 latest_total_mrr within tolerance (<= 2%).

## Evidence pack (required files)
- `schema_*.json`
- `object_integrity.tsv`
- `qids.tsv`
- `athena_values.json`
- `status.json` (PASS/FAIL + notes + limitations)

## PASS/FAIL criteria (overall)
PASS if all are true:
- Finance KPIs computed from raw billing.
- Active subscriptions computed from raw custrate.
- Unit economics banding computed from raw billing + raw CCI.
- Operations ticket totals computed from raw tickets (with documented date column).
- Ownership bucket totals align with latest billed MRR within tolerance.

FAIL if any phase is missing a required source, returns NULL metrics, or cannot be reproduced from raw lake data.
