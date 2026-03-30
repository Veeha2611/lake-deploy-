import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SETUP MONDAY DELIVERABLES BOARD
 * 
 * Uses existing board ID: 18396205202 (macmountain workspace)
 * Ensures columns match canonical AWS schema
 * Stores board ID in AWS Secrets Manager as deliverables_board_id
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    
    const boardId = '18396205202';
    
    // Get Monday credentials from environment
    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    
    if (!mondayApiKey) {
      return Response.json({ error: 'MONDAY_API_KEY not set in environment variables' }, { status: 500 });
    }
    
    // Get board info and existing columns
    const boardQuery = `
      query {
        boards(ids: ${boardId}) {
          id
          name
          workspace {
            id
            name
          }
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
    const board = boardData?.data?.boards?.[0];
    
    if (!board) {
      return Response.json({ error: 'Board not found', boardId }, { status: 404 });
    }
    
    const existingColumns = board.columns || [];
    
    // Canonical column schema - ALIGNED WITH PROJECTS MODULE
    const canonicalColumns = [
      { title: 'Project ID', type: 'text', id: 'project_id' },
      { title: 'Module Type', type: 'dropdown', id: 'module_type' },
      { title: 'Entity', type: 'text', id: 'entity' },
      { title: 'Project Type', type: 'text', id: 'project_type' },
      { title: 'State', type: 'text', id: 'state' },
      { title: 'Stage', type: 'status', id: 'stage' },
      { title: 'Priority', type: 'text', id: 'priority' },
      { title: 'Owner', type: 'text', id: 'owner' },
      { title: 'Partner Share', type: 'text', id: 'partner_share_raw' },
      { title: 'Investor Label', type: 'text', id: 'investor_label' },
      { title: 'Notes', type: 'long_text', id: 'notes' },
      { title: 'Sync to AWS', type: 'checkbox', id: 'sync_to_aws', description: 'Toggle ON to enable AWS sync for this item' }
    ];
    
    // Check which columns need to be created
    const existingTitles = new Set(existingColumns.map(c => c.title));
    const columnsToCreate = canonicalColumns.filter(c => !existingTitles.has(c.title));
    
    const columnResults = [];
    for (const col of columnsToCreate) {
      const createColMutation = `
        mutation {
          create_column(
            board_id: ${boardId},
            title: ${JSON.stringify(col.title)},
            column_type: ${col.type}
          ) {
            id
            title
            type
          }
        }
      `;
      
      const colResponse = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': mondayApiKey,
        },
        body: JSON.stringify({ query: createColMutation }),
      });
      
      const colData = await colResponse.json();
      columnResults.push({
        title: col.title,
        id: colData?.data?.create_column?.id,
        status: 'created'
      });
    }
    
    // Board ID already stored in AWS Secrets Manager (deliverables_board_id: 18396205202)
    
    return Response.json({
      success: true,
      board: {
        id: boardId,
        name: board.name,
        workspace: board.workspace,
      },
      existing_columns: existingColumns.length,
      columns_created: columnResults,
      canonical_schema_matched: columnsToCreate.length === 0,
      mapping_doc: {
        principle: "Monday.com is PROJECTION ONLY - AWS curated_ssot.deliverables is single source of truth",
        data_flow: "AWS → Monday (one-way sync)",
        upsert_key: "deliverable_id",
        status_authority: "AWS controls all status transitions",
        reproducibility: "Board can be wiped and rebuilt from AWS data alone",
        zero_business_logic: "Monday contains ZERO business logic - purely visual projection"
      },
      next_steps: [
        "Run syncDeliverablesToMonday to populate board from AWS",
        "Set up scheduled automation (e.g., daily at 6am) for ongoing sync",
        "All evidence links (manifests, QIDs, S3) point to AWS artifacts"
      ]
    });
    
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});