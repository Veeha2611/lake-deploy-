-- Network mix with billing + active services context.
-- Subscriptions + ARPU + MRR remain workbook-modeled (curated_core.v_network_health) for Customer Mix alignment.
-- Billing is exposed separately (billed_customers, mrr_billed) so UI can show both without mixing definitions.
CREATE OR REPLACE VIEW curated_recon.v_network_mix_billing_aligned_latest AS
WITH modeled AS (
  SELECT *
  FROM curated_core.v_network_health
  WHERE dt = (SELECT MAX(dt) FROM curated_core.v_network_health)
),
modeled_norm AS (
  SELECT
    network,
    network_norm,
    network_type,
    customer_type,
    passings,
    subscriptions,
    arpu,
    arpu_label,
    mrr AS mrr_modeled,
    REGEXP_REPLACE(LOWER(COALESCE(NULLIF(TRIM(network_norm), ''), NULLIF(TRIM(network), ''), 'unmapped')), '[^a-z0-9]', '') AS network_key,
    dt
  FROM modeled
),
billed AS (
  SELECT
    REGEXP_REPLACE(LOWER(COALESCE(NULLIF(TRIM(network_norm), ''), NULLIF(TRIM(network), ''), 'unmapped')), '[^a-z0-9]', '') AS network_key,
    MAX(NULLIF(TRIM(network), '')) AS network,
    MAX(period_month) AS period_month,
    SUM(billed_mrr) AS billed_mrr,
    SUM(billed_customers) AS billed_customers
  FROM curated_recon.v_network_mrr_recon_latest
  GROUP BY REGEXP_REPLACE(LOWER(COALESCE(NULLIF(TRIM(network_norm), ''), NULLIF(TRIM(network), ''), 'unmapped')), '[^a-z0-9]', '')
),
active_services AS (
  SELECT
    REGEXP_REPLACE(LOWER(COALESCE(NULLIF(TRIM(network), ''), 'unmapped')), '[^a-z0-9]', '') AS network_key,
    MAX(NULLIF(TRIM(network), '')) AS network,
    SUM(active_services) AS active_services
  FROM curated_recon.v_network_active_services_latest
  GROUP BY REGEXP_REPLACE(LOWER(COALESCE(NULLIF(TRIM(network), ''), 'unmapped')), '[^a-z0-9]', '')
),
keys AS (
  SELECT
    network_key,
    MAX(network) AS network,
    MAX(network_norm) AS network_norm,
    MAX(network_type) AS network_type,
    MAX(customer_type) AS customer_type,
    MAX(passings) AS passings,
    MAX(subscriptions) AS subscriptions,
    MAX(arpu) AS arpu,
    MAX(arpu_label) AS arpu_label,
    MAX(mrr_modeled) AS mrr_modeled,
    MAX(dt) AS modeled_dt
  FROM modeled_norm
  GROUP BY network_key

  UNION ALL
  SELECT
    network_key,
    MAX(network) AS network,
    NULL AS network_norm,
    NULL AS network_type,
    NULL AS customer_type,
    NULL AS passings,
    NULL AS subscriptions,
    NULL AS arpu,
    NULL AS arpu_label,
    NULL AS mrr_modeled,
    NULL AS modeled_dt
  FROM billed
  GROUP BY network_key

  UNION ALL
  SELECT
    network_key,
    MAX(network) AS network,
    NULL AS network_norm,
    NULL AS network_type,
    NULL AS customer_type,
    NULL AS passings,
    NULL AS subscriptions,
    NULL AS arpu,
    NULL AS arpu_label,
    NULL AS mrr_modeled,
    NULL AS modeled_dt
  FROM active_services
  GROUP BY network_key
),
dedup AS (
  SELECT
    network_key,
    MAX(network) AS network,
    MAX(network_norm) AS network_norm,
    MAX(network_type) AS network_type,
    MAX(customer_type) AS customer_type,
    MAX(passings) AS passings,
    MAX(subscriptions) AS subscriptions,
    MAX(arpu) AS arpu,
    MAX(arpu_label) AS arpu_label,
    MAX(mrr_modeled) AS mrr_modeled,
    MAX(modeled_dt) AS modeled_dt
  FROM keys
  GROUP BY network_key
)
SELECT
  COALESCE(d.network, 'Unmapped') AS network,
  d.network_norm,
  COALESCE(d.network_type, 'Unmapped') AS network_type,
  COALESCE(d.customer_type, 'Unmapped') AS customer_type,
  d.passings,
  COALESCE(d.subscriptions, a.active_services) AS subscriptions,
  a.active_services AS active_services,
  b.billed_customers,
  b.billed_mrr AS mrr_billed,
  d.arpu AS arpu,
  d.arpu_label AS arpu_label,
  COALESCE(
    d.mrr_modeled,
    CASE
      WHEN d.arpu IS NOT NULL AND COALESCE(d.subscriptions, a.active_services) IS NOT NULL
        THEN d.arpu * COALESCE(d.subscriptions, a.active_services)
      ELSE NULL
    END
  ) AS mrr_modeled,
  COALESCE(
    d.mrr_modeled,
    CASE
      WHEN d.arpu IS NOT NULL AND COALESCE(d.subscriptions, a.active_services) IS NOT NULL
        THEN d.arpu * COALESCE(d.subscriptions, a.active_services)
      ELSE NULL
    END
  ) AS mrr,
  CASE
    WHEN b.billed_customers IS NOT NULL AND b.billed_customers > 0
      THEN b.billed_mrr / b.billed_customers
    ELSE NULL
  END AS arpu_billed,
  b.period_month,
  d.modeled_dt
FROM dedup d
LEFT JOIN billed b
  ON d.network_key = b.network_key
LEFT JOIN active_services a
  ON d.network_key = a.network_key;
