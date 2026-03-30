import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    const boardId = '18397523070';
    
    // Get board with columns and items
    const query = `
      query {
        boards(ids: ["${boardId}"]) {
          id
          name
          columns {
            id
            title
            type
            settings_str
          }
          items_count
          items_page(limit: 100) {
            items {
              id
              name
              column_values {
                id
                type
                value
              }
            }
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
    
    if (!board) {
      return Response.json({ error: 'Board not found', response: data });
    }
    
    // Organize columns by type
    const columnsByType = {};
    board.columns.forEach(col => {
      if (!columnsByType[col.type]) {
        columnsByType[col.type] = [];
      }
      columnsByType[col.type].push({
        id: col.id,
        title: col.title
      });
    });
    
    // Show first few items
    const sampleItems = (board.items_page?.items || []).slice(0, 3).map(item => {
      const values = {};
      item.column_values.forEach(cv => {
        values[cv.title] = cv.value;
      });
      return {
        id: item.id,
        name: item.name,
        values: values
      };
    });
    
    return Response.json({
      board_id: board.id,
      board_name: board.name,
      total_items: board.items_count,
      total_columns: board.columns?.length || 0,
      columns_by_type: columnsByType,
      all_columns: board.columns || [],
      sample_items: sampleItems,
      raw_response: data
    });
    
  } catch (error) {
    return Response.json({ 
      error: error.message, 
      stack: error.stack 
    }, { status: 500 });
  }
});