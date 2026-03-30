-- SSOT for Intacct GL entries
CREATE OR REPLACE VIEW curated_recon.intacct_gl_entries_exceptions AS
SELECT
  'future_dated_business_date' AS reason_code,
  *
FROM curated_core.intacct_gl_entries_curated_raw
WHERE business_date IS NOT NULL
  AND business_date > current_date + INTERVAL '1' day;

CREATE OR REPLACE VIEW curated_core.intacct_gl_entries_current_ssot AS
SELECT *
FROM curated_core.intacct_gl_entries_curated_raw
WHERE business_date IS NULL OR business_date <= current_date + INTERVAL '1' day;
