import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.email !== 'patrick.cochran@icloud.com') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { format = 'markdown' } = await req.json();

    const timestamp = new Date().toISOString().split('T')[0];
    
    const markdownContent = `# MAC Intelligence Platform — Architecture Documentation
**Exported:** ${new Date().toISOString()}
**Version:** v2.0-beta

---

## 0. Lake Wiring — Athena Data Contracts

Complete audit of every module's connection to AWS Athena. All queries, views, limits, and evidence fields documented.

### Module 1: Network Map (Layered GIS)

**Source Table:** \`vetro_raw_db.vetro_raw_json_lines\`

**Layers (3 independent queries):**
- Service Locations (SL-*): Blue pins, default ON, LIMIT 2000
- NAPs (NAP-*): Orange squares, default OFF, LIMIT 2000
- FAT (FAT-*): Green triangles, default OFF, LIMIT 2000

**Output Columns (normalized schema):**
- layer_key (string) - "service_locations" | "naps" | "fat"
- entity_id (string) - Vetro feature ID
- latitude (double) - required, NOT NULL
- longitude (double) - required, NOT NULL
- icon_key (string) - "sl" | "nap" | "fat"
- color_hex (string) - layer color
- city (varchar) - nullable
- state (varchar) - nullable
- build (varchar) - nullable, NULLIF empty
- broadband_status (varchar) - nullable, NULLIF empty
- network_status (varchar) - nullable, NULLIF empty
- bsl_id (varchar) - nullable, NULLIF empty

**Limit Policy:**
- Default: 2000 per layer
- Max: 2000 (Lambda cap lifted)
- Pagination: Not yet implemented

**Evidence Fields:**
✅ athena_query_execution_id
✅ generated_sql
✅ rows_returned
✅ rows_truncated

**Status:** ✅ FULLY WIRED (v2.1.1)

---

### Module 2: Projects Pipeline

**Source View:** \`curated_core.projects_enriched\`

**Output Columns:**
- project_id (varchar) - UUID
- entity (varchar)
- project_name (varchar)
- project_type (varchar)
- state (varchar)
- stage (varchar) - COALESCE(..., 'Unknown')
- priority (varchar) - COALESCE(..., 'Unranked')
- owner (varchar)
- partner_share_raw (varchar)
- investor_label (varchar)
- notes (varchar)

**SQL:**
\`\`\`sql
SELECT
  project_id,
  entity,
  project_name,
  project_type,
  state,
  COALESCE(stage, 'Unknown') AS stage,
  COALESCE(priority, 'Unranked') AS priority,
  owner,
  partner_share_raw,
  investor_label,
  notes
FROM curated_core.projects_enriched
ORDER BY entity, project_name
LIMIT 200
\`\`\`

**Limit Policy:**
- Default: 200
- Max: 2000
- Fallback: S3 change-files if Athena returns 0 rows or fails

**Evidence Fields:**
✅ athena_query_execution_id (from aiLayerQuery)
✅ generated_sql (from aiLayerQuery)
✅ data_source: "athena" | "s3" (UI tracking)

**Status:** ✅ WIRED with S3 fallback (v2.0.0)

---

### Module 3: Revenue Reconciliation Pack

**Source Views (4 queries per run):**
- \`curated_core.invoice_line_item_repro_v1\` - Invoice detail
- \`curated_core.v_monthly_revenue_platt_long\` - Revenue by customer (monthly pivot)
- \`curated_core.v_monthly_revenue_platt_long\` - Revenue by system (monthly pivot)
- \`curated_core.v_monthly_revenue_platt_long\` - Customer counts (monthly pivot)

**Output Columns by Tab:**
- **Invoice Detail:** customer_id, system, invoice_id, invoice_date, product, total
- **Revenue by Customer:** customer_id, system_id, customer_name, [month columns...]
- **Revenue by System:** system_id, [month columns...]
- **Customer Counts:** system_id, [month count columns...]

**Limit Policy:**
- Invoice Detail: 2000 rows
- Revenue by Customer: 2000 customers
- Revenue by System: 200 systems
- Customer Counts: 200 systems

**Evidence Fields (per tab):**
✅ athena_query_execution_id
✅ generated_sql
✅ rows_returned
✅ rows_truncated

**Status:** ✅ FULLY WIRED (v2.1.1)

---

### Module 4: AI Intelligence Console

**Data Sources (dual-lane):**
- **Lane A (Numerical):** curated_core.* views via aiLayerQuery
- **Lane B (Knowledge):** s3://gwi-raw-us-east-2-pc/knowledge_base/ via s3KnowledgeCatalog

**Available Curated Views:**
- v_monthly_revenue_platt_long
- v_customer_spine
- v_support_tickets
- v_network_health
- invoice_line_item_repro_v1
- projects_enriched

**Query Flow:**
1. LLM analyzes natural language question
2. LLM runs \`SHOW COLUMNS FROM curated_core.view_name\` for schema discovery
3. LLM generates SQL (single statement, no semicolons)
4. SQL executed via aiLayerQuery
5. LLM formats markdown response + evidence

**Limit Policy:**
- Default: 200 rows
- Max: 2000 rows
- LLM determines appropriate LIMIT based on question

**Evidence Fields:**
✅ athena_query_execution_ids[] (array, multi-query support)
✅ generated_sql (string or array for multi-task)
✅ views_used[] (array of view names)
✅ kb_sources[] (if Lane B used)
✅ rows_returned (per task)

**Status:** ✅ FULLY WIRED (v2.1.0 - multi-task support)

---

### Module 5: Dashboard Tiles (KPIs & Charts)

**Source Views (per tile):**
- MRR Tile: curated_core.v_monthly_revenue_platt_long
- Customer Health: curated_core.v_customer_spine
- Support Tickets: curated_core.v_support_tickets
- Network Health: curated_core.v_network_health
- Bucket Summary: curated_core.v_customer_spine + v_monthly_revenue_platt_long

**Limit Policy:**
- KPI tiles: 1 row (aggregate)
- Chart tiles: 200 rows max
- Table tiles: 200 rows default, 2000 max

**Evidence Fields (per tile):**
✅ athena_query_execution_id
✅ generated_sql
✅ rows_returned

**Status:** ✅ FULLY WIRED (v1.0.0)

---

### Lake Wiring Summary

**Modules Wired:** 5 / 5
**Evidence Coverage:** 100%
**Athena Databases:** curated_core (primary), vetro_raw_db (GIS only)
**Row Limit Standard:** Default: 200 | Charts: 200 | Tables: 2000 | GIS: 2000/layer

**Evidence Field Validation:**
✅ All modules return athena_query_execution_id
✅ All modules return generated_sql
✅ Row counts tracked via rows_returned
✅ Truncation flagged via rows_truncated
✅ All SQL queries are single-statement (no semicolons)
✅ S3 fallback implemented where applicable (Projects)

---

## 1. UX Flow Map

### Creating a New Project
\`\`\`
Projects Page → Click "New Project" Button
    ↓
NewProjectForm Modal Opens
    ↓
User fills: entity*, project_name*, project_type*, state*, stage*, priority*, owner*
    ↓
User clicks "Create Project"
    ↓
Frontend calls: base44.functions.invoke('saveProject', {project: formData})
    ↓
Backend writes CSV to S3: raw/projects_pipeline/input/projects_input__[timestamp].csv
    ↓
Success → Modal prompt: "Generate a model now?"
    ↓
If YES: → Store projectId + projectName in localStorage → Open ScenarioModelDrawer
If NOT NOW: → Close modal → "Scenario Modeling" button appears in header
\`\`\`

### Running a Model
\`\`\`
ScenarioModelDrawer Opens
    ↓
Tab 1: "Scenario Inputs" - User enters:
    • Required: passings*, build_months*
    • Optional: arpu_start, penetration rates, ramp_months, capex, opex, discount_rate
    ↓
Instant Results Card appears showing NPV, IRR, MOIC (client-side calculation)
    ↓
User clicks "Save Scenario" or "Save as New Scenario"
    ↓
Frontend calls: base44.functions.invoke('runProjectModel', {project_id, scenario})
    ↓
Backend writes to S3: raw/projects_pipeline/model_outputs/[project_id]/[scenario_id]/[run_id]/
    • inputs.json
    • summary_metrics.csv
    • economics_monthly.csv
    ↓
Updates scenarios.json registry
\`\`\`

---

## 2. Frontend Architecture

### Component Hierarchy
- **pages/Projects.jsx**: Main projects table with filters
- **components/projects/NewProjectForm.jsx**: Project creation modal
- **components/projects/ProjectDetailDrawer.jsx**: Project details + Economics tabs
- **components/projects/ScenarioModelDrawer.jsx**: Financial modeling interface
- **components/projects/EconomicsTab.jsx**: Latest scenario metrics display
- **components/projects/TestDataGenerator.jsx**: Test data generator
- **components/projects/ProjectUpdatesHistory.jsx**: S3 change-files viewer
- **components/projects/PipelineRunner.jsx**: Portfolio analysis tool
- **components/projects/ProjectSubmissionForm.jsx**: Submit projects for review
- **components/projects/ProjectSubmissionsQueue.jsx**: Capital Committee queue

### Key State Variables
- \`modelProjectId\` (Projects.jsx) - Which project is being modeled
- \`modelProjectName\` (Projects.jsx) - Project name displayed in drawer title
- \`scenarioInputs\` (ScenarioModelDrawer.jsx) - All model parameters
- \`selectedScenarioId\` (ScenarioModelDrawer.jsx) - Currently selected scenario
- \`includeTestData\` (Projects.jsx) - Filter toggle for test projects
- \`localStorage.lastCreatedProjectId\` - Persists project_id after creation

---

## 3. Backend Functions

### saveProject
- **Path:** functions/saveProject.js
- **Request:** \`{project: {entity*, project_name*, project_type*, state*, stage*, priority*, owner*, notes, is_test}}\`
- **Response:** \`{success: boolean, project_id: string, s3_key: string}\`
- **S3 Action:** PutObject to \`raw/projects_pipeline/input/[test_]projects_input__YYYYMMDD_HHMMSS.csv\`

### runProjectModel
- **Path:** functions/runProjectModel.js
- **Request:** \`{project_id*, scenario: {scenario_id*, scenario_name*, inputs*, is_test}}\`
- **Response:** \`{success: boolean, outputs: {...}, metrics: {npv, irr, moic}}\`
- **S3 Action:** Writes inputs.json, summary_metrics.csv, economics_monthly.csv
- **Registry:** Updates scenarios.json

### listProjectModelOutputs
- **Path:** functions/listProjectModelOutputs.js
- **Actions:** list | download | content
- **Response:** Lists scenarios/runs, provides presigned URLs, or fetches file content

### aiLayerQuery
- **Path:** functions/aiLayerQuery.js
- **Request:** \`{template_id: 'freeform_sql_v1', params: {sql: string}}\`
- **Response:** \`{data_rows: array, column_names: array, execution_id: string}\`

### manageScenariosRegistry
- **Path:** functions/manageScenariosRegistry.js
- **Actions:** get | upsert
- **S3 Key:** \`raw/projects_pipeline/model_outputs/{project_id}/scenarios.json\`

---

## 4. S3 Structure

### Project Inputs
\`\`\`
raw/projects_pipeline/input/
  ├── projects_input__20260103_143025.csv (real projects)
  └── test_projects_input__20260103_143025.csv (test data)
\`\`\`

### Model Outputs
\`\`\`
raw/projects_pipeline/model_outputs/{project_id}/
  ├── scenarios.json (registry of all scenarios)
  └── {scenario_id}/
      └── {run_id}/
          ├── inputs.json
          ├── summary_metrics.csv
          └── economics_monthly.csv
\`\`\`

### Knowledge Base
\`\`\`
knowledge_base/ (unstructured docs for Lane B queries)
\`\`\`

---

## 5. Financial Calculations

### NPV (Net Present Value)
\`\`\`
NPV = -actual_cash_invested + Σ(FCF[t] / (1 + r/12)^t) for t=1..analysis_months

where:
  r = discount_rate_pct / 100
  FCF[t] = EBITDA[t] - CAPEX_book[t]
  EBITDA[t] = Revenue[t] - OpEx[t]
  actual_cash_invested = peak_external_cash (with EBITDA reinvestment)
\`\`\`

**Coloring:**
- Green: NPV > 0
- Yellow: NPV ≈ 0 (±5% of investment)
- Red: NPV < 0

### IRR (Internal Rate of Return)
\`\`\`
Solve for r_monthly where: NPV(r_monthly) = 0
Then: IRR_annual = r_monthly × 12 × 100%

Implementation: Newton-Raphson (20 iterations)
  npvAtRate = -actual_cash_invested + Σ(FCF[t] / (1 + r)^t)
  derivative = -Σ(t × FCF[t] / (1 + r)^(t+1))
  r_next = r - (npvAtRate / derivative)
\`\`\`

**Coloring:**
- Green: IRR ≥ 15%
- Yellow: 0% < IRR < 15%
- Red: IRR ≤ 0%

**Edge Cases:** Returns "Not defined" when actual_cash_invested ≤ 0 or solver fails to converge.

### MOIC (Multiple on Invested Capital)
\`\`\`
MOIC = Σ(max(0, FCF[t])) / actual_cash_invested for t=1..analysis_months
\`\`\`

**Coloring:**
- Green: MOIC ≥ 2.0x
- Yellow: 1.0x < MOIC < 2.0x
- Red: MOIC ≤ 1.0x

### CAPEX Contract
\`\`\`
total_capex_book = total_capex || (passings × capex_per_passing)

actual_cash_invested = peak_external_cash
  where peak_external_cash is computed month-by-month with EBITDA reinvestment
  
  for month t:
    capex_book[t] = total_capex_book / build_months (if t <= build_months)
    ebitda[t] = revenue[t] - opex[t]
    
    if ebitda[t] < 0:
      external_cash[t] = capex_book[t] - ebitda[t]
    else:
      external_cash[t] = max(0, capex_book[t] - ebitda[t])
    
    cumulative_external_cash[t] = cumulative_external_cash[t-1] + external_cash[t]
  
  actual_cash_invested = max(cumulative_external_cash)
\`\`\`

---

## 6. File Schemas

### projects_input.csv Header
\`\`\`
project_id,entity,project_name,project_type,state,partner_share_raw,investor_label,stage,priority,owner,notes,is_test
\`\`\`

### inputs.json
\`\`\`json
{
  "project_id": "abc-123",
  "scenario_id": "scenario_1704312000000",
  "scenario_name": "Base Case",
  "run_id": "run_1704312123456",
  "created_at": "2026-01-03T14:30:25Z",
  "inputs": {
    "passings": 10000,
    "build_months": 18,
    "arpu_start": 63,
    "penetration_start_pct": 0.10,
    "penetration_target_pct": 0.40,
    "ramp_months": 36,
    "capex_per_passing": 1200,
    "opex_per_sub": 25,
    "discount_rate_pct": 10,
    "analysis_months": 120
  }
}
\`\`\`

### summary_metrics.csv
\`\`\`
metric,value
initial_investment,12000000
npv,4523891
irr,0.1543
moic,2.37
peak_subscribers,4000
peak_monthly_ebitda,152000
\`\`\`

### economics_monthly.csv
\`\`\`
date,month_number,subscribers,penetration_pct,arpu,revenue,opex,ebitda,capex,fcf,cum_cashflow,pv
2026-01-01,1,55,0.55,63.0,3465.0,1375.0,2090.0,666666.67,-664576.67,-664576.67,234.56
\`\`\`

---

## 7. AWS Configuration
- **Region:** us-east-2
- **Bucket:** gwi-raw-us-east-2-pc
- **Athena Database:** curated_core
- **AI Layer:** Lambda proxy via AWS_AI_LAYER_INVOKE_URL

---

## 8. Data Sources

### Lane A: Empirical/Numerical Data (Athena)
- All numerical queries via \`aiLayerQuery\` → AWS AI Layer → Athena
- Restricted to \`curated_core\` views only
- Fail-closed: Show error + SQL + evidence on failure

### Lane B: Knowledge Base (Unstructured Docs in S3)
- Policy/strategy/narrative questions via \`s3KnowledgeCatalog\`
- Retrieves document snippets from \`s3://gwi-raw-us-east-2-pc/knowledge_base/\`
- Returns source S3 keys with text chunks for citation

---

## 9. Quality Assurance Checklist

### Test Suite: Project Creation
- [ ] Click "New Project" → Modal opens
- [ ] Fill required fields → Submit → Success toast
- [ ] Prompt "Generate model now?" appears
- [ ] View Update History → New CSV appears
- [ ] Download CSV → Verify all fields

### Test Suite: Scenario Modeling
- [ ] Click "Yes" → Drawer opens with project name
- [ ] Enter passings + build_months
- [ ] Instant Results show NPV/IRR/MOIC
- [ ] Values update in real-time
- [ ] Click "Save Scenario" → Success
- [ ] Switch to Saved Scenarios → Scenario listed

### Test Suite: Downloads
- [ ] Click Eye icon → File content displays
- [ ] Click Download → File downloads in Safari
- [ ] Downloaded file opens in Excel/Numbers
- [ ] economics_monthly.csv has 120 rows

---

## 10. Known Issues & Technical Debt

### ✅ Fixed
- Scenario persistence via scenarios.json
- S3 fallback for Projects list
- Test data generator creates full outputs
- Save buttons now clickable
- Financial calculations aligned
- Safari download compatibility

### ℹ️ Active Considerations
- Client-side IRR uses simplified Newton-Raphson (20 iterations)
- No scenario deletion UI (scenarios accumulate indefinitely)

---

**End of Architecture Export**
`;

    if (format === 'json') {
      const jsonContent = {
        exported_at: new Date().toISOString(),
        version: 'v2.0-beta',
        sections: {
          ux_flow: {
            create_project: "Projects Page → New Project → Fill fields → Save → Prompt for model",
            run_model: "ScenarioModelDrawer → Enter inputs → Save Scenario → Backend writes to S3",
            save_scenarios: "Save Scenario (overwrite) or Save as New Scenario → Registry updates"
          },
          frontend: {
            pages: ['Projects.jsx'],
            components: [
              'NewProjectForm.jsx',
              'ProjectDetailDrawer.jsx',
              'ScenarioModelDrawer.jsx',
              'EconomicsTab.jsx',
              'TestDataGenerator.jsx',
              'ProjectUpdatesHistory.jsx',
              'PipelineRunner.jsx'
            ]
          },
          backend: {
            functions: [
              {name: 'saveProject', purpose: 'Write project to S3 CSV'},
              {name: 'runProjectModel', purpose: 'Generate financial model outputs'},
              {name: 'listProjectModelOutputs', purpose: 'List/download scenario files'},
              {name: 'aiLayerQuery', purpose: 'Execute SQL via Athena'},
              {name: 'manageScenariosRegistry', purpose: 'Manage scenarios.json'}
            ]
          },
          s3_structure: {
            bucket: 'gwi-raw-us-east-2-pc',
            prefixes: {
              project_inputs: 'raw/projects_pipeline/input/',
              model_outputs: 'raw/projects_pipeline/model_outputs/{project_id}/{scenario_id}/{run_id}/',
              knowledge_base: 'knowledge_base/'
            }
          },
          calculations: {
            npv: "NPV = -actual_cash_invested + Σ(FCF[t] / (1 + r/12)^t)",
            irr: "Solve for r where NPV(r) = 0, IRR_annual = r_monthly × 12 × 100%",
            moic: "MOIC = Σ(max(0, FCF[t])) / actual_cash_invested"
          }
        }
      };

      return Response.json({
        success: true,
        export: jsonContent,
        filename: `architecture_export_${timestamp}.json`
      });
    }

    // Return markdown
    return Response.json({
      success: true,
      export: markdownContent,
      filename: `architecture_export_${timestamp}.md`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});