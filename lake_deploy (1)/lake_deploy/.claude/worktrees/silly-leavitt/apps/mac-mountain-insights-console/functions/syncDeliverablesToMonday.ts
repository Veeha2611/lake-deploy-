import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SYNC AWS DELIVERABLES TO MONDAY.COM
 * 
 * Architecture: Monday is projection-only, AWS is SSOT
 * Upserts deliverables by deliverable_id (AWS → Monday one-way)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    
    // Get Monday credentials from environment
    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    const boardId = '18397523070'; // Pipeline Summary Board
    
    if (!mondayApiKey) {
      return Response.json({ error: 'MONDAY_API_KEY not set in environment variables' }, { status: 500 });
    }
    
    // Direct fetch from AWS Query Layer (bypassing aiLayerQuery function)
    const AWS_AI_LAYER_API_KEY = Deno.env.get('AWS_AI_LAYER_API_KEY');
    const AWS_AI_LAYER_INVOKE_URL = Deno.env.get('AWS_AI_LAYER_INVOKE_URL');

    if (!AWS_AI_LAYER_API_KEY || !AWS_AI_LAYER_INVOKE_URL) {
      return Response.json({ error: 'AWS Query Layer credentials not configured' }, { status: 500 });
    }

    console.log('[syncDeliverablesToMonday] Fetching latest partition...');

    // Get latest partition
    const latestPartitionResp = await fetch(`${AWS_AI_LAYER_INVOKE_URL}/query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': AWS_AI_LAYER_API_KEY,
      },
      body: JSON.stringify({
        template_id: 'freeform_sql_v1',
        params: {
          sql: `SELECT MAX(dt) as latest_dt FROM curated_ssot.deliverables LIMIT 1`
        }
      }),
    });

    const latestPartition = await latestPartitionResp.json();
    const latestDt = latestPartition?.data_rows?.[0]?.[0];

    if (!latestDt) {
      return Response.json({ error: 'No deliverables data found in AWS' }, { status: 404 });
    }

    console.log('[syncDeliverablesToMonday] Latest partition:', latestDt);

    // Fetch deliverables
    const deliverablesResp = await fetch(`${AWS_AI_LAYER_INVOKE_URL}/query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': AWS_AI_LAYER_API_KEY,
      },
      body: JSON.stringify({
        template_id: 'freeform_sql_v1',
        params: {
          sql: `SELECT 
            project_id,
            entity,
            project_name,
            project_type,
            state,
            deal_stage,
            priority,
            owner,
            notes,
            partner,
            split_code,
            split_pct,
            investor,
            investor_label,
            investment,
            irr,
            moic,
            project_specs_code,
            passings,
            subscribers,
            take_rate,
            revenue,
            cash_flow,
            coc_return,
            construction_cost,
            construction_cost_per_passing,
            install_cost,
            install_cost_per_subscriber,
            construction_plus_install_cost,
            total_cost_per_passing,
            arpu,
            months_to_completion,
            contract_date,
            start_date,
            end_date,
            funnel_value,
            funnel_multiple,
            due_date
          FROM curated_core.projects_enriched
          ORDER BY project_id
          LIMIT 1000`
        }
      }),
    });

    const deliverablesResult = await deliverablesResp.json();
    
    console.log('[syncDeliverablesToMonday] Deliverables fetched:', deliverablesResult?.data_rows?.length || 0);
    
    const deliverables = deliverablesResult?.data_rows || [];
    const columns = deliverablesResult?.columns || [];
    
    // Get board columns to map IDs
    const boardQuery = `
      query {
        boards(ids: ${boardId}) {
          columns {
            id
            title
            type
          }
        }
      }
    `;
    
    const boardResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayApiKey,
      },
      body: JSON.stringify({ query: boardQuery }),
    });
    
    const boardData = await boardResponse.json();
    const boardColumns = boardData?.data?.boards?.[0]?.columns || [];
    
    // Create column title → ID map
    const colMap = {};
    boardColumns.forEach(col => {
      colMap[col.title] = col.id;
    });
    
    // Get existing items to check for updates vs creates
    const existingItemsQuery = `
      query {
        boards(ids: ${boardId}) {
          items_page(limit: 500) {
            items {
              id
              name
              column_values {
                id
                text
              }
            }
          }
        }
      }
    `;

    const existingItemsResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayApiKey,
      },
      body: JSON.stringify({ query: existingItemsQuery }),
    });

    const existingData = await existingItemsResponse.json();
    const existingItems = existingData?.data?.boards?.[0]?.items_page?.items || [];

    // Map project_id to Monday item ID
    const projectIdCol = colMap['Project ID'];
    const deliverableIdToMondayId = {};

    existingItems.forEach(item => {
      const projIdValue = item.column_values.find(cv => cv.id === projectIdCol);
      if (projIdValue?.text) {
        deliverableIdToMondayId[projIdValue.text] = item.id;
      }
    });
    
    // Sync deliverables
    const syncResults = { created: 0, updated: 0, errors: [] };
    
    for (const row of deliverables) {
      const values = Array.isArray(row) ? row : Object.values(row);
      const projectData = {};
      columns.forEach((col, idx) => {
        projectData[col] = values[idx];
      });

      const projectId = projectData.project_id;
      const mondayItemId = deliverableIdToMondayId[projectId];

      // Build column values - Pipeline Summary Workbook Mapping
      const columnValues = {};

      // Core identifiers
      if (colMap['Project ID']) columnValues[colMap['Project ID']] = projectId;
      if (colMap['Entity']) columnValues[colMap['Entity']] = projectData.entity || '';
      if (colMap['Project Name']) columnValues[colMap['Project Name']] = projectData.project_name || '';
      if (colMap['Project Type']) columnValues[colMap['Project Type']] = projectData.project_type || '';
      if (colMap['State']) columnValues[colMap['State']] = projectData.state || '';
      if (colMap['Deal Stage']) columnValues[colMap['Deal Stage']] = projectData.deal_stage || ''; // TEXT not status
      if (colMap['Priority']) columnValues[colMap['Priority']] = projectData.priority || '';
      if (colMap['Owner']) columnValues[colMap['Owner']] = projectData.owner || '';
      if (colMap['Notes']) columnValues[colMap['Notes']] = projectData.notes || '';
      
      // Partnership structure
      if (colMap['Partner']) columnValues[colMap['Partner']] = projectData.partner || '';
      if (colMap['Split Code']) columnValues[colMap['Split Code']] = projectData.split_code || '';
      if (colMap['Split %']) columnValues[colMap['Split %']] = projectData.split_pct || '';
      if (colMap['Investor']) columnValues[colMap['Investor']] = projectData.investor || '';
      if (colMap['Investor Label']) columnValues[colMap['Investor Label']] = projectData.investor_label || '';
      
      // Financial metrics
      if (colMap['Investment']) columnValues[colMap['Investment']] = projectData.investment || '';
      if (colMap['IRR']) columnValues[colMap['IRR']] = projectData.irr || '';
      if (colMap['MOIC']) columnValues[colMap['MOIC']] = projectData.moic || '';
      if (colMap['Project Specs Code']) columnValues[colMap['Project Specs Code']] = projectData.project_specs_code || '';
      
      // Operational metrics
      if (colMap['Passings']) columnValues[colMap['Passings']] = projectData.passings || '';
      if (colMap['Subscribers']) columnValues[colMap['Subscribers']] = projectData.subscribers || '';
      if (colMap['Take Rate']) columnValues[colMap['Take Rate']] = projectData.take_rate || '';
      if (colMap['Revenue']) columnValues[colMap['Revenue']] = projectData.revenue || '';
      if (colMap['Cash Flow']) columnValues[colMap['Cash Flow']] = projectData.cash_flow || '';
      if (colMap['CoC Return']) columnValues[colMap['CoC Return']] = projectData.coc_return || '';
      
      // Cost structure
      if (colMap['Construction Cost']) columnValues[colMap['Construction Cost']] = projectData.construction_cost || '';
      if (colMap['Construction Cost per Passing']) columnValues[colMap['Construction Cost per Passing']] = projectData.construction_cost_per_passing || '';
      if (colMap['Install Cost']) columnValues[colMap['Install Cost']] = projectData.install_cost || '';
      if (colMap['Install Cost per Subscriber']) columnValues[colMap['Install Cost per Subscriber']] = projectData.install_cost_per_subscriber || '';
      if (colMap['Construction + Install Cost']) columnValues[colMap['Construction + Install Cost']] = projectData.construction_plus_install_cost || '';
      if (colMap['Total Cost per Passing']) columnValues[colMap['Total Cost per Passing']] = projectData.total_cost_per_passing || '';
      if (colMap['ARPU']) columnValues[colMap['ARPU']] = projectData.arpu || '';
      
      // Timeline
      if (colMap['Months to Completion']) columnValues[colMap['Months to Completion']] = projectData.months_to_completion || '';
      if (colMap['Contract Date']) columnValues[colMap['Contract Date']] = projectData.contract_date || '';
      if (colMap['Start Date']) columnValues[colMap['Start Date']] = projectData.start_date || '';
      if (colMap['End Date']) columnValues[colMap['End Date']] = projectData.end_date || '';
      
      // Pipeline management
      if (colMap['Funnel Value']) columnValues[colMap['Funnel Value']] = projectData.funnel_value || '';
      if (colMap['Funnel Multiple']) columnValues[colMap['Funnel Multiple']] = projectData.funnel_multiple || '';
      if (colMap['Due Date']) columnValues[colMap['Due Date']] = projectData.due_date || '';
      
      try {
        if (mondayItemId) {
          // Update existing
          const updateMutation = `
            mutation {
              change_multiple_column_values(
                board_id: ${boardId},
                item_id: ${mondayItemId},
                column_values: ${JSON.stringify(JSON.stringify(columnValues))}
              ) {
                id
              }
            }
          `;
          
          await fetch('https://api.monday.com/v2', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': mondayApiKey,
            },
            body: JSON.stringify({ query: updateMutation }),
          });
          
          syncResults.updated++;
        } else {
          // Create new
          const createMutation = `
            mutation {
              create_item(
                board_id: ${boardId},
                item_name: ${JSON.stringify(projectData.project_name || projectId)},
                column_values: ${JSON.stringify(JSON.stringify(columnValues))}
              ) {
                id
              }
            }
          `;
          
          await fetch('https://api.monday.com/v2', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': mondayApiKey,
            },
            body: JSON.stringify({ query: createMutation }),
          });
          
          syncResults.created++;
        }
      } catch (error) {
        syncResults.errors.push({
          project_id: projectId,
          error: error.message
        });
      }
    }
    
    return Response.json({
      success: true,
      sync_timestamp: new Date().toISOString(),
      aws_partition_date: latestDt,
      deliverables_processed: deliverables.length,
      results: syncResults,
      board_info: {
        id: boardId
      },
      architecture_confirmation: {
        monday_role: "Projection only - READ-ONLY visual layer",
        ssot: "AWS curated_core.projects_enriched",
        data_flow: "AWS → Monday (one-way sync)",
        business_logic_location: "Zero in Monday - all in AWS",
        reproducibility: "Board wipeable - rebuilds from AWS",
        board_name: "Pipeline Summary",
        board_id: boardId
      }
    });
    
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});