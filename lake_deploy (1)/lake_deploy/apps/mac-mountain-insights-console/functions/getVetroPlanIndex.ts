import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Query to get plan index from Athena
    const sql = `
      WITH plan_features AS (
        SELECT 
          plan_id,
          plan_name,
          COUNT(*) as service_location_count,
          COUNT(DISTINCT CASE WHEN broadband_status IS NOT NULL THEN 1 END) as has_broadband_status_count,
          COUNT(DISTINCT CASE WHEN bsl_id IS NOT NULL THEN 1 END) as has_bsl_id_count,
          COUNT(DISTINCT CASE WHEN broadband_status = 'Served' THEN 1 END) as served_count
        FROM curated_vetro.service_locations
        WHERE plan_id IS NOT NULL
        GROUP BY plan_id, plan_name
      )
      SELECT 
        plan_id,
        plan_name,
        service_location_count,
        CASE 
          WHEN has_broadband_status_count > 0 THEN true 
          ELSE false 
        END as has_broadband_status,
        CASE 
          WHEN has_bsl_id_count > 0 THEN true 
          ELSE false 
        END as has_bsl_id,
        served_count,
        ROUND(CAST(served_count AS DOUBLE) / CAST(service_location_count AS DOUBLE) * 100, 1) as served_pct
      FROM plan_features
      ORDER BY service_location_count DESC
      LIMIT 100
    `;

    try {
      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql }
      });

      const plans = (response.data?.data_rows || []).map(row => ({
        plan_id: row[0],
        plan_name: row[1],
        service_location_count: row[2],
        has_broadband_status: row[3],
        has_bsl_id: row[4],
        served_count: row[5],
        served_pct: row[6]
      }));

      return Response.json({
        success: true,
        plans,
        total_plans: plans.length
      });

    } catch (queryError) {
      // Fallback: return sample/template data with explanation
      return Response.json({
        success: false,
        error: 'Vetro plan data not available in Athena',
        reason: queryError.message,
        data_needed: {
          source: 'Vetro',
          table: 'curated_vetro.service_locations',
          required_columns: ['plan_id', 'plan_name', 'service_location_id', 'broadband_status', 'bsl_id', 'latitude', 'longitude'],
          grain: 'service_location'
        },
        plans: [
          {
            plan_id: 'SAMPLE_2682',
            plan_name: 'DVFiber (Sample)',
            service_location_count: 0,
            has_broadband_status: false,
            has_bsl_id: false,
            served_count: 0,
            served_pct: 0,
            is_sample: true
          }
        ]
      });
    }

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});