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

-- Line-based view of raw Vetro JSONL (safe for json_parse on raw_line).
CREATE EXTERNAL TABLE IF NOT EXISTS raw_vetro.raw_vetro_lines (
  raw_line string
)
PARTITIONED BY (
  plan_id string,
  dt string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe'
WITH SERDEPROPERTIES (
  'serialization.format'='1',
  'field.delim'='\\n'
)
LOCATION 's3://gwi-raw-us-east-2-pc/raw/vetro/';

-- Raw Vetro plan list (v2 /plans) landed to S3 as JSON + CSV for phase_id/project_id joins.
CREATE EXTERNAL TABLE IF NOT EXISTS raw_vetro.raw_vetro_plans_json (
  raw_line string
)
PARTITIONED BY (
  dt string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe'
WITH SERDEPROPERTIES (
  'serialization.format'='1',
  'field.delim'='\\n'
)
LOCATION 's3://gwi-raw-us-east-2-pc/raw/vetro_plans/';

CREATE EXTERNAL TABLE IF NOT EXISTS raw_vetro.raw_vetro_plans_csv (
  id string,
  name string
)
PARTITIONED BY (
  dt string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '\"',
  'escapeChar' = '\\\\'
)
LOCATION 's3://gwi-raw-us-east-2-pc/raw/vetro_plans/';
