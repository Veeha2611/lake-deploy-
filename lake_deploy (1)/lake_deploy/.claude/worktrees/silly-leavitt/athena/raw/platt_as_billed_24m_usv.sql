-- Raw Platt as-billed 24m (US-delimited export)
-- Source: direct Platt DB export (bcp) with unit separator delimiter.

CREATE DATABASE IF NOT EXISTS raw_platt;

DROP TABLE IF EXISTS raw_platt.platt_as_billed_24m;

CREATE EXTERNAL TABLE raw_platt.platt_as_billed_24m (
  invoice_id string,
  invoice_date string,
  invoice_total string,
  invoice_paid string,
  customer_id string,
  customer_name string,
  crid string,
  gl_item string,
  line_description string,
  qty string,
  unit_price string,
  line_amount string
)
PARTITIONED BY (dt string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe'
WITH SERDEPROPERTIES (
  'field.delim' = '\u001F',
  'serialization.format' = '\u001F'
)
STORED AS TEXTFILE
LOCATION 's3://gwi-raw-us-east-2-pc/raw/platt/as_billed';
