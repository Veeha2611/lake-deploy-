# Release Log

## Tagging pattern
Each release uses `mac-YYYYMMDD-vX` (for example, `mac-20260127-v1`).

## Release entry template
```
- Release: <tag>
  - Date: <YYYY-MM-DD>
  - Summary: <brief description>
  - Athena SQL: repo:/lake_deploy/athena (commit <sha>)
  - CloudFormation: repo:/lake_deploy/automation/cf (commit <sha>)
  - Lambda Artifact: s3://gwi-raw-us-east-2-pc/orchestration/lambda-code/vetro_export_lambda.zip (commit <sha>)
  - Orchestration Stack (if used): <stack name> (commit <sha>)
  - DD Pack: <link to the latest DD Pack>
  - MAC Architecture Doc: <link to architecture doc>
```

**IaC pointers**
Every release entry MUST include explicit pointers (path + commit SHA) for:
1. Athena SQL scripts.
2. CloudFormation template.
3. Lambda source + zipped artifact S3 key.
4. Orchestration/Step Functions stack if referenced.

**Deadline reminder**
- Target delivery: Tuesday, Jan 27, 2026 EOD.
- If the target slips, note the new deadline: Friday, Jan 30, 2026.
