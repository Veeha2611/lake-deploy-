ALTER TABLE raw_vetro.raw_vetro_files
SET TBLPROPERTIES (
  'projection.enabled'='true',
  'projection.plan_id.type'='integer',
  'projection.plan_id.range'='1,99999',
  'projection.dt.type'='date',
  'projection.dt.range'='2024-01-01,NOW',
  'projection.dt.format'='yyyy-MM-dd',
  'storage.location.template'='s3://gwi-raw-us-east-2-pc/raw/vetro/plan_id=${plan_id}/dt=${dt}/'
);

ALTER TABLE raw_vetro.raw_vetro_lines
SET TBLPROPERTIES (
  'projection.enabled'='true',
  'projection.plan_id.type'='integer',
  'projection.plan_id.range'='1,99999',
  'projection.dt.type'='date',
  'projection.dt.range'='2024-01-01,NOW',
  'projection.dt.format'='yyyy-MM-dd',
  'storage.location.template'='s3://gwi-raw-us-east-2-pc/raw/vetro/plan_id=${plan_id}/dt=${dt}/'
);
