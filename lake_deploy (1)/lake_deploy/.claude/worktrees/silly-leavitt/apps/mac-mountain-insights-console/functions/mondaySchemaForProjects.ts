import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Monday.com Board Schema for MAC Projects Pipeline
    const mondaySchema = {
      board_name: "MAC Projects Pipeline",
      description: "Project tracking and capital allocation pipeline for MAC Mountain entities",
      
      columns: [
        {
          id: "project_id",
          title: "Project ID",
          type: "text",
          description: "Unique identifier for the project (auto-generated if blank)",
          required: false,
          monday_column_type: "text"
        },
        {
          id: "entity",
          title: "Entity",
          type: "dropdown",
          description: "Legal entity managing the project",
          required: true,
          monday_column_type: "status",
          options: ["GMF", "Plattekill", "Catamount", "Windham", "Other"]
        },
        {
          id: "project_name",
          title: "Project Name",
          type: "text",
          description: "Descriptive name of the project",
          required: true,
          monday_column_type: "text"
        },
        {
          id: "project_type",
          title: "Project Type",
          type: "dropdown",
          description: "Category of project",
          required: false,
          monday_column_type: "status",
          options: ["Build", "Upgrade", "Acquisition", "Expansion", "Maintenance"]
        },
        {
          id: "state",
          title: "State",
          type: "dropdown",
          description: "Current operational state",
          required: false,
          monday_column_type: "status",
          options: ["Active", "On Hold", "Completed", "Cancelled"]
        },
        {
          id: "stage",
          title: "Stage",
          type: "dropdown",
          description: "Deal/negotiation stage",
          required: false,
          monday_column_type: "status",
          options: [
            "Term Sheet / NDA",
            "Project Discussion",
            "Contract Discussion", 
            "Final Documents Negotiation",
            "Signed"
          ]
        },
        {
          id: "priority",
          title: "Priority",
          type: "dropdown",
          description: "Strategic priority level",
          required: true,
          monday_column_type: "status",
          options: ["Low", "Medium", "High", "Must Win"]
        },
        {
          id: "owner",
          title: "Owner",
          type: "people",
          description: "Person responsible for the project",
          required: false,
          monday_column_type: "people"
        },
        {
          id: "partner_share_raw",
          title: "Partner Share",
          type: "text",
          description: "Partner's ownership percentage (e.g., '50%' or '0.5')",
          required: false,
          monday_column_type: "text"
        },
        {
          id: "investor_label",
          title: "Investor Label",
          type: "text",
          description: "Name/identifier of investment partner",
          required: false,
          monday_column_type: "text"
        },
        {
          id: "notes",
          title: "Notes",
          type: "long_text",
          description: "Additional context, updates, or important details",
          required: false,
          monday_column_type: "long_text"
        },
        {
          id: "is_test",
          title: "Test Record",
          type: "checkbox",
          description: "Mark as test data (will be filtered in production views)",
          required: false,
          monday_column_type: "checkbox",
          default: false
        },
        
        {
          section: "Financial Inputs",
          description: "Fill these fields to trigger automatic calculation"
        },
        {
          id: "passings",
          title: "Passings (Homes)",
          type: "number",
          description: "Total homes/lots passed by the build",
          required: false,
          monday_column_type: "numbers"
        },
        {
          id: "build_months",
          title: "Build Months",
          type: "number",
          description: "How long the build takes (months)",
          required: false,
          monday_column_type: "numbers"
        },
        {
          id: "total_capex",
          title: "Total CAPEX ($)",
          type: "number",
          description: "Total project investment in dollars",
          required: false,
          monday_column_type: "numbers"
        },
        {
          id: "start_date",
          title: "Project Start Date",
          type: "date",
          description: "Calendar date when project begins",
          required: false,
          monday_column_type: "date"
        },
        {
          id: "arpu_start",
          title: "ARPU Start ($)",
          type: "number",
          description: "Starting monthly revenue per subscriber",
          default: 63,
          monday_column_type: "numbers"
        },
        {
          id: "penetration_start_pct",
          title: "Start Penetration (%)",
          type: "number",
          description: "Initial penetration rate (0-100)",
          default: 10,
          monday_column_type: "numbers"
        },
        {
          id: "penetration_target_pct",
          title: "Target Penetration (%)",
          type: "number",
          description: "Target penetration rate (0-100)",
          default: 40,
          monday_column_type: "numbers"
        },
        {
          id: "ramp_months",
          title: "Ramp Months",
          type: "number",
          description: "Months to reach target penetration",
          default: 36,
          monday_column_type: "numbers"
        },
        {
          id: "capex_per_passing",
          title: "CapEx per Passing ($)",
          type: "number",
          description: "Build cost per passing",
          default: 1200,
          monday_column_type: "numbers"
        },
        {
          id: "opex_per_sub",
          title: "OpEx per Sub ($)",
          type: "number",
          description: "Monthly operating cost per subscriber",
          default: 25,
          monday_column_type: "numbers"
        },
        {
          id: "discount_rate_pct",
          title: "Discount Rate (%)",
          type: "number",
          description: "Rate used for NPV calculation",
          default: 10,
          monday_column_type: "numbers"
        },
        
        {
          section: "Financial Results",
          description: "Auto-calculated (read-only) - updated on save"
        },
        {
          id: "npv",
          title: "NPV ($)",
          type: "currency",
          description: "Net Present Value at discount rate",
          readonly: true,
          monday_column_type: "numbers"
        },
        {
          id: "irr_pct",
          title: "IRR (%)",
          type: "number",
          description: "Internal Rate of Return (annual %)",
          readonly: true,
          monday_column_type: "numbers"
        },
        {
          id: "moic",
          title: "MOIC (x)",
          type: "number",
          description: "Multiple on Invested Capital",
          readonly: true,
          monday_column_type: "numbers"
        },
        {
          id: "actual_cash_invested",
          title: "Actual Cash Invested ($)",
          type: "currency",
          description: "Peak external cash required",
          readonly: true,
          monday_column_type: "numbers"
        },
        {
          id: "peak_subscribers",
          title: "Peak Subscribers",
          type: "number",
          description: "Maximum subscribers reached",
          readonly: true,
          monday_column_type: "numbers"
        },
        {
          id: "peak_ebitda",
          title: "Peak EBITDA ($)",
          type: "currency",
          description: "Maximum EBITDA in projection",
          readonly: true,
          monday_column_type: "numbers"
        },
        {
          id: "calc_status",
          title: "Calculation Status",
          type: "status",
          description: "Last calculation result",
          readonly: true,
          monday_column_type: "status",
          options: ["Success", "Pending", "Error"]
        }
      ],

      // Monday.com Automation Recipe
      automation_recipe: {
        trigger: "When an item is created or updated",
        actions: [
          {
            action: "Send HTTP request",
            method: "POST",
            url: "https://YOUR_AWS_API_GATEWAY_ENDPOINT/ingestMondayUpdate",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": "YOUR_API_KEY"
            },
            body_template: `{
              "board_id": "{board_id}",
              "item_id": "{item_id}",
              "item_name": "{item_name}",
              "column_values": {
                "project_id": "{project_id}",
                "entity": "{entity}",
                "project_name": "{project_name}",
                "project_type": "{project_type}",
                "state": "{state}",
                "stage": "{stage}",
                "priority": "{priority}",
                "owner": "{owner}",
                "partner_share_raw": "{partner_share_raw}",
                "investor_label": "{investor_label}",
                "notes": "{notes}",
                "is_test": "{is_test}"
              },
              "updated_at": "{updated_at}",
              "updated_by": "{updated_by}"
            }`
          }
        ]
      },

      // S3 Staging Structure
      s3_integration: {
        bucket: "gwi-raw-us-east-2-pc",
        staging_prefix: "raw/projects_pipeline/monday_staging/",
        input_prefix: "raw/projects_pipeline/input/",
        file_format: "CSV",
        file_naming: "projects_input__YYYYMMDDTHHMMSS000Z.csv",
        retention: "All updates retained for audit trail",
        
        workflow: [
          "1. Monday.com automation triggers on item create/update",
          "2. Webhook/API Gateway receives Monday data",
          "3. Lambda/Function validates and transforms to CSV format",
          "4. Write to S3 staging: raw/projects_pipeline/monday_staging/monday_update_TIMESTAMP.json",
          "5. Transform to CSV with proper escaping",
          "6. Write to S3 input: raw/projects_pipeline/input/projects_input__TIMESTAMP.csv",
          "7. Projects page loads latest CSV from input/ on each visit",
          "8. User sees updated project data immediately"
        ]
      },

      // CSV Format (what gets written to S3)
      csv_format: {
        header: "project_id,entity,project_name,project_type,state,partner_share_raw,investor_label,stage,priority,owner,notes,is_test",
        example_row: "proj-001,GMF,Fiber Expansion Project,Build,Active,0.5,Investor Co.,Contract Discussion,High,alex@macmtn.com,Project in final review,false",
        encoding: "UTF-8",
        delimiter: ",",
        quote_char: '"',
        escape_rule: "Double quotes escaped as double-double-quotes"
      }
    };

    return Response.json({
      success: true,
      schema: mondaySchema,
      integration_endpoints: {
        webhook_receiver: "/functions/ingestMondayUpdate",
        manual_sync: "/functions/syncMondayToS3",
        validation: "/functions/validateMondayData"
      },
      next_steps: [
        "1. Create Monday.com board with specified columns",
        "2. Set up Monday automation to call webhook on updates",
        "3. Implement ingestMondayUpdate function to receive webhooks",
        "4. Function transforms Monday data → CSV → S3",
        "5. Projects page auto-loads latest S3 CSV"
      ]
    });

  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});