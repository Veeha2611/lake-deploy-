-- SSOT for canonical customers (cross-system)
-- curated_raw: complete, typed, no exclusions
CREATE OR REPLACE VIEW curated_core.customer_curated_raw AS
SELECT
  customer_id,
  customer_name,
  first_bill_date,
  last_bill_date,
  invoice_line_count,
  has_active_service,
  is_test_internal,
  system_platt,
  system_sf_id,
  system_sf_hint,
  sf_account_id,
  sf_account_name,
  sf_account_name_actual,
  sf_platt_id,
  sf_platt_guarantor_id,
  sf_current_mrr,
  system_effective,
  CAST(last_bill_date AS date) AS business_date,
  CAST(last_bill_date AS date) AS updated_at
FROM curated_core.dim_customer_with_systems;

-- exceptions with reason codes
CREATE OR REPLACE VIEW curated_recon.customer_exceptions AS
SELECT
  'future_dated_business_date' AS reason_code,
  *
FROM curated_core.customer_curated_raw
WHERE business_date IS NOT NULL
  AND business_date > current_date + INTERVAL '1' day

UNION ALL
SELECT
  'test_internal' AS reason_code,
  *
FROM curated_core.customer_curated_raw
WHERE is_test_internal = true;

-- SSOT current view (policy applied)
CREATE OR REPLACE VIEW curated_core.customer_current AS
SELECT *
FROM curated_core.customer_curated_raw
WHERE (business_date IS NULL OR business_date <= current_date + INTERVAL '1' day)
  AND (is_test_internal IS NULL OR is_test_internal = false);
