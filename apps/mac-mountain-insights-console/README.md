# MAC App 2.0 UI (AWS-native)

This is the AWS-hosted MAC App 2.0 frontend. It connects directly to the MAC App V2 API (Lambda + API Gateway).

## Configure

Runtime config is injected via `window.__MAC_APP_CONFIG__` in `index.html`:

- `apiBaseUrl`: MAC App V2 API base URL (e.g. `https://0vyy63hwe5.execute-api.us-east-2.amazonaws.com/prod`)
- `awsOnly`: enforce SSOT query allowlist (no freeform SQL)
- `viewer`: default viewer identity for the shareable preview
- `disableAuth`: breakglass flag to bypass UI login (API must also be deployed with auth disabled)
- `CASE_RUNTIME_ENABLED`: enable stateful cases + follow-up actions in the Console
- `BEDROCK_TOOL_USE_ENABLED`: enable Bedrock structured planner outputs (API-side)
- `KB_ENABLED`: enable optional knowledge-pack context for planning (API-side)
- `VERIFY_ACTION_ENABLED`: enable Verify action (API-side)
- `REPORT_EXPORT_ENABLED`: enable server-side exports and report generation (API-side)

You can also override the API base URL with `VITE_MAC_APP_API_BASE`.
Vite env overrides exist for all flags using the `VITE_` prefix (for example `VITE_REPORT_EXPORT_ENABLED=true`).

## Local dev

```bash
cd /Users/patch/lake_deploy/apps/mac-mountain-insights-console
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy (S3 static hosting)

```bash
aws s3 sync dist/ s3://<your-bucket>/ --delete
```

If you need CloudFront, point the distribution to the same bucket origin.
