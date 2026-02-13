-- Source priority rules (field-level precedence)
CREATE DATABASE IF NOT EXISTS curated_ssot;

CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.ssot_source_priority_rules (
  domain string,
  field_name string,
  primary_system string,
  secondary_systems array<string>,
  notes string,
  updated_at timestamp
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/ssot_source_priority_rules/';

-- Example (keep commented; insert via orchestration once approved)
-- INSERT INTO curated_ssot.ssot_source_priority_rules
-- VALUES
--   ('account', 'account_name', 'salesforce', ARRAY['gaiia','vetro','platt'], 'CRM is primary', current_timestamp),
--   ('invoice', 'amount_total', 'intacct', ARRAY['gaiia'], 'GL source of truth', current_timestamp);

-- Payment priority (AR payments should be Intacct-first)
INSERT INTO curated_ssot.ssot_source_priority_rules
VALUES
  ('payment', 'amount', 'intacct', ARRAY['gaiia'], 'AR payments are authoritative in Intacct', current_timestamp),
  ('payment', 'currency', 'intacct', ARRAY['gaiia'], 'AR payments are authoritative in Intacct', current_timestamp),
  ('payment', 'payment_date', 'intacct', ARRAY['gaiia'], 'AR payments are authoritative in Intacct', current_timestamp),
  ('payment', 'method', 'intacct', ARRAY['gaiia'], 'AR payments are authoritative in Intacct', current_timestamp),
  ('payment', 'status', 'intacct', ARRAY['gaiia'], 'AR payments are authoritative in Intacct', current_timestamp),
  ('payment', 'account_id', 'intacct', ARRAY['gaiia'], 'AR payments are authoritative in Intacct', current_timestamp);
