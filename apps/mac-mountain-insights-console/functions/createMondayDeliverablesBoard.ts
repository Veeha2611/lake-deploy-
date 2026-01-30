import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// This function creates the Monday.com "Data Platform Deliverables" board
// Run this ONCE to set up the board, then store the board ID in AWS Secrets Manager

const getSecretFromAWS = async (secretName) => {
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const region = 'us-east-1';
  
  const url = `https://secretsmanager.${region}.amazonaws.com/`;
  const payload = JSON.stringify({ SecretId: secretName });
  
  const headers = new Headers({
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': 'secretsmanager.GetSecretValue',
  });
  
  const auth = btoa(`${accessKeyId}:${secretAccessKey}`);
  headers.set('Authorization', `Basic ${auth}`);
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: payload,
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch secret: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.SecretString;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    
    const mondayApiKey = await getSecretFromAWS('MONDAY_API_KEY');
    const workspaceId = await getSecretFromAWS('MONDAY_WORKSPACE_ID');
    
    // Create board
    const createBoardMutation = `
      mutation {
        create_board(
          board_name: "Data Platform Deliverables",
          board_kind: public,
          workspace_id: ${workspaceId}
        ) {
          id
        }
      }
    `;
    
    const createResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayApiKey,
      },
      body: JSON.stringify({ query: createBoardMutation }),
    });
    
    const createData = await createResponse.json();
    const boardId = createData?.data?.create_board?.id;
    
    if (!boardId) {
      return Response.json({ error: 'Failed to create board', details: createData }, { status: 500 });
    }
    
    // Create columns (Monday.com requires specific column types)
    const columns = [
      { title: 'Deliverable ID', type: 'text', id: 'text' },
      { title: 'Workstream', type: 'dropdown', id: 'text4' },
      { title: 'System', type: 'dropdown', id: 'text5' },
      { title: 'Module', type: 'dropdown', id: 'text6' },
      { title: 'Status', type: 'status', id: 'status' },
      { title: 'Owner', type: 'people', id: 'people' },
      { title: 'Due Date', type: 'date', id: 'date' },
      { title: 'Priority', type: 'dropdown', id: 'text7' },
      { title: 'SSOT Guard OK', type: 'checkbox', id: 'checkbox' },
      { title: 'Evidence Manifest', type: 'link', id: 'link' },
      { title: 'Proof QIDs', type: 'long-text', id: 'long_text' },
      { title: 'Exception Count', type: 'numbers', id: 'numbers' },
      { title: 'Last Updated', type: 'date', id: 'date4' },
      { title: 'Status Reason', type: 'long-text', id: 'long_text8' },
      { title: 'Runbook', type: 'link', id: 'link9' },
      { title: 'Repo Path', type: 'text', id: 'text3' },
    ];
    
    const columnResults = [];
    for (const col of columns) {
      const createColMutation = `
        mutation {
          create_column(
            board_id: ${boardId},
            title: ${JSON.stringify(col.title)},
            column_type: ${col.type}
          ) {
            id
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
      columnResults.push({ title: col.title, id: colData?.data?.create_column?.id });
    }
    
    return Response.json({
      success: true,
      board_id: boardId,
      board_name: "Data Platform Deliverables",
      columns: columnResults,
      next_steps: [
        `Store board ID ${boardId} in AWS Secrets Manager as 'MONDAY_DELIVERABLES_BOARD_ID'`,
        `Run syncDeliverablesToMonday function to populate the board`,
        `Monday board is projection only - AWS curated_ssot.deliverables is source of truth`
      ]
    });
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});