CREATE DATABASE IF NOT EXISTS curated_core;

-- GIS network map layers mirrored into curated_core for SSOT access.
-- Source of truth remains vetro_curated_db.* (generated from Vetro layers export).

CREATE OR REPLACE VIEW curated_core.v_vetro_network_map_layers_v1 AS
SELECT
  layer_key,
  entity_id,
  latitude,
  longitude,
  icon_key,
  color_hex,
  city,
  state,
  build,
  broadband_status,
  network_status,
  bsl_id,
  plan_id,
  network,
  network_source,
  as_built
FROM curated_core.v_vetro_network_map_layers_tbl;

CREATE OR REPLACE VIEW curated_core.v_vetro_map_lines_layers_v1 AS
SELECT
  layer_key,
  id,
  id_prefix,
  geometry_geojson,
  placement,
  owner,
  build,
  broadband_status,
  network_status,
  bsl_id,
  plan_id,
  network,
  network_source,
  as_built
FROM curated_core.v_vetro_map_lines_layers_tbl;

CREATE OR REPLACE VIEW curated_core.v_vetro_map_lines_owner_v1 AS
SELECT
  (CASE
    WHEN (owner = 'GWI') THEN 'fiber_owner_gwi'
    WHEN (owner = 'LymeFiber') THEN 'fiber_owner_lymefiber'
    WHEN (owner = 'Islesboro') THEN 'fiber_owner_islesboro'
    WHEN (owner = 'Rockport') THEN 'fiber_owner_rockport'
    WHEN (owner = 'NWFX') THEN 'fiber_owner_nwfx'
    WHEN (owner = 'OTT') THEN 'fiber_owner_ott'
    WHEN (owner = 'Mainecom') THEN 'fiber_owner_mainecom'
    ELSE 'fiber_owner_unknown'
  END) AS layer_key,
  id,
  id_prefix,
  geometry_geojson,
  owner,
  build,
  broadband_status,
  network_status,
  bsl_id,
  plan_id,
  network,
  network_source,
  as_built
FROM curated_core.v_vetro_map_lines_layers_tbl;

CREATE OR REPLACE VIEW curated_core.v_vetro_map_polygons_v1 AS
SELECT
  id,
  id_prefix,
  geometry_geojson,
  build,
  plan_id,
  network,
  network_source,
  as_built
FROM curated_core.v_vetro_map_polygons_tbl;

-- Convenience filtered views by layer_key (optional, keeps GIS layers explicit).
CREATE OR REPLACE VIEW curated_core.v_vetro_map_service_locations AS
SELECT *
FROM curated_core.v_vetro_network_map_layers_v1
WHERE layer_key = 'service_locations';

CREATE OR REPLACE VIEW curated_core.v_vetro_map_naps AS
SELECT *
FROM curated_core.v_vetro_network_map_layers_v1
WHERE layer_key = 'naps';

CREATE OR REPLACE VIEW curated_core.v_vetro_map_fat AS
SELECT *
FROM curated_core.v_vetro_network_map_layers_v1
WHERE layer_key = 'fat';

-- Backwards-compatible service location view for dashboard preview map.
CREATE OR REPLACE VIEW curated_core.v_vetro_service_locations AS
SELECT
  service_location_id,
  latitude,
  longitude,
  broadband_status,
  city,
  state,
  build,
  network_status,
  bsl_id,
  plan_id
FROM curated_core.v_vetro_service_locations_tbl;

-- Network map counts (plans/locations/served) for dashboard tile
CREATE OR REPLACE VIEW curated_core.v_vetro_network_map_counts_v1 AS
SELECT
  plan_count,
  total_locations,
  served_count,
  plan_id_count
FROM curated_core.v_vetro_network_map_counts_cache;

-- Network plan crosswalk (map plan_id -> network)
CREATE OR REPLACE VIEW curated_core.v_vetro_network_plan_xwalk_v1 AS
WITH
  plans AS (
    SELECT TRY_CAST(plan_id AS bigint) AS plan_id, COUNT(*) AS feature_count
    FROM curated_core.v_vetro_network_map_layers_v1
    GROUP BY plan_id
  ),
  map AS (
    SELECT plan_id, network, network_norm, system_key, status, resolved_method, resolved_score
    FROM raw_sheets.vetro_network_plan_map_auto
  )
SELECT
  p.plan_id,
  p.feature_count,
  m.network,
  m.network_norm,
  m.system_key,
  m.status,
  m.resolved_method,
  m.resolved_score,
  CASE WHEN m.plan_id IS NULL THEN 'unmapped' ELSE 'mapped' END AS map_status
FROM plans p
LEFT JOIN map m
  ON p.plan_id = m.plan_id;
