CREATE DATABASE IF NOT EXISTS gwi_raw;

CREATE EXTERNAL TABLE IF NOT EXISTS gwi_raw.raw_intacct_gl_entries (
  recordno STRING,
  entry_date STRING,
  batch_id STRING,
  customer_id STRING,
  location_id STRING,
  amount DOUBLE,
  memo STRING,
  description STRING,
  dimensions MAP<STRING,STRING>
)
PARTITIONED BY (run_date STRING)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/'
TBLPROPERTIES ('has_encrypted_data'='false');
