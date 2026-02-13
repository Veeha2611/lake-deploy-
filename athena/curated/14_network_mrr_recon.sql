CREATE DATABASE IF NOT EXISTS curated_recon;

-- Reconcile billed MRR (Platt) to modeled network MRR (Vetro SSOT).
-- Provides network-level alignment + unmapped coverage for SSOT audit.
CREATE OR REPLACE VIEW curated_recon.v_network_mrr_recon_latest AS
WITH latest_period AS (
  SELECT MAX(period_month) AS period_month
  FROM curated_core.v_platt_billing_customer_month_latest
  WHERE mrr_total_customer_month > 0
),
billed_base AS (
  SELECT
    customer_id,
    period_month,
    mrr_total_customer_month AS mrr_total
  FROM curated_core.v_platt_billing_customer_month_latest
  WHERE mrr_total_customer_month > 0
    AND period_month = (SELECT period_month FROM latest_period)
),
billed_by_network AS (
  SELECT
    REGEXP_REPLACE(LOWER(COALESCE(cs.network, 'unmapped')), '[^a-z0-9]', '') AS network_key,
    MAX(cs.network) AS network,
    MAX(cs.system_key) AS system_key,
    MAX(cs.mapping_status) AS mapping_status,
    MAX(b.period_month) AS period_month,
    SUM(b.mrr_total) AS billed_mrr,
    COUNT(DISTINCT b.customer_id) AS billed_customers,
    SUM(CASE WHEN cs.network IS NULL THEN 1 ELSE 0 END) AS billed_customers_unmapped,
    SUM(CASE WHEN cs.network IS NULL THEN b.mrr_total ELSE 0 END) AS billed_mrr_unmapped
  FROM billed_base b
  LEFT JOIN curated_core.dim_customer_system_latest cs
    ON CAST(b.customer_id AS varchar) = CAST(cs.customer_id AS varchar)
  GROUP BY REGEXP_REPLACE(LOWER(COALESCE(cs.network, 'unmapped')), '[^a-z0-9]', '')
),
modeled AS (
  SELECT
    REGEXP_REPLACE(LOWER(COALESCE(network_norm, network)), '[^a-z0-9]', '') AS network_key,
    MAX(network) AS network,
    MAX(network_norm) AS network_norm,
    MAX(dt) AS modeled_dt,
    SUM(subscriptions) AS modeled_subscriptions,
    SUM(mrr) AS modeled_mrr,
    AVG(arpu) AS modeled_arpu
  FROM curated_core.v_network_health
  WHERE dt = (SELECT MAX(dt) FROM curated_core.v_network_health)
  GROUP BY REGEXP_REPLACE(LOWER(COALESCE(network_norm, network)), '[^a-z0-9]', '')
)
SELECT
  COALESCE(b.network_key, m.network_key) AS network_key,
  COALESCE(b.network, m.network) AS network,
  m.network_norm,
  b.system_key,
  b.mapping_status,
  b.period_month,
  m.modeled_dt,
  b.billed_mrr,
  b.billed_customers,
  b.billed_customers_unmapped,
  b.billed_mrr_unmapped,
  m.modeled_subscriptions,
  m.modeled_mrr,
  m.modeled_arpu,
  CASE
    WHEN m.modeled_mrr IS NOT NULL AND b.billed_mrr IS NOT NULL THEN b.billed_mrr - m.modeled_mrr
    ELSE NULL
  END AS mrr_delta,
  CASE
    WHEN m.modeled_mrr IS NOT NULL AND b.billed_mrr IS NOT NULL AND m.modeled_mrr <> 0
      THEN b.billed_mrr / m.modeled_mrr
    ELSE NULL
  END AS billed_to_modeled_ratio
FROM billed_by_network b
FULL OUTER JOIN modeled m
  ON b.network_key = m.network_key;

-- Exceptions for SSOT audit (billed MRR without system/network mapping).
CREATE OR REPLACE VIEW curated_recon.v_network_mrr_recon_exceptions AS
WITH latest_period AS (
  SELECT MAX(period_month) AS period_month
  FROM curated_core.v_platt_billing_customer_month_latest
  WHERE mrr_total_customer_month > 0
),
billed_base AS (
  SELECT
    customer_id,
    period_month,
    mrr_total_customer_month AS mrr_total
  FROM curated_core.v_platt_billing_customer_month_latest
  WHERE mrr_total_customer_month > 0
    AND period_month = (SELECT period_month FROM latest_period)
),
modeled_keys AS (
  SELECT DISTINCT
    REGEXP_REPLACE(LOWER(COALESCE(network_norm, network)), '[^a-z0-9]', '') AS network_key
  FROM curated_core.v_network_health
  WHERE dt = (SELECT MAX(dt) FROM curated_core.v_network_health)
)
SELECT
  b.customer_id,
  b.period_month,
  b.mrr_total,
  cs.gwi_system,
  cs.network,
  cs.system_key,
  cs.mapping_status,
  CASE
    WHEN cs.network IS NULL OR TRIM(cs.network) = '' THEN 'MISSING_NETWORK_MAP'
    WHEN mk.network_key IS NULL THEN 'NETWORK_NOT_IN_MODEL'
    ELSE 'OK'
  END AS exception_reason
FROM billed_base b
LEFT JOIN curated_core.dim_customer_system_latest cs
  ON CAST(b.customer_id AS varchar) = CAST(cs.customer_id AS varchar)
LEFT JOIN modeled_keys mk
  ON REGEXP_REPLACE(LOWER(COALESCE(cs.network, '')), '[^a-z0-9]', '') = mk.network_key
WHERE cs.network IS NULL OR TRIM(cs.network) = '' OR mk.network_key IS NULL;

-- Summary rollup for quick inspection.
CREATE OR REPLACE VIEW curated_recon.v_network_mrr_recon_summary AS
SELECT
  MAX(period_month) AS period_month,
  MAX(modeled_dt) AS modeled_dt,
  SUM(billed_mrr) AS billed_mrr_total,
  SUM(modeled_mrr) AS modeled_mrr_total,
  SUM(billed_customers) AS billed_customers,
  SUM(modeled_subscriptions) AS modeled_subscriptions,
  SUM(billed_customers_unmapped) AS billed_customers_unmapped,
  SUM(billed_mrr_unmapped) AS billed_mrr_unmapped
FROM curated_recon.v_network_mrr_recon_latest;
