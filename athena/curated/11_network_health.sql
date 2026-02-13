CREATE DATABASE IF NOT EXISTS curated_recon;

-- Network ↔ system mapping (authoritative from workbook reconciliation artifacts).
CREATE EXTERNAL TABLE IF NOT EXISTS curated_recon.vetro_network_system_plan_map (
  network string,
  network_norm string,
  system_rank string,
  system_score string,
  system_effective string,
  system_name string,
  system_key string,
  plan_id string,
  plan_name string,
  plan_score string,
  plan_source string,
  combined_score string,
  status string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '\"',
  'escapeChar' = '\\\\'
)
LOCATION 's3://gwi-raw-us-east-2-pc/curated_recon/vetro_network_system_plan_map/dt=2026-02-06/'
TBLPROPERTIES ('skip.header.line.count'='1');

-- Network health rollup sourced from Vetro investor workbook reconciliation.
-- Canonical evidence: docs/ssot/vetro_investor_workbook_recon_2026-02-06.md
CREATE OR REPLACE VIEW curated_core.v_network_health AS
WITH latest AS (
  SELECT MAX(dt) AS dt
  FROM curated_recon.vetro_customer_mix_recon
),
base AS (
  SELECT
    r.dt,
    r.network,
    r.network_norm,
    r.lock_passings,
    r.lock_subscriptions,
    r.lock_arpu,
    r.final_passings,
    r.layers_passings,
    r.source,
    r.final_rule
  FROM curated_recon.vetro_customer_mix_recon r
  JOIN latest l
    ON r.dt = l.dt
  WHERE "$path" LIKE '%customer_mix_reconstructed_layers_ssot%'
    AND r.network IS NOT NULL
    AND TRIM(r.network) <> ''
    AND LOWER(TRIM(r.network)) <> 'network'
    AND (r.network_norm IS NULL OR LOWER(TRIM(r.network_norm)) <> 'network_norm')
),
normalized AS (
  SELECT
    dt,
    network,
    network_norm,
    REGEXP_REPLACE(LOWER(COALESCE(network_norm, network)), '[^a-z0-9]', '') AS network_key,
    COALESCE(
      TRY_CAST(lock_passings AS double),
      TRY_CAST(final_passings AS double),
      TRY_CAST(layers_passings AS double)
    ) AS passings,
    TRY_CAST(lock_subscriptions AS double) AS subscriptions,
    TRIM(lock_arpu) AS arpu_label,
    TRY_CAST(TRIM(lock_arpu) AS double) AS arpu_value
  FROM base
),
network_map AS (
  SELECT
    REGEXP_REPLACE(LOWER(COALESCE(network_norm, network)), '[^a-z0-9]', '') AS network_key,
    TRIM(system_key) AS system_key
  FROM curated_recon.vetro_network_system_plan_map
  WHERE system_key IS NOT NULL AND TRIM(system_key) <> ''
),
bucket_map AS (
  SELECT
    UPPER(TRIM(system_key)) AS system_key,
    bucket
  FROM curated_core.dim_system_bucket
)
SELECT
  n.network,
  n.network_norm,
  CASE
    WHEN b.bucket = 'owned_fttp' THEN 'Owned FTTP'
    WHEN b.bucket = 'contracted_fttp' THEN 'Contracted'
    WHEN b.bucket = 'clec_business' THEN 'CLEC'
    ELSE 'Unknown'
  END AS network_type,
  CASE
    WHEN b.bucket = 'contracted_fttp' THEN 'Contracted Customer'
    WHEN b.bucket IN ('owned_fttp', 'clec_business') THEN 'Owned Customer'
    ELSE 'Unknown'
  END AS customer_type,
  n.passings,
  n.subscriptions,
  n.arpu_value AS arpu,
  n.arpu_label,
  CASE
    WHEN n.subscriptions IS NOT NULL AND n.arpu_value IS NOT NULL
      THEN n.subscriptions * n.arpu_value
    ELSE NULL
  END AS mrr,
  n.dt
FROM normalized n
LEFT JOIN network_map m
  ON n.network_key = m.network_key
LEFT JOIN bucket_map b
  ON UPPER(TRIM(m.system_key)) = b.system_key;
