# MAC Intelligence Platform - Complete Rebuild Guide

**Generated:** 2026-01-27T15:24:16.281Z
**Platform:** Base44 + React + AWS Athena

---

## 📋 Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Pages & Routes](#pages--routes)
3. [Backend Functions](#backend-functions)
4. [Data Architecture](#data-architecture)
5. [Dependencies & Environment](#dependencies--environment)
6. [Rebuild Checklist](#rebuild-checklist)
7. [Known Issues](#known-issues)

---

## 🏗️ Architecture Overview

**Stack:**
- Frontend: React 18 + Tailwind CSS + shadcn/ui
- Backend: Base44 Functions (Deno)
- Data: AWS Athena (SQL queries) + S3 (object storage)
- AI: AWS AI Layer API (natural language to SQL)

**Data Flow:**
```
User → React Page → Backend Function → AWS AI Layer API → Athena → Views → Results → UI
```

---

## 📄 Pages & Routes


### Dashboard (`/Dashboard`)
Main analytics dashboard with real-time KPIs, charts, and data tiles

**Components:** QuickActionBanner, FinanceKPITiles, RefreshControls, KPIStrip, MainChartCard, DashboardTile, NetworkMapTile, GLClosePack, BucketSummaryTile, MRRFy2025Tile
**Data Sources:** curated_core.v_monthly_mrr_platt, curated_core.v_monthly_mrr_and_churn_summary, curated_core.dim_customer_platt, curated_gis.dim_plan_meta, curated_projects.*
**Functions:** aiLayerQuery



### Console (`/Console`)
Natural language query interface for data exploration

**Components:** QueryInput, QueryResult, ResultDisplay, QueryHistory
**Data Sources:** All curated_* views/tables
**Functions:** answerQuestion, aiLayerQuery



### Topics (`/Topics`)
Topic-based knowledge exploration and queries

**Components:** EnhancedTopicCard, TopicDetailModal, TopicQueryModal
**Data Sources:** curated_*
**Functions:** answerQuestion



### Projects (`/Projects`)
Project pipeline with economics modeling and submissions

**Components:** NewProjectForm, ProjectDetailDrawer, ScenarioModelDrawer, PortfolioRunner, ProjectSubmissionsQueue, ProjectUpdatesHistory
**Data Sources:** curated_projects.projects_enriched, S3: s3://mac-intelligence-platform/projects/*
**Functions:** saveProject, runProjectModel, runPortfolioAnalysisV2, listProjectSubmissions, submitProjectForReview, promoteSubmissionToProject



### MACAppEngine (`/MACAppEngine`)
Admin-only system management and operational tools

**Components:** Various admin tools
**Data Sources:** raw_*, curated_*
**Functions:** Multiple admin functions
**Access:** patrick.cochran@icloud.com OR patch.cochran@macmtn.com ONLY


### Architecture (`/Architecture`)
System architecture documentation and audit tools

**Components:** ProofPackRunner
**Data Sources:** 
**Functions:** generateFullSystemProofPack, auditDashboardTiles, auditProjectsPageComplete
**Access:** patrick.cochran@icloud.com ONLY


### RevenueReproPack (`/RevenueReproPack`)
Revenue reproduction and GL close tools

**Components:** 
**Data Sources:** 
**Functions:** runRevenueReport, runInvoiceLineItemRepro, runEmilieReportPack
**Access:** patrick.cochran@icloud.com OR patch.cochran@macmtn.com ONLY


### Settings (`/Settings`)
User profile and preferences

**Components:** 
**Data Sources:** User entity
**Functions:** None



---

## ⚙️ Backend Functions

### Core Data Access

**aiLayerQuery** - Primary data access function
- **Purpose:** Execute SQL queries via AWS AI Layer HTTP API
- **Inputs:** `{ template_id, params: { sql } }`
- **Outputs:** `{ ok, data_rows, columns, evidence }`
- **Env Vars:** AWS_AI_LAYER_API_KEY, AWS_AI_LAYER_INVOKE_URL

**answerQuestion** - Natural language query
- **Purpose:** Convert natural language to SQL and execute
- **Inputs:** `{ question: string }`
- **Outputs:** `{ response, data_results, visualization_type, evidence }`

### Projects Pipeline

**saveProject** - Save project to S3
- **S3 Path:** `s3://mac-intelligence-platform/projects/project_{id}.json`
- **Triggers:** createProjectsEnrichedView to refresh Athena view

**runProjectModel** - Financial modeling
- **Outputs:** NPV, IRR, payback period, cash flows, stage metrics

**runPortfolioAnalysisV2** - Multi-project analysis
- **Inputs:** Array of project IDs
- **Outputs:** Portfolio metrics, risk analysis, scenario results

---

## 🗄️ Data Architecture

### AWS Athena Views

**curated_core.v_monthly_mrr_platt**
```sql
Schema: customer_id, period_month, mrr_total, account_name, product_category
Usage: Primary MRR source for all finance KPIs
Index: Partitioned by period_month
```

**curated_core.v_monthly_mrr_and_churn_summary**
```sql
Schema: period_month, starting_mrr, ending_mrr, new_mrr, expansion_mrr, contraction_mrr, mrr_churn
Usage: Monthly MRR movement and churn tracking
```

**curated_core.dim_customer_platt**
```sql
Schema: customer_id, customer_name, has_active_service, is_test_internal, risk_score, action_band
Usage: Customer master data with risk scoring
```

### S3 Structure

```
s3://mac-intelligence-platform/
├── projects/               # Project data files (project_{uuid}.json)
├── project-submissions/    # Capital committee submissions
├── project-updates/        # Historical updates
├── knowledge-base/         # Document repository
└── gl-close/              # GL close exports
```

---

## 🔐 RBAC & Permissions

### Global Access
- **Allowed:** @macmtn.com emails + patrick.cochran@icloud.com
- **Enforcement:** Layout.js checks on mount, logs out unauthorized

### Page-Level Access
- **Admin-Only Pages:** Architecture (patrick.cochran@icloud.com only)
- **Limited Pages:** MACAppEngine, RevenueReproPack (patrick.cochran@icloud.com + patch.cochran@macmtn.com)
- **Public Pages:** Dashboard, Console, Topics, Projects (all authenticated users)

### Function-Level Access
- **Admin-Only:** generateRebuildPackage, generateFullSystemProofPack, audit functions
- **User-Scoped:** aiLayerQuery, answerQuestion, saveProject (validate base44.auth.me())

---

## 🔧 Dependencies & Environment

### Required Environment Variables
```bash
REDACTED
REDACTED
AWS_AI_LAYER_REDACTED
AWS_AI_LAYER_INVOKE_URL=<ai-layer-endpoint-url>
BASE44_APP_ID=<auto-populated>
```

### AWS IAM Permissions
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["athena:*", "s3:*", "glue:GetTable", "glue:GetDatabase"],
      "Resource": "*"
    }
  ]
}
```

### NPM Packages (Frontend)
- @tanstack/react-query, framer-motion, recharts, react-leaflet, date-fns, lucide-react

### NPM Packages (Backend)
- @base44/sdk@0.8.6, @aws-sdk/client-s3, jspdf

---

## ✅ Rebuild Checklist

### Phase 1: Infrastructure
- [ ] Provision AWS Athena workspace
- [ ] Create S3 bucket: `mac-intelligence-platform`
- [ ] Set up IAM user with Athena + S3 permissions
- [ ] Deploy or configure AWS AI Layer API endpoint
- [ ] Create Base44 app (or equivalent React app)

### Phase 2: Data Layer
- [ ] Create `curated_core` database in Athena
- [ ] Create `v_monthly_mrr_platt` view with customer-month MRR data
- [ ] Create `v_monthly_mrr_and_churn_summary` aggregation view
- [ ] Create `dim_customer_platt` dimension with risk scoring
- [ ] Create `curated_gis.dim_plan_meta` for network GIS data
- [ ] Create `curated_projects` database
- [ ] Set up S3 folder structure

### Phase 3: Backend Functions
- [ ] Deploy `aiLayerQuery` (primary data function)
- [ ] Deploy `answerQuestion` (NL query)
- [ ] Deploy project functions: `saveProject`, `runProjectModel`, `runPortfolioAnalysisV2`
- [ ] Deploy audit functions (optional)
- [ ] Configure all environment variables

### Phase 4: Frontend
- [ ] Build `Layout.js` with sidebar and auth checks
- [ ] Build `Dashboard.jsx` with all KPI tiles
- [ ] Build `FinanceKPITiles.jsx` (queries AWS directly)
- [ ] Build `Console.jsx` for natural language queries
- [ ] Build `Projects.jsx` with modeling tools
- [ ] Implement theme provider and global styles

### Phase 5: Testing & Validation
- [ ] Verify all Athena views return data
- [ ] Test finance KPIs show correct non-zero values
- [ ] Validate project economic calculations
- [ ] Test S3 file operations
- [ ] Run full system audit from Architecture page

---

## ⚠️ Known Issues

### Data Quality
- ❌ `raw_finance.notion_kpi_payload_ndjson` is legacy - contains zero values - DO NOT USE
- ⚠️ Ensure Athena views are refreshed regularly

### Performance
- ⚠️ Large queries (>100K rows) may timeout - use LIMIT clauses
- ⚠️ Network map limited to 100 points to prevent browser lag

### Feature Gaps
- ℹ️ No automated approval workflow for projects
- ℹ️ No email notifications configured
- ℹ️ Query history not persisted across sessions

---

## 🔗 Page → Function → Data Dependency Map

### Dashboard Page
```
Dashboard.jsx
  ↓
  ├─ FinanceKPITiles.jsx → aiLayerQuery → v_monthly_mrr_platt, dim_customer_platt
  ├─ MainChartCard.jsx → aiLayerQuery → v_monthly_mrr_platt (grouped by action_band)
  ├─ NetworkMapTile.jsx → aiLayerQuery → curated_gis.dim_plan_meta
  └─ GLClosePack.jsx → runEmilieReportPack → S3 exports
```

### Console Page
```
Console.jsx
  ↓
  ├─ QueryInput.jsx
  ↓
  answerQuestion function
  ↓
  AWS AI Layer API (NL → SQL)
  ↓
  Athena (executes generated SQL)
  ↓
  All curated_* views
```

### Projects Page
```
Projects.jsx
  ↓
  ├─ NewProjectForm.jsx → saveProject → S3 projects/
  ├─ ScenarioModelDrawer.jsx → runProjectModel → (calculation only)
  ├─ PortfolioRunner.jsx → runPortfolioAnalysisV2 → (calculation only)
  └─ ProjectSubmissionsQueue.jsx → listProjectSubmissions → S3 project-submissions/
```

---

## 📊 Sample Queries

### Get Latest MRR
```sql
SELECT SUM(mrr_total) as total_mrr, COUNT(DISTINCT customer_id) as customer_count
FROM curated_core.v_monthly_mrr_platt
WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
```

### Get At-Risk Customers
```sql
SELECT COUNT(*) as at_risk_count
FROM curated_core.dim_customer_platt
WHERE action_band IN ('Churn Risk', 'At Risk')
```

### Get Network Locations
```sql
SELECT plan_id, latitude, longitude, status
FROM curated_gis.dim_plan_meta
WHERE latitude IS NOT NULL LIMIT 100
```

---

**End of Rebuild Guide**
