import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Sync Monday board items with Project entity
 * Maps Monday columns to project fields and creates/updates projects
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    
    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    const boardId = Deno.env.get('MONDAY_BOARD_ID');
    
    // Fetch all items from Monday board
    const query = `
      query {
        boards(ids: ${boardId}) {
          id
          name
          columns {
            id
            title
            type
          }
          items_page(limit: 100) {
            items {
              id
              name
              column_values {
                id
                title
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
    const items = board?.items_page?.items || [];
    const columns = board?.columns || [];
    
    if (!items.length) {
      return Response.json({
        error: 'No items found on board',
        board_name: board?.name,
        columns: columns
      });
    }
    
    // Map columns for reference
    const columnMap = {};
    columns.forEach(col => {
      columnMap[col.id] = { title: col.title, type: col.type };
    });
    
    // Sample the data structure
    const sampleItem = items[0];
    const sampleValues = {};
    sampleItem.column_values.forEach(cv => {
      sampleValues[cv.title] = cv.value;
    });
    
    return Response.json({
      success: true,
      board_name: board?.name,
      items_count: items.length,
      columns_count: columns.length,
      columns: columns,
      column_map: columnMap,
      sample_item: {
        id: sampleItem.id,
        name: sampleItem.name,
        column_values_sample: sampleValues
      },
      next_step: 'Map Monday columns to Project fields and create sync logic'
    });
    
  } catch (error) {
    return Response.json({ 
      error: error.message, 
      stack: error.stack 
    }, { status: 500 });
  }
});