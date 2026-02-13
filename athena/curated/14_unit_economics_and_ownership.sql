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

-- Ownership snapshot: latest-month MRR + Vetro FSA buckets.
CREATE OR REPLACE VIEW curated_core.v_bucket_summary_latest AS
WITH latest_month AS (
  SELECT MAX(period_month) AS period_month
  FROM curated_core.v_monthly_mrr_platt
),
base AS (
  SELECT
    CAST(customer_id AS varchar) AS customer_id,
    SUM(mrr_total) AS mrr_total
  FROM curated_core.v_monthly_mrr_platt
  WHERE period_month = (SELECT period_month FROM latest_month)
    AND mrr_total > 0
  GROUP BY 1
),
platt_map AS (
  SELECT
    CAST(REGEXP_REPLACE(customer_id, '\\.0$', '') AS varchar) AS customer_id,
    COALESCE(NULLIF(TRIM(gwi_system), ''), '') AS gwi_system,
    trim(regexp_replace(
      regexp_replace(
        lower(coalesce(NULLIF(TRIM(gwi_system), ''), '')),
        '\\\\([^\\\\)]*\\\\)',
        ' '
      ),
      '[^a-z0-9]+',
      ' '
    )) AS gwi_system_norm
  FROM curated_recon.platt_customer_system_map
),
gwi_map_norm AS (
  SELECT
    trim(regexp_replace(lower(gwi_system_norm), '\\\\s+', ' ')) AS gwi_system_norm,
    network AS network_name,
    LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(network, '[^A-Za-z0-9]+', ' '), '\\\\s+', ' '))) AS network_norm_key
  FROM curated_recon.gwi_system_network_map
),
network_map AS (
  SELECT
    network,
    plan_id,
    plan_name,
    LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(network, '[^A-Za-z0-9]+', ' '), '\\\\s+', ' '))) AS network_norm_key
  FROM raw_sheets.vetro_network_plan_map_auto
),
as_built AS (
  SELECT
    CAST(plan_id AS varchar) AS plan_id,
    LOWER(plan_label) AS plan_label
  FROM raw_sheets.vetro_as_built_plan_ids
),
bucketed AS (
  SELECT
    b.customer_id,
    b.mrr_total,
    pm.gwi_system,
    gm.network_name,
    nm.plan_id,
    nm.plan_name,
    CASE
      WHEN nm.plan_id IS NOT NULL AND CAST(nm.plan_id AS varchar) IN (SELECT plan_id FROM as_built) THEN 'owned_fttp'
      WHEN nm.plan_name IS NOT NULL AND LOWER(nm.plan_name) IN (SELECT plan_label FROM as_built) THEN 'owned_fttp'
      WHEN LOWER(COALESCE(nm.network, gm.network_name, pm.gwi_system, '')) LIKE '%copper%' THEN 'clec_business'
      WHEN gm.network_name IS NULL THEN 'unmapped'
      ELSE 'contracted_fttp'
    END AS bucket
  FROM base b
  LEFT JOIN platt_map pm
    ON b.customer_id = pm.customer_id
  LEFT JOIN gwi_map_norm gm
    ON trim(regexp_replace(pm.gwi_system_norm, '\\\\s+', ' ')) = gm.gwi_system_norm
  LEFT JOIN network_map nm
    ON nm.network_norm_key = gm.network_norm_key
),
mrr_by_bucket AS (
  SELECT
    bucket,
    COUNT(DISTINCT customer_id) AS customer_count,
    SUM(mrr_total) AS total_mrr
  FROM bucketed
  GROUP BY bucket
),
fsa_by_bucket AS (
  SELECT
    bucket,
    COUNT(DISTINCT fsa_id) AS fsa_count
  FROM curated_core.v_vetro_fsa_tagged
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
FROM mrr_by_bucket m
LEFT JOIN fsa_by_bucket f
  ON m.bucket = f.bucket
ORDER BY CASE m.bucket WHEN 'owned_fttp' THEN 1 WHEN 'contracted_fttp' THEN 2 ELSE 3 END;
