import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Test writing to Monday board to see what happens
 * Will try to update a column with a test value
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    const boardId = '18397523070';
    
    // Step 1: Get first item and its columns
    const getItemsQuery = `
      query {
        boards(ids: ${boardId}) {
          name
          items_page(limit: 1) {
            items {
              id
              name
              column_values {
                id
                title
                type
              }
            }
          }
          columns {
            id
            title
            type
          }
        }
      }
    `;
    
    const itemsResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayApiKey,
      },
      body: JSON.stringify({ query: getItemsQuery }),
    });
    
    const itemsData = await itemsResponse.json();
    const board = itemsData?.data?.boards?.[0];
    const firstItem = board?.items_page?.items?.[0];
    const allColumns = board?.columns || [];
    
    if (!firstItem) {
      return Response.json({
        error: 'No items on board',
        board_name: board?.name,
        columns: allColumns
      });
    }
    
    // Step 2: Try to update a numeric column (look for first numbers type)
    const numberCol = allColumns.find(c => c.type === 'numbers');
    
    if (!numberCol) {
      return Response.json({
        error: 'No numeric column found to test',
        board_name: board?.name,
        columns: allColumns,
        first_item: {
          id: firstItem.id,
          name: firstItem.name,
          column_values: firstItem.column_values
        }
      });
    }
    
    // Step 3: Try writing test value
    const updateQuery = `
      mutation {
        change_column_value(
          board_id: ${boardId},
          item_id: "${firstItem.id}",
          column_id: "${numberCol.id}",
          value: "9999"
        ) {
          id
          value
        }
      }
    `;
    
    const updateResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayApiKey,
      },
      body: JSON.stringify({ query: updateQuery }),
    });
    
    const updateData = await updateResponse.json();
    
    return Response.json({
      success: true,
      board_name: board?.name,
      first_item_id: firstItem.id,
      first_item_name: firstItem.name,
      test_column: {
        id: numberCol.id,
        title: numberCol.title,
        type: numberCol.type
      },
      test_value_sent: '9999',
      update_response: updateData,
      all_columns: allColumns
    });
    
  } catch (error) {
    return Response.json({ 
      error: error.message, 
      stack: error.stack 
    }, { status: 500 });
  }
});