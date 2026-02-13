-- Active services by network (Platt SSOT).
-- Definition: has_active_service = true and is_test_internal = false.
CREATE OR REPLACE VIEW curated_recon.v_network_active_services_latest AS
WITH active_platt AS (
  SELECT
    customer_id
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
gwi_map AS (
  SELECT
    trim(regexp_replace(lower(gwi_system_norm), '\\s+', ' ')) AS gwi_system_norm,
    network,
    system_key,
    mapping_status
  FROM curated_recon.gwi_system_network_map
)
SELECT
  COALESCE(NULLIF(TRIM(gm.network), ''), 'Unmapped') AS network,
  gm.system_key,
  gm.mapping_status,
  COUNT(DISTINCT ap.customer_id) AS active_services
FROM active_platt ap
LEFT JOIN platt_map pm
  ON CAST(ap.customer_id AS varchar) = CAST(pm.customer_id AS varchar)
LEFT JOIN gwi_map gm
  ON trim(
      regexp_replace(
        regexp_replace(lower(coalesce(pm.gwi_system, '')), '\\\\([^\\\\)]*\\\\)', ' '),
        '[^a-z0-9]+',
        ' '
      )
    ) = gm.gwi_system_norm
GROUP BY gm.network, gm.system_key, gm.mapping_status;
