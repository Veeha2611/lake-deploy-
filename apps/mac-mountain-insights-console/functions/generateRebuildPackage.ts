import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.email !== 'patrick.cochran@icloud.com') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rebuildPackage = {
      metadata: {
        app_name: "MAC Intelligence Platform",
        generated_at: new Date().toISOString(),
        generated_by: user.email,
        platform: "Base44 + React + AWS Athena",
        version: "2.0.0"
      },
      
      routes_and_pages: {
        pages: [
          {
            name: "Dashboard",
            path: "/Dashboard",
            is_main: true,
            description: "Main analytics dashboard with real-time KPIs, charts, and data tiles",
            components_used: [
              "QuickActionBanner",
              "FinanceKPITiles",
              "RefreshControls",
              "KPIStrip",
              "MainChartCard",
              "DashboardTile",
              "NetworkMapTile",
              "GLClosePack",
              "BucketSummaryTile",
              "MRRFy2025Tile"
            ],
            data_dependencies: [
              "curated_core.v_monthly_mrr_platt",
              "curated_core.v_monthly_mrr_and_churn_summary",
              "curated_core.dim_customer_platt",
              "curated_gis.dim_plan_meta",
              "curated_projects.*"
            ],
            backend_functions: ["aiLayerQuery"]
          },
          {
            name: "Console",
            path: "/Console",
            description: "Natural language query interface for data exploration",
            components_used: ["QueryInput", "QueryResult", "ResultDisplay", "QueryHistory"],
            data_dependencies: ["All curated_* views/tables"],
            backend_functions: ["answerQuestion", "aiLayerQuery"]
          },
          {
            name: "Topics",
            path: "/Topics",
            description: "Topic-based knowledge exploration and queries",
            components_used: ["EnhancedTopicCard", "TopicDetailModal", "TopicQueryModal"],
            data_dependencies: ["curated_*"],
            backend_functions: ["answerQuestion"]
          },
          {
            name: "Projects",
            path: "/Projects",
            description: "Project pipeline with economics modeling and submissions",
            components_used: [
              "NewProjectForm",
              "ProjectDetailDrawer",
              "ScenarioModelDrawer",
              "PortfolioRunner",
              "ProjectSubmissionsQueue",
              "ProjectUpdatesHistory"
            ],
            data_dependencies: [
              "curated_projects.projects_enriched",
              "S3: s3://mac-intelligence-platform/projects/*"
            ],
            backend_functions: [
              "saveProject",
              "runProjectModel",
              "runPortfolioAnalysisV2",
              "listProjectSubmissions",
              "submitProjectForReview",
              "promoteSubmissionToProject"
            ]
          },
          {
            name: "MACAppEngine",
            path: "/MACAppEngine",
            description: "Admin-only system management and operational tools",
            components_used: ["Various admin tools"],
            data_dependencies: ["raw_*, curated_*"],
            backend_functions: ["Multiple admin functions"],
            access: "patrick.cochran@icloud.com OR patch.cochran@macmtn.com ONLY"
          },
          {
            name: "Architecture",
            path: "/Architecture",
            description: "System architecture documentation and audit tools",
            components_used: ["ProofPackRunner"],
            backend_functions: ["generateFullSystemProofPack", "auditDashboardTiles", "auditProjectsPageComplete"],
            access: "patrick.cochran@icloud.com ONLY"
          },
          {
            name: "RevenueReproPack",
            path: "/RevenueReproPack",
            description: "Revenue reproduction and GL close tools",
            backend_functions: ["runRevenueReport", "runInvoiceLineItemRepro", "runEmilieReportPack"],
            access: "patrick.cochran@icloud.com OR patch.cochran@macmtn.com ONLY"
          },
          {
            name: "Settings",
            path: "/Settings",
            description: "User profile and preferences",
            components_used: [],
            data_dependencies: ["User entity"]
          }
        ],
        component_tree: {
          layout: "Layout.js wraps all pages, provides sidebar navigation and theme toggle",
          shared_components: [
            "components/ui/* (shadcn/ui library)",
            "components/ThemeProvider.jsx (dark/light mode)",
            "components/dashboard/DashboardRefreshProvider.jsx (refresh state management)"
          ]
        }
      },

      backend_functions: {
        core_data_access: {
          aiLayerQuery: {
            description: "Primary data access function - executes SQL queries via AWS AI Layer HTTP API",
            file: "functions/aiLayerQuery.js",
            inputs: {
              template_id: "string (e.g., 'freeform_sql_v1', 'mrr_summary_v1')",
              params: "object (e.g., {sql: 'SELECT ...'} or template-specific params)"
            },
            outputs: {
              ok: "boolean",
              data_rows: "array of arrays (query results)",
              columns: "array of column names",
              evidence: {
                athena_query_execution_id: "string",
                generated_sql: "string",
                views_used: "array"
              }
            },
            env_vars: ["AWS_AI_LAYER_API_KEY", "AWS_AI_LAYER_INVOKE_URL"],
            retry_logic: "3 attempts with exponential backoff (2s, 4s)"
          },
          answerQuestion: {
            description: "Natural language to SQL + response generation",
            file: "functions/answerQuestion.js",
            inputs: { question: "string" },
            outputs: {
              response: "string (markdown)",
              data_results: "array",
              visualization_type: "enum",
              evidence: "object"
            },
            dependencies: ["Uses aiLayerQuery internally"],
            env_vars: ["AWS_AI_LAYER_API_KEY", "AWS_AI_LAYER_INVOKE_URL"]
          }
        },
        
        projects_pipeline: {
          saveProject: {
            description: "Saves/updates project data to S3 and triggers view refresh",
            file: "functions/saveProject.js",
            inputs: {
              project_id: "string",
              project_data: "object (full project schema)"
            },
            s3_paths: {
              write: "s3://mac-intelligence-platform/projects/project_{id}.json"
            },
            env_vars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
            triggers: ["createProjectsEnrichedView function call"]
          },
          runProjectModel: {
            description: "Financial modeling for project economics",
            file: "functions/runProjectModel.js",
            inputs: {
              project_data: "object",
              scenario_overrides: "object (optional)"
            },
            outputs: {
              npv: "number",
              irr: "number",
              payback_period: "number",
              cash_flows: "array",
              metrics_by_stage: "object"
            }
          },
          runPortfolioAnalysisV2: {
            description: "Analyzes multiple projects as a portfolio",
            file: "functions/runPortfolioAnalysisV2.js",
            inputs: { project_ids: "array of strings" },
            outputs: {
              portfolio_metrics: "object",
              risk_analysis: "object",
              scenario_results: "array"
            }
          },
          submitProjectForReview: {
            description: "Creates submission record in S3",
            s3_paths: {
              write: "s3://mac-intelligence-platform/project-submissions/submission_{timestamp}.json"
            }
          }
        },

        revenue_and_finance: {
          runRevenueReport: {
            description: "Revenue reproduction reports",
            file: "functions/runRevenueReport.js"
          },
          runEmilieReportPack: {
            description: "Emilie's GL close pack generation",
            file: "functions/runEmilieReportPack.js",
            outputs: {
              summary_csv_url: "string (S3 signed URL)",
              detail_csv_url: "string (S3 signed URL)"
            }
          }
        },

        audit_and_validation: {
          auditDashboardTiles: {
            description: "Tests all dashboard tile queries for functionality",
            file: "functions/auditDashboardTiles.js",
            outputs: "Array of test results with pass/fail status"
          },
          generateFullSystemProofPack: {
            description: "Comprehensive system audit with downloadable proof pack",
            file: "functions/generateFullSystemProofPack.js"
          }
        },

        knowledge_and_discovery: {
          s3KnowledgeCatalog: {
            description: "Lists and summarizes knowledge base documents from S3",
            s3_paths: {
              read: "s3://mac-intelligence-platform/knowledge-base/*"
            }
          }
        }
      },

      data_architecture: {
        aws_athena_databases: {
          curated_core: {
            description: "Core curated business data views",
            key_views: [
              {
                name: "v_monthly_mrr_platt",
                schema: {
                  customer_id: "varchar",
                  period_month: "date",
                  mrr_total: "decimal(18,2)",
                  account_name: "varchar",
                  product_category: "varchar"
                },
                usage: "Primary MRR data source for all finance KPIs and charts",
                index: "Partitioned by period_month"
              },
              {
                name: "v_monthly_mrr_and_churn_summary",
                schema: {
                  period_month: "date",
                  starting_mrr: "decimal(18,2)",
                  ending_mrr: "decimal(18,2)",
                  new_mrr: "decimal(18,2)",
                  expansion_mrr: "decimal(18,2)",
                  contraction_mrr: "decimal(18,2)",
                  mrr_churn: "decimal(18,2)"
                },
                usage: "Monthly MRR movement analysis and churn metrics"
              },
              {
                name: "dim_customer_platt",
                schema: {
                  customer_id: "varchar",
                  customer_name: "varchar",
                  has_active_service: "boolean",
                  is_test_internal: "boolean",
                  risk_score: "decimal",
                  action_band: "varchar"
                },
                usage: "Customer master data with risk scoring"
              }
            ]
          },
          curated_gis: {
            description: "Geographic/network location data",
            key_views: [
              {
                name: "dim_plan_meta",
                schema: {
                  plan_id: "varchar",
                  latitude: "decimal",
                  longitude: "decimal",
                  status: "varchar",
                  served_date: "date"
                },
                usage: "Network map visualization data"
              }
            ]
          },
          curated_projects: {
            description: "Capital projects and portfolio analysis",
            key_views: [
              {
                name: "projects_enriched",
                schema: {
                  project_id: "varchar",
                  project_name: "varchar",
                  stage: "varchar",
                  total_capex: "decimal",
                  npv: "decimal",
                  irr: "decimal"
                },
                note: "Generated from S3 project JSONs via createProjectsEnrichedView"
              }
            ]
          },
          raw_finance: {
            description: "Raw financial data from source systems",
            note: "Some tables include notion_kpi_payload_ndjson (legacy, being phased out)"
          }
        },

        s3_buckets: {
          primary_bucket: "s3://mac-intelligence-platform/",
          paths: {
            projects: {
              path: "projects/",
              pattern: "project_{uuid}.json",
              description: "Individual project data files",
              schema: "Full project object with financials, timeline, team, risks"
            },
            project_submissions: {
              path: "project-submissions/",
              pattern: "submission_{timestamp}_{user}.json",
              description: "Capital committee submission snapshots"
            },
            project_updates: {
              path: "project-updates/",
              pattern: "update_{project_id}_{timestamp}.json",
              description: "Historical project update records"
            },
            knowledge_base: {
              path: "knowledge-base/",
              description: "PDF/document repository for context"
            },
            gl_close_exports: {
              path: "gl-close/",
              description: "Monthly GL close CSV exports"
            }
          }
        }
      },

      rbac_and_permissions: {
        authentication: {
          provider: "Base44 built-in auth",
          user_entity: "User (built-in)",
          roles: ["admin", "user"]
        },
        
        access_rules: {
          global: {
            allowed_domains: ["@macmtn.com"],
            allowed_emails: ["patrick.cochran@icloud.com"],
            enforcement: "Layout.js checks user email on mount, logs out unauthorized users"
          },
          
          page_level: {
            Architecture: ["patrick.cochran@icloud.com"],
            MACAppEngine: ["patrick.cochran@icloud.com", "patch.cochran@macmtn.com"],
            RevenueReproPack: ["patrick.cochran@icloud.com", "patch.cochran@macmtn.com"],
            Dashboard: ["All authenticated users"],
            Console: ["All authenticated users"],
            Topics: ["All authenticated users"],
            Projects: ["All authenticated users"]
          },

          function_level: {
            admin_only: [
              "generateRebuildPackage",
              "generateFullSystemProofPack",
              "auditDashboardTiles",
              "auditProjectsPageComplete"
            ],
            user_scoped: [
              "aiLayerQuery (validates base44.auth.me())",
              "answerQuestion (validates base44.auth.me())",
              "saveProject (validates base44.auth.me())"
            ]
          },

          row_level_filtering: {
            note: "No RLS implemented - all authenticated users see all data",
            recommendation: "Consider adding created_by filtering for Projects if multi-tenant"
          }
        }
      },

      query_templates: {
        finance_kpis: {
          total_mrr: {
            sql: `WITH customer_month AS (
  SELECT customer_id, SUM(mrr_total) AS mrr
  FROM curated_core.v_monthly_mrr_platt
  WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
  GROUP BY 1
)
SELECT SUM(mrr) as total_mrr, COUNT(*) as customers_with_mrr
FROM customer_month WHERE mrr > 0`,
            expected_schema: { total_mrr: "decimal", customers_with_mrr: "integer" }
          },
          active_customers: {
            sql: `SELECT COUNT(*) as active_customers
FROM curated_core.dim_customer_platt
WHERE has_active_service = true AND is_test_internal = false`,
            expected_schema: { active_customers: "integer" }
          },
          churn_metrics: {
            sql: `SELECT ending_mrr, mrr_churn
FROM curated_core.v_monthly_mrr_and_churn_summary
ORDER BY period_month DESC LIMIT 1`,
            expected_schema: { ending_mrr: "decimal", mrr_churn: "decimal" }
          }
        },

        dashboard_tiles: {
          mrr_by_action_band: {
            sql: `WITH customer_mrr AS (
  SELECT c.customer_id, c.action_band,
    SUM(m.mrr_total) AS mrr
  FROM curated_core.dim_customer_platt c
  JOIN curated_core.v_monthly_mrr_platt m ON c.customer_id = m.customer_id
  WHERE m.period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
  GROUP BY 1, 2
)
SELECT action_band, SUM(mrr) as total_mrr
FROM customer_mrr
GROUP BY 1 ORDER BY 2 DESC`,
            visualization: "bar_chart"
          },
          at_risk_customers: {
            sql: `SELECT COUNT(*) as at_risk_count
FROM curated_core.dim_customer_platt
WHERE action_band IN ('Churn Risk', 'At Risk')`,
            visualization: "metric_card"
          }
        },

        gis_network: {
          network_locations: {
            sql: `SELECT plan_id, latitude, longitude, status, served_date
FROM curated_gis.dim_plan_meta
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
LIMIT 100`,
            usage: "Network map visualization"
          }
        },

        projects: {
          list_projects: {
            sql: `SELECT * FROM curated_projects.projects_enriched
ORDER BY created_date DESC`,
            note: "View generated from S3 JSONs via createProjectsEnrichedView"
          }
        }
      },

      ui_validations_and_formulas: {
        projects: {
          new_project_form: {
            required_fields: ["project_name", "stage", "total_capex", "expected_irr"],
            validations: {
              total_capex: "Must be positive number",
              expected_irr: "Percentage between 0-100",
              start_date: "Must be future date or today"
            }
          },
          financial_model: {
            formulas: {
              npv: "Sum of discounted cash flows at discount rate",
              irr: "Rate where NPV = 0",
              payback_period: "Months until cumulative cash flow > 0",
              roi: "(Total benefits - Total costs) / Total costs * 100"
            },
            assumptions: {
              discount_rate: "10% (configurable per scenario)",
              project_lifetime: "10 years default",
              depreciation: "Straight-line over asset life"
            }
          }
        },

        console: {
          query_input: {
            max_length: "1000 characters",
            debounce: "500ms for suggestions"
          }
        }
      },

      external_dependencies: {
        aws_services: {
          athena: {
            purpose: "Data warehouse querying",
            databases: ["curated_core", "curated_gis", "curated_projects", "raw_finance"],
            access: "Via AWS AI Layer HTTP API proxy"
          },
          s3: {
            purpose: "Object storage for projects, exports, knowledge base",
            bucket: "mac-intelligence-platform",
            access: "Direct via AWS SDK with IAM credentials"
          }
        },

        ai_services: {
          aws_ai_layer: {
            purpose: "Natural language to SQL, query execution, response generation",
            endpoint: "AWS_AI_LAYER_INVOKE_URL env var",
            auth: "AWS_AI_LAYER_API_KEY header"
          }
        },

        npm_packages: {
          frontend: [
            "@tanstack/react-query (data fetching/caching)",
            "framer-motion (animations)",
            "recharts (charts)",
            "react-leaflet (maps)",
            "date-fns (date formatting)",
            "lucide-react (icons)"
          ],
          backend: [
            "@base44/sdk@0.8.6 (Base44 platform SDK)",
            "@aws-sdk/client-s3 (S3 operations)",
            "jspdf (PDF generation)"
          ]
        }
      },

      known_issues: {
        data_quality: [
          "raw_finance.notion_kpi_payload_ndjson contains legacy snapshot data with zero values - DO NOT USE",
          "Some curated views may have stale data if refresh jobs haven't run"
        ],
        performance: [
          "Large Athena queries (>100K rows) may timeout - consider pagination",
          "Network map with >1000 points causes browser lag - limited to 100 points"
        ],
        feature_gaps: [
          "No automated project approval workflow (manual promotion only)",
          "No email notifications for project submissions or rejections",
          "Console query history not persisted (session-only)"
        ]
      },

      deployment_requirements: {
        environment_variables: {
          required: [
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "AWS_AI_LAYER_API_KEY",
            "AWS_AI_LAYER_INVOKE_URL"
          ],
          auto_populated: ["BASE44_APP_ID"]
        },
        
        aws_permissions: {
          iam_policy: {
            athena: ["athena:StartQueryExecution", "athena:GetQueryExecution", "athena:GetQueryResults"],
            s3_read: ["s3:GetObject", "s3:ListBucket"],
            s3_write: ["s3:PutObject"],
            glue: ["glue:GetTable", "glue:GetDatabase"]
          }
        },

        frontend_build: {
          framework: "React 18 + Vite",
          required_features: ["ES6+", "JSX", "CSS Modules", "Environment variables"]
        }
      },

      data_flow_map: {
        dashboard_page: {
          user_request: "Load Dashboard",
          flow: [
            "1. Dashboard.jsx renders",
            "2. FinanceKPITiles fetches MRR data via aiLayerQuery",
            "3. aiLayerQuery → AWS AI Layer API → Athena → v_monthly_mrr_platt",
            "4. Results returned and cached by React Query",
            "5. UI updates with live data every 60s",
            "6. DashboardRefreshProvider manages global refresh state"
          ]
        },
        
        console_query: {
          user_request: "Ask natural language question",
          flow: [
            "1. QueryInput.jsx captures question",
            "2. answerQuestion function called with question text",
            "3. AWS AI Layer converts to SQL + executes via Athena",
            "4. Results + visualization config returned",
            "5. ResultDisplay.jsx renders table/chart based on viz type",
            "6. Query saved to Query entity for history"
          ]
        },

        project_submission: {
          user_request: "Submit project for capital committee",
          flow: [
            "1. ProjectSubmissionForm.jsx collects data",
            "2. submitProjectForReview function called",
            "3. Snapshot saved to S3 project-submissions/",
            "4. Record added to local submissions queue",
            "5. Admin reviews in ProjectSubmissionsQueue component",
            "6. promoteSubmissionToProject moves to main projects S3 folder",
            "7. createProjectsEnrichedView refreshes Athena view"
          ]
        }
      },

      rebuild_checklist: {
        phase_1_infrastructure: [
          "✓ Set up AWS Athena with curated_core, curated_gis, curated_projects databases",
          "✓ Create S3 bucket: mac-intelligence-platform",
          "✓ Configure IAM user with Athena + S3 permissions",
          "✓ Deploy AWS AI Layer API (or equivalent NL-to-SQL service)",
          "✓ Set up Base44 app with React + environment variables"
        ],
        
        phase_2_data_layer: [
          "✓ Create v_monthly_mrr_platt view with customer-month MRR data",
          "✓ Create v_monthly_mrr_and_churn_summary aggregation view",
          "✓ Create dim_customer_platt dimension with risk scoring",
          "✓ Create dim_plan_meta for GIS network data",
          "✓ Set up S3 folder structure (projects/, project-submissions/, knowledge-base/)"
        ],

        phase_3_backend: [
          "✓ Deploy aiLayerQuery function (primary data access)",
          "✓ Deploy answerQuestion function (NL query)",
          "✓ Deploy saveProject + project modeling functions",
          "✓ Deploy audit functions (optional but recommended)",
          "✓ Deploy GL close pack generation (if needed)"
        ],

        phase_4_frontend: [
          "✓ Build Layout with sidebar navigation",
          "✓ Build Dashboard page with KPI tiles and charts",
          "✓ Build Console page for natural language queries",
          "✓ Build Projects page with economic modeling",
          "✓ Build Topics page (if needed)",
          "✓ Implement theme provider (dark/light mode)",
          "✓ Configure refresh intervals and real-time updates"
        ],

        phase_5_testing: [
          "✓ Verify all Athena views return data",
          "✓ Test finance KPIs show non-zero values",
          "✓ Validate project model calculations",
          "✓ Test S3 read/write operations",
          "✓ Run comprehensive audit via Architecture page"
        ]
      }
    };

    // Generate markdown documentation
    const markdown = generateMarkdownDoc(rebuildPackage);

    return Response.json({
      success: true,
      package: rebuildPackage,
      markdown_doc: markdown,
      download_files: {
        json: "rebuild_package.json",
        markdown: "REBUILD_GUIDE.md"
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function generateMarkdownDoc(pkg) {
  return `# MAC Intelligence Platform - Complete Rebuild Guide

**Generated:** ${pkg.metadata.generated_at}
**Platform:** ${pkg.metadata.platform}

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
\`\`\`
User → React Page → Backend Function → AWS AI Layer API → Athena → Views → Results → UI
\`\`\`

---

## 📄 Pages & Routes

${pkg.routes_and_pages.pages.map(page => `
### ${page.name} (\`${page.path}\`)
${page.description}

**Components:** ${(page.components_used || []).join(', ')}
**Data Sources:** ${(page.data_dependencies || []).join(', ')}
**Functions:** ${(page.backend_functions || []).join(', ') || 'None'}
${page.access ? `**Access:** ${page.access}` : ''}
`).join('\n')}

---

## ⚙️ Backend Functions

### Core Data Access

**aiLayerQuery** - Primary data access function
- **Purpose:** Execute SQL queries via AWS AI Layer HTTP API
- **Inputs:** \`{ template_id, params: { sql } }\`
- **Outputs:** \`{ ok, data_rows, columns, evidence }\`
- **Env Vars:** AWS_AI_LAYER_API_KEY, AWS_AI_LAYER_INVOKE_URL

**answerQuestion** - Natural language query
- **Purpose:** Convert natural language to SQL and execute
- **Inputs:** \`{ question: string }\`
- **Outputs:** \`{ response, data_results, visualization_type, evidence }\`

### Projects Pipeline

**saveProject** - Save project to S3
- **S3 Path:** \`s3://mac-intelligence-platform/projects/project_{id}.json\`
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
\`\`\`sql
Schema: customer_id, period_month, mrr_total, account_name, product_category
Usage: Primary MRR source for all finance KPIs
Index: Partitioned by period_month
\`\`\`

**curated_core.v_monthly_mrr_and_churn_summary**
\`\`\`sql
Schema: period_month, starting_mrr, ending_mrr, new_mrr, expansion_mrr, contraction_mrr, mrr_churn
Usage: Monthly MRR movement and churn tracking
\`\`\`

**curated_core.dim_customer_platt**
\`\`\`sql
Schema: customer_id, customer_name, has_active_service, is_test_internal, risk_score, action_band
Usage: Customer master data with risk scoring
\`\`\`

### S3 Structure

\`\`\`
s3://mac-intelligence-platform/
├── projects/               # Project data files (project_{uuid}.json)
├── project-submissions/    # Capital committee submissions
├── project-updates/        # Historical updates
├── knowledge-base/         # Document repository
└── gl-close/              # GL close exports
\`\`\`

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
\`\`\`bash
AWS_ACCESS_KEY_ID=<your-iam-access-key>
AWS_SECRET_ACCESS_KEY=<your-iam-secret>
AWS_AI_LAYER_API_KEY=<ai-layer-api-key>
AWS_AI_LAYER_INVOKE_URL=<ai-layer-endpoint-url>
BASE44_APP_ID=<auto-populated>
\`\`\`

### AWS IAM Permissions
\`\`\`json
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
\`\`\`

### NPM Packages (Frontend)
- @tanstack/react-query, framer-motion, recharts, react-leaflet, date-fns, lucide-react

### NPM Packages (Backend)
- @base44/sdk@0.8.6, @aws-sdk/client-s3, jspdf

---

## ✅ Rebuild Checklist

### Phase 1: Infrastructure
- [ ] Provision AWS Athena workspace
- [ ] Create S3 bucket: \`mac-intelligence-platform\`
- [ ] Set up IAM user with Athena + S3 permissions
- [ ] Deploy or configure AWS AI Layer API endpoint
- [ ] Create Base44 app (or equivalent React app)

### Phase 2: Data Layer
- [ ] Create \`curated_core\` database in Athena
- [ ] Create \`v_monthly_mrr_platt\` view with customer-month MRR data
- [ ] Create \`v_monthly_mrr_and_churn_summary\` aggregation view
- [ ] Create \`dim_customer_platt\` dimension with risk scoring
- [ ] Create \`curated_gis.dim_plan_meta\` for network GIS data
- [ ] Create \`curated_projects\` database
- [ ] Set up S3 folder structure

### Phase 3: Backend Functions
- [ ] Deploy \`aiLayerQuery\` (primary data function)
- [ ] Deploy \`answerQuestion\` (NL query)
- [ ] Deploy project functions: \`saveProject\`, \`runProjectModel\`, \`runPortfolioAnalysisV2\`
- [ ] Deploy audit functions (optional)
- [ ] Configure all environment variables

### Phase 4: Frontend
- [ ] Build \`Layout.js\` with sidebar and auth checks
- [ ] Build \`Dashboard.jsx\` with all KPI tiles
- [ ] Build \`FinanceKPITiles.jsx\` (queries AWS directly)
- [ ] Build \`Console.jsx\` for natural language queries
- [ ] Build \`Projects.jsx\` with modeling tools
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
- ❌ \`raw_finance.notion_kpi_payload_ndjson\` is legacy - contains zero values - DO NOT USE
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
\`\`\`
Dashboard.jsx
  ↓
  ├─ FinanceKPITiles.jsx → aiLayerQuery → v_monthly_mrr_platt, dim_customer_platt
  ├─ MainChartCard.jsx → aiLayerQuery → v_monthly_mrr_platt (grouped by action_band)
  ├─ NetworkMapTile.jsx → aiLayerQuery → curated_gis.dim_plan_meta
  └─ GLClosePack.jsx → runEmilieReportPack → S3 exports
\`\`\`

### Console Page
\`\`\`
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
\`\`\`

### Projects Page
\`\`\`
Projects.jsx
  ↓
  ├─ NewProjectForm.jsx → saveProject → S3 projects/
  ├─ ScenarioModelDrawer.jsx → runProjectModel → (calculation only)
  ├─ PortfolioRunner.jsx → runPortfolioAnalysisV2 → (calculation only)
  └─ ProjectSubmissionsQueue.jsx → listProjectSubmissions → S3 project-submissions/
\`\`\`

---

## 📊 Sample Queries

### Get Latest MRR
\`\`\`sql
SELECT SUM(mrr_total) as total_mrr, COUNT(DISTINCT customer_id) as customer_count
FROM curated_core.v_monthly_mrr_platt
WHERE period_month = (SELECT MAX(period_month) FROM curated_core.v_monthly_mrr_platt)
\`\`\`

### Get At-Risk Customers
\`\`\`sql
SELECT COUNT(*) as at_risk_count
FROM curated_core.dim_customer_platt
WHERE action_band IN ('Churn Risk', 'At Risk')
\`\`\`

### Get Network Locations
\`\`\`sql
SELECT plan_id, latitude, longitude, status
FROM curated_gis.dim_plan_meta
WHERE latitude IS NOT NULL LIMIT 100
\`\`\`

---

**End of Rebuild Guide**
`;
}