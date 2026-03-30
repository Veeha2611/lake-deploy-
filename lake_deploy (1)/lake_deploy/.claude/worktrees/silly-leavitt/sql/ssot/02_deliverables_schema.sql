-- Deliverables config table (JSON in S3)
CREATE EXTERNAL TABLE IF NOT EXISTS raw_static.deliverables_config (
  deliverable_id string,
  title string,
  workstream string,
  module string,
  status string,
  owner_email string,
  due_date string,
  priority string
)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
WITH SERDEPROPERTIES ('ignore.malformed.json'='true')
LOCATION 's3://gwi-raw-us-east-2-pc/raw/static/deliverables_config/';

-- Canonical deliverables table (SSOT)
CREATE EXTERNAL TABLE IF NOT EXISTS curated_ssot.deliverables (
  deliverable_id string,
  title string,
  workstream string,
  module string,
  status string,
  owner_email string,
  due_date string,
  priority string,
  ssot_guard_ok boolean,
  manifest_s3_uri string,
  proof_qids string,
  exception_count bigint,
  last_updated_ts string,
  dt string
)
STORED AS PARQUET
LOCATION 's3://gwi-raw-us-east-2-pc/curated_ssot/deliverables/';
