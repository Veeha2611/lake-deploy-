# MAC App — Projects + Pipeline Runner (User Guide)

## Audience
Internal `@macmtn.com` users.

## What This Module Does
- **Projects**: a portfolio table + project detail drawer + update history.
- **Scenario Modeling**: run and compare scenario assumptions per project.
- **Pipeline Runner**: run the whole pipeline (batch) and export portfolio results.
- **Portfolio Runner**: pick projects + scenarios manually and run a combined portfolio.

## Key Concepts
- **Project**: a single pipeline item (entity, stage, priority, owner, etc.).
- **Scenario**: a named set of assumptions (Base / Optimistic / Conservative).
- **Run**: each save creates a run with timestamped outputs.

## Outputs (What You Can Download)
- `inputs.json`: scenario assumptions used for the run.
- `summary_metrics.csv`: NPV / IRR / MOIC and other summary metrics.
- `economics_monthly.csv`: month-by-month projection (cashflow + economics).

## Pipeline Runner (Batch Mode)
Use when you want to run a consistent baseline across many projects.

What it does:
- Loads pipeline projects (`curated_core.projects_enriched_live`).
- Ensures a baseline scenario exists per project.
- Applies **median pipeline defaults** where available; falls back to safe constants.
- Saves/exports portfolio results for auditability.
- Supports **model profiles** (assumption templates) so runs are repeatable.

Common workflow:
1. Open **Projects** → click **Pipeline Runner**.
2. Filter to a model profile (optional).
3. Generate missing baselines (if needed).
4. Run pipeline.
5. Save and export the portfolio result pack.

If inputs are missing:
- Use **Apply Defaults** in Pipeline Runner to auto-generate a valid baseline.

## Portfolio Runner (Precision Mode)
Use when you need explicit scenario selections (board/investor runs).

What it does:
- You select projects.
- You select one scenario per project.
- It runs the selected scenarios as one portfolio.

Requirements:
- Each selected project must have at least one saved scenario run.

## Model Profiles & Defaults
- **Model profile**: a named assumption template used by Pipeline Runner/Portfolio Runner.
- **Defaults**: when a project is missing required inputs, runners can populate a baseline using pipeline medians.
- **Determinism**: the same inputs + same profile should yield the same outputs.

Profiles (what to pick):
- **Standard Pipeline Model**: general-purpose baseline for most projects.
- **Developer Template 2-9-26 (Exec Dashboard)**: uses the developer-template engine to match Exec Dashboard / Prospect modeling assumptions.
- **Horton / Acme Developer Profile**: developer-specific profile. Uses the developer-template engine; defaults may be tuned for that developer if configured.

## Submissions / Committee Queue (If Enabled)
Some environments enable a project submission workflow (e.g., Capital Committee). If present:
- **Submit Project**: sends a project package for review.
- **Committee Queue**: a queue of submitted projects awaiting review.
- Submissions should reference the project ID and link to the latest model artifacts.

## Environment Note (AWS-only Mode)
Reads remain SSOT-safe. Some write actions may be disabled depending on environment, but model outputs and evidence artifacts remain available.
