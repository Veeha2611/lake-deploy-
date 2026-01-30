import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Inspect Monday board columns to see what exists and their IDs
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    
    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    const boardId = '18397523070';
    
    // Get board structure with all columns
    const query = `
      query {
        boards(ids: ${boardId}) {
          name
          columns {
            id
            title
            type
            settings_str
          }
        }
      }
    `;
    
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayApiKey,
      },
      body: JSON.stringify({ query }),
    });
    
    const data = await response.json();
    const board = data?.data?.boards?.[0];
    const columns = board?.columns || [];
    
    // Organize columns by type
    const columnsByType = {};
    columns.forEach(col => {
      if (!columnsByType[col.type]) {
        columnsByType[col.type] = [];
      }
      columnsByType[col.type].push({
        id: col.id,
        title: col.title,
        type: col.type
      });
    });
    
    return Response.json({
      board_name: board?.name,
      total_columns: columns.length,
      columns_by_type: columnsByType,
      all_columns: columns
    });
    
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});