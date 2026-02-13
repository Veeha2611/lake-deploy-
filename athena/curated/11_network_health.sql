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
mix_map(network_key, network_type, customer_type) AS (
  VALUES
    ('3rbenterprise', 'CLEC', 'Owned Customer'),
    ('belmontmorril', 'Owned FTTP', 'Owned Customer'),
    ('brunswicksystemidfttxcolumbia', 'Owned FTTP', 'Owned Customer'),
    ('dvfiber', 'Contracted', 'Contracted Customer'),
    ('ellsworthfttpsystemid', 'Owned FTTP', 'Owned Customer'),
    ('fttxknightvillesystemidsouthportlandaddresses', 'Owned FTTP', 'Owned Customer'),
    ('gwicopper', 'CLEC', 'Owned Customer'),
    ('gwifttpsystemid', 'Owned FTTP', 'Owned Customer'),
    ('gwimdumtu', 'Owned FTTP', 'Owned Customer'),
    ('gwistandard', 'CLEC', 'Owned Customer'),
    ('islesboromunicipalbroadband', 'Contracted', 'Contracted Customer'),
    ('lymefiber', 'Contracted', 'Contracted Customer'),
    ('mfc3ringbinder3rb', 'CLEC', 'Owned Customer'),
    ('northport1', 'Owned FTTP', 'Owned Customer'),
    ('northport2', 'Owned FTTP', 'Owned Customer'),
    ('nwfx', 'Contracted', 'Contracted Customer'),
    ('rockport', 'Contracted', 'Owned Customer'),
    ('sacomill4mdu', 'Owned FTTP', 'Owned Customer'),
    ('sanfordnetfttpsystemid', 'Contracted', 'Owned Customer'),
    ('southportland', 'Owned FTTP', 'Owned Customer'),
    ('sumner', 'Owned FTTP', 'Owned Customer'),
    ('theelevenmdu', 'Owned FTTP', 'Owned Customer'),
    ('thelincolnloftsmdu', 'Owned FTTP', 'Owned Customer'),
    ('thorntonheightsmdu', 'Owned FTTP', 'Owned Customer')
)
SELECT
  n.network,
  n.network_norm,
  COALESCE(NULLIF(m.network_type, ''), 'Unknown') AS network_type,
  COALESCE(
    NULLIF(m.customer_type, ''),
    CASE
      WHEN m.network_type = 'Contracted' THEN 'Contracted Customer'
      WHEN m.network_type IN ('Owned FTTP', 'CLEC') THEN 'Owned Customer'
      ELSE 'Unknown'
    END
  ) AS customer_type,
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
LEFT JOIN mix_map m
  ON n.network_key = m.network_key;
