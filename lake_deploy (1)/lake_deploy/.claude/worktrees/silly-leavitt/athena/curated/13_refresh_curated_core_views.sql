-- Refresh core views to avoid stale raw_sheets snapshots.
-- Rebuilds segment/churn rollups off current curated_core sources and
-- normalizes CCI-derived views to use latest available raw partitions.

CREATE OR REPLACE VIEW curated_core.v_monthly_mrr_platt_movement AS
WITH base AS (
  SELECT
    CAST(period_month AS date) AS period_month,
    customer_id,
    customer_name,
    crid,
    mrr_total
  FROM curated_core.v_monthly_mrr_platt
),
with_prev AS (
  SELECT
    b.*,
    DATE_ADD('month', -1, b.period_month) AS prev_month
  FROM base b
),
joined AS (
  SELECT
    w.period_month,
    w.customer_id,
    w.customer_name,
    w.crid,
    COALESCE(p.mrr_total, 0) AS prev_mrr,
    COALESCE(w.mrr_total, 0) AS curr_mrr,
    (COALESCE(w.mrr_total, 0) - COALESCE(p.mrr_total, 0)) AS delta_mrr
  FROM with_prev w
  LEFT JOIN base p
    ON p.period_month = w.prev_month
   AND p.customer_id = w.customer_id
   AND p.crid = w.crid
),
classified AS (
  SELECT
    period_month,
    customer_id,
    customer_name,
    crid,
    prev_mrr,
    curr_mrr,
    delta_mrr,
    CASE
      WHEN prev_mrr = 0 AND curr_mrr > 0 THEN 'NEW'
      WHEN prev_mrr > 0 AND curr_mrr = 0 THEN 'CHURN'
      WHEN prev_mrr > 0 AND curr_mrr > 0 AND delta_mrr > 0 THEN 'EXPANSION'
      WHEN prev_mrr > 0 AND curr_mrr > 0 AND delta_mrr < 0 THEN 'CONTRACTION'
      WHEN prev_mrr > 0 AND curr_mrr > 0 AND delta_mrr = 0 THEN 'STEADY'
      ELSE 'OTHER'
    END AS movement_type
  FROM joined
)
SELECT *
FROM classified;

CREATE OR REPLACE VIEW curated_core.v_monthly_mrr_platt_movement_enriched AS
SELECT
  m.period_month,
  m.customer_id,
  m.customer_name,
  m.crid,
  d.system_effective,
  d.system_platt,
  d.system_sf_id,
  d.system_sf_hint,
  m.prev_mrr,
  m.curr_mrr,
  m.delta_mrr,
  m.movement_type
FROM curated_core.v_monthly_mrr_platt_movement m
LEFT JOIN curated_core.dim_customer_with_systems d
  ON d.customer_id = m.customer_id;

CREATE OR REPLACE VIEW curated_core.v_monthly_mrr_platt_movement_enriched_clean AS
SELECT
  m.period_month,
  m.customer_id,
  m.customer_name,
  m.crid,
  m.prev_mrr,
  m.curr_mrr,
  m.delta_mrr,
  m.movement_type,
  d.system_effective,
  d.segment
FROM curated_core.v_monthly_mrr_platt_movement m
LEFT JOIN curated_core.dim_customer_segment_1row d
  ON d.customer_id = m.customer_id;

CREATE OR REPLACE VIEW curated_core.v_monthly_mrr_platt_movement_segmented AS
SELECT
  period_month,
  COALESCE(segment, 'unknown') AS segment,
  system_effective,
  SUM(CASE WHEN movement_type = 'NEW' THEN curr_mrr ELSE 0 END) AS new_mrr,
  SUM(CASE WHEN movement_type = 'CHURN' THEN prev_mrr ELSE 0 END) AS churned_mrr,
  SUM(delta_mrr) AS net_delta_mrr,
  COUNT(DISTINCT CASE WHEN movement_type = 'NEW' THEN customer_id END) AS new_accounts,
  COUNT(DISTINCT CASE WHEN movement_type = 'CHURN' THEN customer_id END) AS churned_accounts
FROM curated_core.v_monthly_mrr_platt_movement_enriched_clean
GROUP BY period_month, COALESCE(segment, 'unknown'), system_effective;

CREATE OR REPLACE VIEW curated_core.v_monthly_mrr_by_segment AS
SELECT
  m.period_month,
  COALESCE(d.segment, 'unknown') AS segment,
  SUM(m.mrr_total) AS total_mrr
FROM curated_core.v_monthly_mrr_platt m
LEFT JOIN curated_core.dim_customer_segment_1row d
  ON d.customer_id = m.customer_id
GROUP BY 1, 2;

CREATE OR REPLACE VIEW curated_core.v_monthly_account_churn_by_segment AS
SELECT
  period_month,
  COALESCE(segment, 'unknown') AS segment,
  COUNT(DISTINCT CASE WHEN movement_type = 'NEW' THEN customer_id END) AS accounts_added,
  COUNT(DISTINCT CASE WHEN movement_type = 'CHURN' THEN customer_id END) AS accounts_lost,
  COUNT(DISTINCT CASE WHEN movement_type = 'NEW' THEN customer_id END)
    - COUNT(DISTINCT CASE WHEN movement_type = 'CHURN' THEN customer_id END) AS net_accounts,
  COUNT(DISTINCT CASE WHEN curr_mrr > 0 THEN customer_id END) AS active_accounts_proxy
FROM curated_core.v_monthly_mrr_platt_movement_enriched_clean
GROUP BY 1, 2;

CREATE OR REPLACE VIEW curated_core.v_monthly_mrr_and_churn_summary AS
SELECT
  m.period_month,
  m.segment,
  m.total_mrr,
  c.accounts_added,
  c.accounts_lost,
  c.net_accounts,
  c.active_accounts_proxy
FROM curated_core.v_monthly_mrr_by_segment m
LEFT JOIN curated_core.v_monthly_account_churn_by_segment c
  ON c.period_month = m.period_month
 AND c.segment = m.segment;

CREATE OR REPLACE VIEW curated_core.cci_summary_norm AS
WITH latest AS (
  SELECT MAX(dt) AS dt
  FROM raw_sheets.cci_summary
)
SELECT
  TRIM(BOTH FROM guarantor) AS acctnumber,
  TRIM(BOTH FROM name) AS account_name,
  TRY_CAST(NULLIF(REGEXP_REPLACE(mrr, '[^0-9.-]', ''), '') AS DOUBLE) AS total_mrr,
  TRY_CAST(NULLIF(REGEXP_REPLACE(cci_cost, '[^0-9.-]', ''), '') AS DOUBLE) AS total_cci_cost,
  TRY_CAST(NULLIF(TRIM(BOTH FROM partner_account_pct), '') AS DOUBLE) AS partner_pct,
  TRIM(BOTH FROM hosted_pbx_flag) AS hosted_pbx_flag,
  TRY_CAST(NULLIF(TRIM(BOTH FROM distance_from_support), '') AS DOUBLE) AS distance_miles,
  TRY_CAST(NULLIF(TRIM(BOTH FROM tickets_count), '') AS BIGINT) AS ticket_count_sf,
  TRY_CAST(NULLIF(TRIM(BOTH FROM truck_rolls), '') AS BIGINT) AS truck_rolls_sf,
  TRIM(BOTH FROM type_ii_contracts) AS type_ii_flag,
  TRIM(BOTH FROM type_ii_shared_flag) AS shared_type_ii_flag,
  s.dt AS source_dt
FROM raw_sheets.cci_summary s
JOIN latest l
  ON s.dt = l.dt
WHERE TRY_CAST(guarantor AS BIGINT) IS NOT NULL;

CREATE OR REPLACE VIEW curated_core.v_cci_tickets_clean AS
WITH latest AS (
  SELECT MAX(dt) AS dt
  FROM raw_sheets.cci_tickets_raw
)
SELECT
  r.col1 AS st_number,
  r.col9 AS customer_display_name,
  r.col10 AS customer_name,
  CAST(NULL AS varchar) AS customer_account_number,
  r.col20 AS service_location_city,
  r.col21 AS service_location_state,
  CAST(NULL AS varchar) AS status,
  r.col4 AS type,
  CAST(NULL AS varchar) AS priority,
  r.col2 AS service_area,
  r.col5 AS operations_code,
  CAST(NULL AS varchar) AS equipment_name,
  CAST(NULL AS varchar) AS estimated_arrival_time,
  r.col24 AS work_done,
  r.col1 AS case_or_ticket_number,
  COALESCE(
    date_format(try(date_parse(r.col11, '%m/%d/%Y %h:%i %p')), '%Y-%m-%dT%H:%i:%sZ'),
    date_format(try(date_parse(r.col3, '%m/%d/%Y %h:%i %p')), '%Y-%m-%dT%H:%i:%sZ')
  ) AS created_time
FROM raw_sheets.cci_tickets_raw r
JOIN latest l
  ON r.dt = l.dt
WHERE r.col1 IS NOT NULL
  AND r.col1 <> ''
  AND r.col1 <> 'ST#'
  AND r.col9 <> 'Customer Display As Name'
  AND regexp_like(r.col1, '^[A-Za-z]{3,6}-[0-9]{3,6}$')
  AND (
    try(date_parse(r.col11, '%m/%d/%Y %h:%i %p')) IS NOT NULL
    OR try(date_parse(r.col3, '%m/%d/%Y %h:%i %p')) IS NOT NULL
  );

CREATE OR REPLACE VIEW curated_core.v_ticket_burden_lake AS
SELECT
  CAST(acctnumber AS varchar) AS customer_id,
  MAX(account_name) AS customer_name,
  COALESCE(MAX(ticket_count_sf), 0) AS ticket_count_lake
FROM curated_core.cci_summary_norm
WHERE acctnumber IS NOT NULL
GROUP BY acctnumber;

CREATE OR REPLACE VIEW curated_core.v_ticket_burden_banded AS
SELECT
  customer_id,
  customer_name,
  ticket_count_lake,
  CASE
    WHEN ticket_count_lake IS NULL OR ticket_count_lake = 0 THEN '0'
    WHEN ticket_count_lake BETWEEN 1 AND 5 THEN '1-5'
    WHEN ticket_count_lake BETWEEN 6 AND 20 THEN '6-20'
    ELSE '20+'
  END AS ticket_burden_band
FROM curated_core.v_ticket_burden_lake;
