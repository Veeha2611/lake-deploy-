import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Sync Monday board with Projects from the app
 * 1. Get board structure
 * 2. Fetch projects from base44
 * 3. Update Monday items with project data
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
    
    // Step 1: Get board structure and items
    const boardQuery = `
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
                value
              }
            }
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
    const mondayItems = board?.items_page?.items || [];
    const columns = board?.columns || [];
    
    // Step 2: Try to fetch projects from base44 entities
    let projects = [];
    try {
      projects = await base44.asServiceRole.entities.Project.list();
    } catch (e) {
      // Project entity might not exist, that's ok
      console.log('No Project entity found');
    }
    
    return Response.json({
      board_name: board?.name,
      board_id: board?.id,
      
      // Monday info
      monday_items_count: mondayItems.length,
      monday_items: mondayItems.slice(0, 5), // First 5 items
      monday_columns: columns,
      
      // Base44 info
      projects_count: projects.length,
      projects: projects.slice(0, 5), // First 5 projects
      
      // Action plan
      action_plan: {
        step_1: `Board has ${mondayItems.length} items`,
        step_2: `Board has ${columns.length} columns`,
        step_3: `App has ${projects.length} projects in base44`,
        next: 'Create mapping between project fields and monday columns, then sync'
      }
    });
    
  } catch (error) {
    return Response.json({ 
      error: error.message, 
      stack: error.stack 
    }, { status: 500 });
  }
});