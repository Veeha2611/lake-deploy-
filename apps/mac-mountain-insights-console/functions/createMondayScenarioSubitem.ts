import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Creates a Monday.com subitem under a project row when scenario is saved
 * Called after scenario save in Projects module
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      monday_item_id,
      monday_board_id,
      scenario_name,
      npv,
      irr_pct,
      moic,
      cash_invested,
      peak_subs,
      peak_ebitda
    } = await req.json();

    // Validate inputs
    if (!monday_item_id || !monday_board_id || !scenario_name) {
      return Response.json({
        error: 'Missing required fields: monday_item_id, monday_board_id, scenario_name'
      }, { status: 400 });
    }

    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    if (!mondayApiKey) {
      return Response.json({
        error: 'MONDAY_API_KEY not configured'
      }, { status: 500 });
    }

    // Create subitem mutation
    const createSubitemQuery = `
      mutation {
        create_subitem(
          parent_item_id: ${monday_item_id},
          item_name: "${scenario_name.replace(/"/g, '\\"')}"
        ) {
          id
          name
        }
      }
    `;

    const createResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayApiKey,
      },
      body: JSON.stringify({ query: createSubitemQuery }),
    });

    const createData = await createResponse.json();
    if (createData.errors) {
      console.error('Monday create subitem error:', createData.errors);
      return Response.json({
        error: 'Failed to create subitem',
        details: createData.errors
      }, { status: 500 });
    }

    const subitemId = createData.data?.create_subitem?.id;
    if (!subitemId) {
      return Response.json({
        error: 'Failed to get subitem ID from response'
      }, { status: 500 });
    }

    // Update subitem with financial metrics
    // Note: Column IDs must match your Monday board setup
    const updateQuery = `
      mutation {
        change_multiple_column_values(
          item_id: ${subitemId},
          board_id: "${monday_board_id}",
          column_values: "${JSON.stringify([
            { column_id: 'numbers1', value: String(npv || 0) },
            { column_id: 'numbers2', value: String(irr_pct || 0) },
            { column_id: 'numbers3', value: String(moic || 0) },
            { column_id: 'numbers4', value: String(cash_invested || 0) },
            { column_id: 'numbers5', value: String(peak_subs || 0) },
            { column_id: 'numbers6', value: String(peak_ebitda || 0) },
            { column_id: 'date1', value: new Date().toISOString().split('T')[0] }
          ]).replace(/"/g, '\\"')}"
        ) {
          id
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
    if (updateData.errors) {
      console.error('Monday update subitem error:', updateData.errors);
      // Don't fail if update fails—subitem was created
      return Response.json({
        status: 'partial_success',
        subitem_id: subitemId,
        warning: 'Subitem created but failed to update all metrics',
        errors: updateData.errors
      });
    }

    console.log('Subitem created and updated:', {
      subitem_id: subitemId,
      scenario_name,
      npv,
      irr_pct,
      moic
    });

    return Response.json({
      status: 'success',
      subitem_id: subitemId,
      scenario_name
    });

  } catch (error) {
    console.error('Create subitem error:', error);
    return Response.json({
      status: 'error',
      error: error.message
    }, { status: 500 });
  }
});