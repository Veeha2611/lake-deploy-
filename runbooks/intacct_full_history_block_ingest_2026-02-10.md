# Intacct Full-History Block Ingest (2026-02-10)

## Goal
Backfill Intacct GLENTRY in parallel, bounded date blocks. Each block writes to its own `run_date` prefix and can be audited independently.

## Active Blocks (started 2026-02-10)
- block_2000_2004  
  RUN_DATE: `2026-02-10_block_2000_2004_ps2000`  
  Date filter: `ENTRY_DATE >= '01/01/2000' AND ENTRY_DATE <= '12/31/2004'`  
  Task ARN: `arn:aws:ecs:us-east-2:702127848627:task/intacct-ingest-cluster/a50f96a492114ebd860c67355c958fa7`

- block_2005_2009  
  RUN_DATE: `2026-02-10_block_2005_2009_ps2000`  
  Date filter: `ENTRY_DATE >= '01/01/2005' AND ENTRY_DATE <= '12/31/2009'`  
  Task ARN: `arn:aws:ecs:us-east-2:702127848627:task/intacct-ingest-cluster/786a94491d0a4f5f9905088dcb4b9558`

- block_2010_2014  
  RUN_DATE: `2026-02-10_block_2010_2014_ps2000`  
  Date filter: `ENTRY_DATE >= '01/01/2010' AND ENTRY_DATE <= '12/31/2014'`  
  Task ARN: `arn:aws:ecs:us-east-2:702127848627:task/intacct-ingest-cluster/1e0d8df2c37641da9a665ea0fd936bcf`

## Network
- ECS cluster: `intacct-ingest-cluster`
- Task definition: `intacct-ingest-task:15`
- Subnets: `subnet-02ede56f9fe345e86`, `subnet-0dd8eb8393429d007`, `subnet-0de001e4f86dd40a6`
- Security group: `sg-025009449623f6acf`

## Output Prefixes
- XML pages: `s3://gwi-raw-us-east-2-pc/raw/intacct_xml/gl_entries/<RUN_DATE>/`
- JSON: `s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/data/run_date=<RUN_DATE>/gl_entries.json`
- Checkpoint: `s3://gwi-raw-us-east-2-pc/raw/intacct_checkpoints/gl_entries/run_date=<RUN_DATE>/checkpoint.json`
- Logs: `s3://gwi-raw-us-east-2-pc/raw/intacct_logs/run_date=<RUN_DATE>/`

## Live Monitor Commands
```
aws ecs describe-tasks \
  --cluster intacct-ingest-cluster \
  --tasks <TASK_ARNS> \
  --query 'tasks[].{taskArn:taskArn,lastStatus:lastStatus,stopCode:stopCode}' \
  --output table

aws logs get-log-events \
  --log-group-name /ecs/intacct-ingest \
  --log-stream-name ecs/intacct-ingest/<TASK_ID> \
  --limit 50 --output text

RUN_DATE=2026-02-10_block_2000_2004_ps2000
aws s3 ls "s3://gwi-raw-us-east-2-pc/raw/intacct_json/gl_entries/data/run_date=$RUN_DATE/"
aws s3 cp "s3://gwi-raw-us-east-2-pc/raw/intacct_checkpoints/gl_entries/run_date=$RUN_DATE/checkpoint.json" -
```

## Next Blocks (queue once first three complete)
- block_2015_2019  (2015-01-01 → 2019-12-31)
- block_2020_2022  (2020-01-01 → 2022-12-31)
- block_2023_2024  (2023-01-01 → 2024-02-06)

## No-Data Ranges (do not re-run)
Probes returned **count=0** for these ranges; mark as **no data** to avoid repeated zero runs:
- 2000–2004
- 2005–2009
- 2010–2014
- 2010–2016 probe (ENTRY_DATE)

If future evidence contradicts this, reopen.

## SSOT Gate (per block)
- non-zero S3 objects
- Glue crawlers succeed
- Athena counts > 0
- date range within block
- curated exceptions reviewed
