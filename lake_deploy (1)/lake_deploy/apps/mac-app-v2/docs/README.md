# MAC App 2.0 (AWS-native) — MVP

This scaffold implements the **future-state MAC v2 architecture**:
- Frontend: host separately (S3/CloudFront or Amplify)
- Backend: Lambda + API Gateway
- Data: Athena (curated_core), registry-only queries

## What is included
- `infra/` CDK stack:
  - Lambda query broker (registry-only)
  - API Gateway `/query`, `/registry`, `/health`
  - DynamoDB cache (TTL)
  - Throttling + reserved concurrency
- `lambda/query-broker/`:
  - Athena query execution
  - Registry enforcement
  - Cache + last-good fallback
  - Governed NLQ (Bedrock) + row-volume guardrails

## Deploy (CDK)
```bash
cd /Users/patch/lake_deploy/apps/mac-app-v2/infra
npm install
npm run build
npx cdk synth
npx cdk deploy
```

## API
POST `/query`
```json
{
  "question_id": "total_mrr",
  "params": {}
}
```

Env (query broker):
- `BEDROCK_ENABLED=true|false`
- `BEDROCK_MODEL_ID=...`
- `MAX_RESULT_ROWS=2000`

Natural language (Bedrock NLQ, governed):
```json
{
  "question": "How many active customers are in Islesboro?"
}
```

GET `/registry` returns approved query IDs.

## Frontend wiring
Point the MAC UI to the API Gateway URL:
- `POST /query` with `question_id`
- Use `query_execution_id` + `last_success_ts` for evidence

## Notes
- Registry file: `lambda/query-broker/query-registry.json`
- Output bucket used: `s3://gwi-raw-us-east-2-pc/athena-results/`
- Concurrency is limited to 2
