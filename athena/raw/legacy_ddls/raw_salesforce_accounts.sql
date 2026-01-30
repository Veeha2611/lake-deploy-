CREATE DATABASE IF NOT EXISTS gwi_raw;

CREATE EXTERNAL TABLE IF NOT EXISTS gwi_raw.raw_salesforce_accounts (
  sf_account_id STRING,
  name STRING,
  industry STRING,
  region STRING,
  annual_revenue DOUBLE,
  created_date TIMESTAMP
)
PARTITIONED BY (dt STRING)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '"',
  'escapeChar' = '\\'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/salesforce/accounts/';
