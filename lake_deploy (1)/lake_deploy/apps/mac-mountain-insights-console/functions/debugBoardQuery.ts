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
    
    // Try different query variations
    const queries = [
      // Query 1: Direct board with ID as string
      {
        name: 'board_by_id_string',
        query: `
          query {
            boards(ids: ["18397523070"]) {
              id
              name
            }
          }
        `
      },
      // Query 2: Direct board with ID as number
      {
        name: 'board_by_id_number',
        query: `
          query {
            boards(ids: [18397523070]) {
              id
              name
            }
          }
        `
      },
      // Query 3: Get items directly
      {
        name: 'get_items_direct',
        query: `
          query {
            items(limit: 5) {
              id
              name
              board {
                id
                name
              }
            }
          }
        `
      }
    ];
    
    const results = {};
    
    for (const { name, query } of queries) {
      try {
        const response = await fetch('https://api.monday.com/v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': mondayApiKey,
          },
          body: JSON.stringify({ query }),
        });
        
        const data = await response.json();
        results[name] = data;
      } catch (e) {
        results[name] = { error: e.message };
      }
    }
    
    return Response.json(results);
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});