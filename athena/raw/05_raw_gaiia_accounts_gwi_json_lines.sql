-- Raw Gaiia accounts JSON lines (gwi tenant)
-- Treat each line as a single JSON blob to avoid schema drift across partitions.
CREATE EXTERNAL TABLE IF NOT EXISTS raw_gaiia.accounts_gwi_json_lines (
  line string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe'
WITH SERDEPROPERTIES (
  'serialization.format'='1',
  'field.delim'='\\u0001'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/gaiia/accounts/tenant=gwi/';
