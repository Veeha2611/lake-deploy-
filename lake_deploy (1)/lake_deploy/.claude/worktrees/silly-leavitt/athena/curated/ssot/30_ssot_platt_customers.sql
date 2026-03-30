-- SSOT for Platt customers (raw source of truth for customer_id)
CREATE OR REPLACE VIEW curated_core.platt_customer_curated_raw AS
SELECT
  id AS customer_id,
  name AS customer_name,
  active,
  city,
  state,
  zip,
  gwi_system,
  run_date,
  business_date,
  updated_at
FROM curated_core.platt_customer_current;

CREATE OR REPLACE VIEW curated_recon.platt_customer_exceptions AS
SELECT
  'future_dated_business_date' AS reason_code,
  *
FROM curated_core.platt_customer_curated_raw
WHERE business_date IS NOT NULL
  AND business_date > current_date + INTERVAL '1' day;

CREATE OR REPLACE VIEW curated_core.platt_customer_current_ssot AS
SELECT *
FROM curated_core.platt_customer_curated_raw
WHERE business_date IS NULL OR business_date <= current_date + INTERVAL '1' day;
