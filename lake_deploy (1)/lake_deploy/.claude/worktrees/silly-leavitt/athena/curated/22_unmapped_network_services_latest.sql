-- Unmapped network services (Platt SSOT) for reconciliation.
CREATE OR REPLACE VIEW curated_recon.v_unmapped_network_services_latest AS
WITH active_platt AS (
  SELECT customer_id
  FROM curated_core.dim_customer_platt
  WHERE has_active_service = true
    AND is_test_internal = false
),
platt_map AS (
  SELECT
    CAST(regexp_replace(pm.customer_id, '\\.0$', '') AS varchar) AS customer_id,
    COALESCE(NULLIF(TRIM(pm.gwi_system), ''), NULLIF(TRIM(pc.gwi_system), '')) AS gwi_system
  FROM curated_recon.platt_customer_system_map pm
  LEFT JOIN curated_core.platt_customer_current_ssot pc
    ON CAST(regexp_replace(pm.customer_id, '\\.0$', '') AS varchar) = CAST(pc.id AS varchar)
),
norm AS (
  SELECT
    pm.gwi_system,
    trim(regexp_replace(
      regexp_replace(lower(coalesce(pm.gwi_system, '')), '\\([^\\)]*\\)', ' '),
      '[^a-z0-9]+',
      ' '
    )) AS gwi_system_norm,
    ap.customer_id
  FROM active_platt ap
  LEFT JOIN platt_map pm
    ON CAST(ap.customer_id AS varchar) = CAST(pm.customer_id AS varchar)
),
mapped AS (
  SELECT
    n.gwi_system,
    n.gwi_system_norm,
    n.customer_id,
    gm.network
  FROM norm n
  LEFT JOIN (
    SELECT trim(regexp_replace(lower(gwi_system_norm), '\\s+', ' ')) AS gwi_system_norm,
           network
    FROM curated_recon.gwi_system_network_map
  ) gm
    ON n.gwi_system_norm = gm.gwi_system_norm
),
map_keys AS (
  SELECT DISTINCT trim(regexp_replace(lower(gwi_system_norm), '\\s+', ' ')) AS gwi_system_norm
  FROM curated_recon.gwi_system_network_map
  WHERE network IS NOT NULL AND TRIM(network) <> ''
),
mapped_keys AS (
  SELECT
    gwi_system,
    trim(regexp_replace(coalesce(gwi_system_norm, ''), '\\s+', ' ')) AS gwi_system_norm,
    customer_id,
    network
  FROM mapped
),
billing AS (
  -- Use curated monthly MRR (parquet) instead of raw invoice detail to keep this view fast enough
  -- for interactive use (Dashboards + AI Console).
  SELECT
    customer_id,
    mrr_total AS mrr,
    period_month
  FROM curated_core.v_monthly_mrr_platt
  WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
)
SELECT
  COALESCE(NULLIF(TRIM(gwi_system), ''), '(blank)') AS gwi_system,
  COUNT(DISTINCT mk.customer_id) AS active_services,
  SUM(CASE WHEN b.mrr IS NOT NULL AND b.mrr > 0 THEN 1 ELSE 0 END) AS billed_customers,
  SUM(b.mrr) AS billed_mrr,
  MAX(b.period_month) AS period_month
FROM mapped_keys mk
LEFT JOIN map_keys k
  ON mk.gwi_system_norm = k.gwi_system_norm
LEFT JOIN billing b
  ON CAST(b.customer_id AS varchar) = CAST(mk.customer_id AS varchar)
WHERE mk.gwi_system_norm IS NULL
   OR mk.gwi_system_norm = ''
   OR k.gwi_system_norm IS NULL
GROUP BY COALESCE(NULLIF(TRIM(gwi_system), ''), '(blank)');

-- Unmapped customer detail (for reconciliation review)
CREATE OR REPLACE VIEW curated_recon.v_unmapped_network_customers_latest AS
WITH active_platt AS (
  SELECT customer_id
  FROM curated_core.dim_customer_platt
  WHERE has_active_service = true
    AND is_test_internal = false
),
platt_map AS (
  SELECT
    CAST(regexp_replace(pm.customer_id, '\\.0$', '') AS varchar) AS customer_id,
    COALESCE(NULLIF(TRIM(pm.gwi_system), ''), NULLIF(TRIM(pc.gwi_system), '')) AS gwi_system
  FROM curated_recon.platt_customer_system_map pm
  LEFT JOIN curated_core.platt_customer_current_ssot pc
    ON CAST(regexp_replace(pm.customer_id, '\\.0$', '') AS varchar) = CAST(pc.id AS varchar)
),
norm AS (
  SELECT
    pm.gwi_system,
    trim(regexp_replace(
      regexp_replace(lower(coalesce(pm.gwi_system, '')), '\\([^\\)]*\\)', ' '),
      '[^a-z0-9]+',
      ' '
    )) AS gwi_system_norm,
    ap.customer_id
  FROM active_platt ap
  LEFT JOIN platt_map pm
    ON CAST(ap.customer_id AS varchar) = CAST(pm.customer_id AS varchar)
),
mapped AS (
  SELECT
    n.gwi_system,
    n.gwi_system_norm,
    n.customer_id,
    gm.network
  FROM norm n
  LEFT JOIN (
    SELECT trim(regexp_replace(lower(gwi_system_norm), '\\s+', ' ')) AS gwi_system_norm,
           network
    FROM curated_recon.gwi_system_network_map
  ) gm
    ON n.gwi_system_norm = gm.gwi_system_norm
),
map_keys AS (
  SELECT DISTINCT trim(regexp_replace(lower(gwi_system_norm), '\\s+', ' ')) AS gwi_system_norm
  FROM curated_recon.gwi_system_network_map
  WHERE network IS NOT NULL AND TRIM(network) <> ''
),
mapped_keys AS (
  SELECT
    gwi_system,
    trim(regexp_replace(coalesce(gwi_system_norm, ''), '\\s+', ' ')) AS gwi_system_norm,
    customer_id,
    network
  FROM mapped
),
billing AS (
  -- Use curated monthly MRR (parquet) instead of raw invoice detail to keep this view fast enough
  -- for interactive use (Dashboards + AI Console).
  SELECT
    customer_id,
    mrr_total AS mrr,
    period_month
  FROM curated_core.v_monthly_mrr_platt
  WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
)
SELECT
  mk.customer_id,
  c.name AS customer_name,
  c.city,
  c.state,
  c.zip,
  COALESCE(NULLIF(TRIM(mk.gwi_system), ''), '(blank)') AS gwi_system,
  b.mrr,
  b.period_month
FROM mapped_keys mk
LEFT JOIN map_keys k
  ON mk.gwi_system_norm = k.gwi_system_norm
LEFT JOIN curated_core.platt_customer_current_ssot c
  ON CAST(c.id AS varchar) = mk.customer_id
LEFT JOIN billing b
  ON CAST(b.customer_id AS varchar) = CAST(mk.customer_id AS varchar)
WHERE mk.gwi_system_norm IS NULL
   OR mk.gwi_system_norm = ''
   OR k.gwi_system_norm IS NULL;
