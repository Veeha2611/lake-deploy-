CREATE DATABASE IF NOT EXISTS raw_knowledge;

CREATE EXTERNAL TABLE IF NOT EXISTS raw_knowledge.notion_text_index (
  page_id string,
  title string,
  dt string,
  s3_key string
)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
WITH SERDEPROPERTIES ('ignore.malformed.json'='true')
LOCATION 's3://gwi-raw-us-east-2-pc/knowledge/notion/index/';

-- Example query:
-- SELECT * FROM raw_knowledge.notion_text_index WHERE dt = '<YYYY-MM-DD>' AND title LIKE '%MAC%';
