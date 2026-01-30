import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Test Monday API key and get all workspaces/boards
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    const workspaceId = Deno.env.get('MONDAY_WORKSPACE_ID');
    
    if (!mondayApiKey) {
      return Response.json({ error: 'No MONDAY_API_KEY set' });
    }
    
    // Simple test query
    const testQuery = `
      query {
        me {
          id
          name
          email
        }
      }
    `;
    
    const testResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayApiKey,
      },
      body: JSON.stringify({ query: testQuery }),
    });
    
    const testData = await testResponse.json();
    
    // Get all boards in workspace
    const boardsQuery = `
      query {
        boards(workspace_ids: [${workspaceId}], limit: 50) {
          id
          name
          owner {
            id
            name
          }
          items_count
        }
      }
    `;
    
    const boardsResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayApiKey,
      },
      body: JSON.stringify({ query: boardsQuery }),
    });
    
    const boardsData = await boardsResponse.json();
    const boards = boardsData?.data?.boards || [];
    
    // Find the MAC Projects Pipeline board
    const targetBoard = boards.find(b => b.name.includes('MAC') || b.name.includes('Projects'));
    
    return Response.json({
      api_key_valid: !testData?.errors,
      current_user: testData?.data?.me,
      workspace_id: workspaceId,
      total_boards: boards.length,
      all_boards: boards,
      target_board: targetBoard,
      board_18397523070: boards.find(b => b.id === '18397523070')
    });
    
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});