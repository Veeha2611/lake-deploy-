# MAC v2 — Future State Architecture

## Diagram
- Mermaid source: `docs/architecture/diagrams/future_state_mac_v2.mmd`

## 1) Runtime Hosting
**Serverless, AWS-native**
- Frontend: Amplify (or S3 + CloudFront) hosting React/Next.js
- Backend: Lambda + API Gateway
- Auth: Cognito (SSO-ready, MFA-capable)

## 2) Backend Responsibility (Minimal)
- Accepts a request with `question_id` + parameters
- Executes a single, approved Athena query
- Returns results + Athena QueryExecutionId + freshness metadata

The backend does **not** implement business logic or recompute metrics. All metrics are computed in Athena views.

## 3) Advanced Capabilities (Sidecar Only)
Query is optional and bounded:
- Classify natural-language questions → `question_id`
- Suggest filters (date, market)
- Explain results and flag missing data

Query does **not** generate or alter metrics, queries, or joins.

**Runtime options:**
- Bedrock (preferred for private governance)
- External LLM for routing/explanations only

## 4) Request Flow
```
User question
  → Query router (optional)
  → MAC backend (Lambda)
  → Athena view (predefined)
  → Results + QID + evidence
  → UI
```

## 5) Data Locations
- Raw: `s3://gwi-raw-us-east-2-pc/raw/<source>/<entity>/dt=YYYY-MM-DD/`
- Curated: `s3://gwi-raw-us-east-2-pc/curated/<domain>/<view_name>/`
- Proofs: Athena QueryExecutionId + $path samples + release logs

## 6) What This Replaces
- Moves all computation into Athena
- Enforces provenance with QIDs and $path
- Keeps UI thin and auditable
