import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * DEBUG MONDAY BOARD
 * Shows what's actually on the board
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
    
    // Get ALL items from board with pagination
    const query = `
      query {
        boards(ids: ${boardId}) {
          name
          items_page(limit: 500) {
            cursor
            items {
              id
              name
              column_values {
                id
                title
                text
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
    
    // Extract Project IDs and Module Types
    const itemDetails = items.map(item => {
      const cols = {};
      item.column_values.forEach(cv => {
        cols[cv.title] = cv.text || cv.value;
      });
      
      return {
        monday_id: item.id,
        name: item.name,
        project_id: cols['Project ID'],
        module_type: cols['Module Type'],
        entity: cols['Entity'],
        sync_to_aws: cols['Sync to AWS']
      };
    });
    
    return Response.json({
      board_name: board?.name,
      total_items: items.length,
      items: itemDetails,
      raw_sample: items.slice(0, 2)
    });
    
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});