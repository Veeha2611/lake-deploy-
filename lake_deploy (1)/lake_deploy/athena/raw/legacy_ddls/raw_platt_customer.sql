CREATE DATABASE IF NOT EXISTS gwi_raw;

CREATE EXTERNAL TABLE IF NOT EXISTS gwi_raw.raw_platt_customer (
  customer_id STRING,
  customer_name STRING,
  sales_rep STRING,
  status STRING,
  created_at TIMESTAMP
)
PARTITIONED BY (dt STRING)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '"',
  'escapeChar' = '\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/customer/';
