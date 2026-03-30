import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { plan_id, search_query } = await req.json();

    if (!plan_id) {
      return Response.json({ error: 'plan_id is required' }, { status: 400 });
    }

    // Build WHERE clause based on search query
    let searchFilter = '';
    if (search_query) {
      const q = search_query.toLowerCase();
      if (q.includes('underserved') || q.includes('unserved')) {
        searchFilter = " AND (broadband_status != 'Served' OR broadband_status IS NULL)";
      } else if (q.includes('served')) {
        searchFilter = " AND broadband_status = 'Served'";
      } else if (q.includes('commercial')) {
        searchFilter = " AND class = 'Commercial'";
      } else if (q.includes('residential')) {
        searchFilter = " AND class = 'Residential'";
      } else {
        // Fuzzy search on city/state
        searchFilter = ` AND (LOWER(city) LIKE '%${q}%' OR LOWER(state) LIKE '%${q}%')`;
      }
    }

    const sql = `
      SELECT 
        service_location_id,
        city,
        state,
        class,
        broadband_status,
        network_status,
        drop_status,
        bsl_id,
        latitude,
        longitude,
        build
      FROM curated_vetro.service_locations
      WHERE plan_id = '${plan_id}'
        ${searchFilter}
      LIMIT 1000
    `;

    try {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql }
      });

      const features = (response.data?.data_rows || []).map(row => ({
        service_location_id: row[0],
        city: row[1],
        state: row[2],
        class: row[3],
        broadband_status: row[4],
        network_status: row[5],
        drop_status: row[6],
        bsl_id: row[7],
        latitude: row[8],
        longitude: row[9],
        build: row[10]
      }));

      // Check for data limitations
      const limitations = [];
      const hasBroadbandStatus = features.some(f => f.broadband_status);
      const hasBslId = features.some(f => f.bsl_id);

      if (!hasBroadbandStatus) {
        limitations.push('This plan export does not contain Broadband Status field. Cannot compute served footprint.');
      }
      if (!hasBslId) {
        limitations.push('This plan export does not contain BSL_ID. Broadband Serviceable Locations data unavailable.');
      }

      return Response.json({
        success: true,
        plan_id,
        search_query,
        features,
        total_features: features.length,
        limitations: limitations.length > 0 ? limitations : null,
        sql_executed: sql
      });

    } catch (queryError) {
      return Response.json({
        success: false,
        error: 'Failed to query Vetro features',
        reason: queryError.message,
        sql_attempted: sql,
        data_needed: {
          source: 'Vetro',
          table: 'curated_vetro.service_locations',
          required_for: `Plan ${plan_id} service locations`,
          grain: 'service_location'
        }
      });
    }

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});