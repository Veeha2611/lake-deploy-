CREATE DATABASE IF NOT EXISTS gwi_raw;

CREATE EXTERNAL TABLE IF NOT EXISTS gwi_raw.raw_vetro_exports (
  plan_id STRING,
  export_ts TIMESTAMP,
  status STRING,
  data STRING
)
PARTITIONED BY (plan_id STRING)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://gwi-raw-us-east-2-pc/raw/vetro/';
