CREATE DATABASE IF NOT EXISTS raw_vetro;

CREATE EXTERNAL TABLE IF NOT EXISTS raw_vetro.raw_vetro_files (
  raw_line string
)
PARTITIONED BY (
  plan_id string,
  dt string
)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
WITH SERDEPROPERTIES (
  'ignore.malformed.json' = 'true'
)
LOCATION 's3://gwi-raw-us-east-2-pc/raw/vetro/'
TBLPROPERTIES (
  'has_encrypted_data'='false'
);
