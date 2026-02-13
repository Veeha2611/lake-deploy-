-- System mapping view based on latest MRR snapshot.
-- Uses Platt->GWI system map + explicit GWI system -> network/system_key crosswalk.
CREATE OR REPLACE VIEW curated_core.dim_customer_system_latest AS
WITH latest_period AS (
  SELECT MAX(period_month) AS period_month
  FROM curated_core.v_monthly_mrr_platt
  WHERE mrr_total > 0
),
latest_ids AS (
  SELECT DISTINCT CAST(customer_id AS varchar) AS customer_id
  FROM curated_core.v_monthly_mrr_platt
  WHERE period_month = (SELECT period_month FROM latest_period)
    AND mrr_total > 0
),
platt_map AS (
  SELECT
    CAST(REGEXP_REPLACE(pm.customer_id, '\\.0$', '') AS varchar) AS customer_id,
    pm.customer_name,
    COALESCE(NULLIF(TRIM(pm.gwi_system), ''), NULLIF(TRIM(pc.gwi_system), '')) AS gwi_system,
    pm.gwi_customer_type,
    pm.gwi_data_source,
    pm.active,
    trim(regexp_replace(
      regexp_replace(
        lower(coalesce(COALESCE(NULLIF(TRIM(pm.gwi_system), ''), NULLIF(TRIM(pc.gwi_system), '')), '')),
        '\\\\([^\\\\)]*\\\\)',
        ' '
      ),
      '[^a-z0-9]+',
      ' '
    )) AS gwi_system_norm
  FROM curated_recon.platt_customer_system_map pm
  LEFT JOIN curated_core.platt_customer_current_ssot pc
    ON CAST(REGEXP_REPLACE(pm.customer_id, '\\.0$', '') AS varchar) = CAST(pc.id AS varchar)
),
gwi_map AS (
  SELECT
    gwi_system_norm,
    network,
    system_key,
    system_name,
    mapping_status
  FROM curated_recon.gwi_system_network_map
),
gwi_map_norm AS (
  SELECT
    trim(regexp_replace(lower(gwi_system_norm), '\\\\s+', ' ')) AS gwi_system_norm,
    network,
    system_key,
    system_name,
    mapping_status
  FROM gwi_map
)
SELECT
  l.customer_id,
  COALESCE(c.customer_name, pm.customer_name) AS customer_name,
  pm.gwi_system,
  gm.network,
  gm.system_key,
  gm.system_name,
  gm.mapping_status,
  pm.gwi_customer_type,
  pm.gwi_data_source,
  pm.active
FROM latest_ids l
LEFT JOIN curated_core.dim_customer_platt c
  ON CAST(l.customer_id AS varchar) = CAST(c.customer_id AS varchar)
LEFT JOIN platt_map pm
  ON CAST(l.customer_id AS varchar) = CAST(pm.customer_id AS varchar)
LEFT JOIN gwi_map_norm gm
  ON trim(regexp_replace(pm.gwi_system_norm, '\\\\s+', ' ')) = gm.gwi_system_norm;
