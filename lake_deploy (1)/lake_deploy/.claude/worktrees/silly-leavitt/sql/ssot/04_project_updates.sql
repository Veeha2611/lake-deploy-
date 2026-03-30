-- Append-only project updates from Monday webhook
CREATE EXTERNAL TABLE IF NOT EXISTS curated_core.project_updates (
  project_id string,
  state string,
  stage string,
  priority string,
  owner string,
  notes string,
  updated_by string,
  updated_ts string,
  dt string
)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
WITH SERDEPROPERTIES ('ignore.malformed.json'='true')
LOCATION 's3://gwi-raw-us-east-2-pc/curated_core/project_updates/';

-- Merge template: apply latest Monday updates to projects_enriched
-- (Implement as CTAS or MERGE via view + row_number)
-- Example pattern:
-- CREATE OR REPLACE VIEW curated_core.projects_enriched_merged AS
-- WITH latest_updates AS (
--   SELECT *, row_number() OVER (PARTITION BY project_id ORDER BY updated_ts DESC) AS rn
--   FROM curated_core.project_updates
-- )
-- SELECT
--   p.*, 
--   COALESCE(u.state, p.state) AS state,
--   COALESCE(u.stage, p.stage) AS stage,
--   COALESCE(u.priority, p.priority) AS priority,
--   COALESCE(u.owner, p.owner) AS owner,
--   COALESCE(u.notes, p.notes) AS notes
-- FROM curated_core.projects_enriched p
-- LEFT JOIN latest_updates u ON p.project_id = u.project_id AND u.rn = 1;
