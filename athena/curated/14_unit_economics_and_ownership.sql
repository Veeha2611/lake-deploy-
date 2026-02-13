-- Unit economics + ownership refresh (SSOT-aligned).

-- Unit economics: use latest-month Platt MRR as authoritative base
-- (sourced from curated_core.v_monthly_mrr_platt / as-billed parquet),
-- then enrich with CCI cost + ticket burden.
CREATE OR REPLACE VIEW curated_core.v_customer_margin_plus_tickets AS
WITH latest_month AS (
  SELECT MAX(period_month) AS period_month
  FROM curated_core.v_monthly_mrr_platt
),
latest_mrr AS (
  SELECT
    CAST(customer_id AS varchar) AS customer_id,
    SUM(mrr_total) AS total_mrr
  FROM curated_core.v_monthly_mrr_platt
  WHERE period_month = (SELECT period_month FROM latest_month)
    AND mrr_total > 0
  GROUP BY 1
),
cci AS (
  SELECT
    CAST(acctnumber AS varchar) AS customer_id,
    acctnumber,
    account_name,
    total_cci_cost,
    partner_pct,
    hosted_pbx_flag,
    distance_miles,
    ticket_count_sf,
    truck_rolls_sf,
    type_ii_flag,
    shared_type_ii_flag
  FROM curated_core.cci_summary_norm
),
dim AS (
  SELECT
    CAST(customer_id AS varchar) AS customer_id,
    customer_name,
    invoice_line_count
  FROM curated_core.dim_customer_platt_v1_1
),
tickets AS (
  SELECT
    CAST(customer_id AS varchar) AS customer_id,
    ticket_count_lake,
    ticket_burden_band
  FROM curated_core.v_ticket_burden_banded
)
SELECT
  m.customer_id,
  COALESCE(d.customer_name, c.account_name) AS customer_name,
  d.invoice_line_count AS crid_count,
  c.acctnumber AS cci_acctnumber,
  c.account_name AS cci_account_name,
  m.total_mrr,
  c.total_cci_cost,
  c.partner_pct,
  c.hosted_pbx_flag,
  c.distance_miles,
  c.ticket_count_sf,
  c.truck_rolls_sf,
  c.type_ii_flag,
  c.shared_type_ii_flag,
  (m.total_mrr - c.total_cci_cost) AS gross_margin_dollars,
  CASE
    WHEN m.total_mrr IS NULL OR m.total_mrr = 0 THEN NULL
    ELSE (m.total_mrr - c.total_cci_cost) / m.total_mrr
  END AS gross_margin_pct,
  COALESCE(t.ticket_count_lake, 0) AS ticket_count_lake,
  COALESCE(t.ticket_burden_band, U&'0 \2013 no tickets') AS ticket_burden_band
FROM latest_mrr m
LEFT JOIN dim d
  ON d.customer_id = m.customer_id
LEFT JOIN cci c
  ON c.customer_id = m.customer_id
LEFT JOIN tickets t
  ON t.customer_id = m.customer_id;

-- Ownership snapshot: investor workbook network mix (subscriptions + modeled MRR) joined to Vetro FSA buckets.
-- This is the same conceptual grouping as the Network Mix dashboard (Owned FTTP / Contracted / CLEC).
CREATE OR REPLACE VIEW curated_core.v_bucket_summary_latest AS
WITH latest_nh AS (
  SELECT MAX(dt) AS dt
  FROM curated_core.v_network_health
),
mix_by_bucket AS (
  SELECT
    CASE
      WHEN network_type = 'Owned FTTP' THEN 'owned_fttp'
      WHEN network_type = 'Contracted' THEN 'contracted_fttp'
      WHEN network_type = 'CLEC' THEN 'clec_business'
      ELSE 'unmapped'
    END AS bucket,
    CAST(SUM(COALESCE(subscriptions, 0)) AS bigint) AS customer_count,
    SUM(COALESCE(mrr, 0)) AS total_mrr
  FROM curated_core.v_network_health
  WHERE dt = (SELECT dt FROM latest_nh)
    AND network <> 'Unmapped'
    AND network_type IN ('Owned FTTP', 'Contracted', 'CLEC')
  GROUP BY 1
),
fsa_by_bucket AS (
  SELECT
    bucket,
    COUNT(DISTINCT fsa_id) AS fsa_count
  FROM curated_core.v_vetro_fsa_tagged
  WHERE bucket IN ('owned_fttp', 'contracted_fttp', 'clec_business')
  GROUP BY bucket
)
SELECT
  m.bucket,
  COALESCE(f.fsa_count, 0) AS fsa_count,
  m.customer_count,
  m.total_mrr,
  CASE
    WHEN m.customer_count > 0 THEN m.total_mrr / m.customer_count
    ELSE NULL
  END AS revenue_per_customer
FROM mix_by_bucket m
LEFT JOIN fsa_by_bucket f
  ON m.bucket = f.bucket
ORDER BY CASE m.bucket WHEN 'owned_fttp' THEN 1 WHEN 'contracted_fttp' THEN 2 ELSE 3 END;
