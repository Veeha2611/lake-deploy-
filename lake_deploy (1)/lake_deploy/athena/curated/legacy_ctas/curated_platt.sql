-- Curated Platt tables (Parquet)
CREATE DATABASE IF NOT EXISTS curated_platt;

CREATE TABLE curated_platt.customer
WITH (
  format='PARQUET',
  external_location='s3://gwi-raw-us-east-2-pc/curated/platt/customer/',
  partitioned_by=ARRAY['dt']
)
AS SELECT * FROM raw_platt.customer;

CREATE TABLE curated_platt.iheader
WITH (
  format='PARQUET',
  external_location='s3://gwi-raw-us-east-2-pc/curated/platt/iheader/',
  partitioned_by=ARRAY['dt']
)
AS SELECT * FROM raw_platt.iheader_raw;

CREATE TABLE curated_platt.idetail
WITH (
  format='PARQUET',
  external_location='s3://gwi-raw-us-east-2-pc/curated/platt/idetail/',
  partitioned_by=ARRAY['dt']
)
AS SELECT * FROM raw_platt.idetail_raw;

CREATE TABLE curated_platt.billing
WITH (
  format='PARQUET',
  external_location='s3://gwi-raw-us-east-2-pc/curated/platt/billing/',
  partitioned_by=ARRAY['dt']
)
AS SELECT * FROM raw_platt.billing;

CREATE TABLE curated_platt.custrate
WITH (
  format='PARQUET',
  external_location='s3://gwi-raw-us-east-2-pc/curated/platt/custrate/',
  partitioned_by=ARRAY['dt']
)
AS SELECT * FROM raw_platt.custrate_raw;
