# MAC App Pipeline Runner Audit Prompt (Investor Grade)

**Purpose**: Verify pipeline runner completeness (inputs, gating, scenarios, exports, evidence pack) for investor‑grade reporting.

## Inputs
- `RUN_DATE`: 2026-02-12
- `APP_URL`: https://mac-app.macmtn.com/Projects
- `API_BASE`: https://0vyy63hwe5.execute-api.us-east-2.amazonaws.com/prod
- `AWS_REGION`: us-east-2
- `ATHENA_WORKGROUP`: primary
- `ATHENA_OUTPUT_LOCATION`: s3://gwi-raw-us-east-2-pc/athena-results/orchestration/

## Evidence output
- Local: `lake_deploy/ssot_audit/pipeline_runner_${RUN_DATE}/`
- S3 (optional): `s3://gwi-raw-us-east-2-pc/curated_recon/mac_app_pipeline_runner_audit/dt=${RUN_DATE}/`

## Required tables
- `curated_core.projects_enriched_live`
- `curated_core.projects_enriched`

---

# 1) Data completeness (required inputs)
Run in Athena (gwi_curated / curated_core):

```
SELECT
  project_id,
  project_name,
  entity,
  state,
  stage,
  priority,
  CASE WHEN passings > 0 THEN 1 ELSE 0 END AS ok_passings,
  CASE WHEN months_to_completion > 0 THEN 1 ELSE 0 END AS ok_build_months,
  CASE WHEN arpu > 0 THEN 1 ELSE 0 END AS ok_arpu,
  CASE WHEN capex_per_passing > 0 OR investment > 0 THEN 1 ELSE 0 END AS ok_capex,
  CASE WHEN opex_per_sub > 0 THEN 1 ELSE 0 END AS ok_opex,
  CASE WHEN subscription_rate > 0 OR penetration_target_pct > 0 THEN 1 ELSE 0 END AS ok_sub_rate,
  CASE WHEN subscription_months > 0 OR ramp_months > 0 THEN 1 ELSE 0 END AS ok_sub_months
FROM curated_core.projects_enriched_live
WHERE project_id IS NOT NULL
  AND TRIM(CAST(project_id AS varchar)) <> ''
ORDER BY entity, project_name;
```

**PASS** if all `ok_* = 1` for projects intended to run in the pipeline.  
If any `ok_* = 0`, mark them as **BLOCKED** and list missing fields.

Save output as: `missing_inputs.tsv`

---

# 2) Scenario registry completeness
Each project must have a scenario registry entry in S3:

```
s3://gwi-raw-us-east-2-pc/raw/projects_pipeline/model_outputs/{project_id}/scenarios.json
```

Sample scan:
```
aws s3 ls s3://gwi-raw-us-east-2-pc/raw/projects_pipeline/model_outputs/ \
  | awk '{print $2}' | sed 's#/##' > /tmp/project_ids.txt

while read -r pid; do
  aws s3api head-object --bucket gwi-raw-us-east-2-pc \
    --key "raw/projects_pipeline/model_outputs/${pid}/scenarios.json" \
    --query '{Key:Key,LastModified:LastModified,ContentLength:ContentLength}' \
    --output text || echo "MISSING $pid"
done < /tmp/project_ids.txt
```

**PASS** if all expected projects have a `scenarios.json` file.

---

# 3) Baseline run existence
Each project should have a baseline run:

```
aws s3 ls s3://gwi-raw-us-east-2-pc/raw/projects_pipeline/model_outputs/{project_id}/baseline/
```

Verify:
- `summary_metrics.csv`
- `economics_monthly.csv`
- `inputs.json`

**PASS** if baseline outputs exist for projects in the pipeline.

---

# 4) UI gating test (required)
In the UI:
1. Open **Pipeline Runner**.
2. Select a project that is missing inputs.
3. Click **Run Pipeline Analysis**.

**Expected**:
- Run is blocked.
- Missing inputs are listed.
- "Apply Defaults & Create Runs" is available.

If defaults are applied, verify that:
- A baseline run appears.
- Missing inputs are recorded as defaults used.

---

# 5) Pipeline run + evidence pack
In the UI:
1. Select valid scenarios (same model profile).
2. Run pipeline.
3. Click **Save Run** or **Export Full Report**.

Verify S3 artifacts created:
```
s3://gwi-raw-us-east-2-pc/raw/projects_pipeline/pipeline_runs/{run_id}/
  - run.json
  - portfolio_summary.csv
  - portfolio_monthly.csv
  - scenario_metrics.csv
  - pipeline_report.xlsx
```

**PASS** if all artifacts exist and are non‑zero.

---

# 6) Investor‑grade report completeness
Verify in UI:
- Scenario Financials table shows CAPEX, Actual Cash, NPV, IRR, MOIC.
- Scenario Inputs & Outputs section is present (collapsible).
- Evidence & Defaults section shows run ID, model version, guard status, data freshness.
- Export opens XLSX and links to CSV/JSON artifacts.

---

# PASS / FAIL criteria

**PASS** if:
- All required inputs present for pipeline‑eligible projects, OR defaults were explicitly accepted.
- Baseline run exists for each project in scope.
- Pipeline run exports evidence pack (all artifacts present).
- UI shows model profile + run ID + full tabulated inputs/outputs.

**FAIL** if:
- Missing inputs can be bypassed without explicit defaults.
- Any evidence artifacts missing.
- Export does not generate a report URL.

