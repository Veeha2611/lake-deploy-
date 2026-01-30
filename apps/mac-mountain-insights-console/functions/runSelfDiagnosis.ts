import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SELF-DIAGNOSIS SEQUENCE
 * 
 * When a query returns empty/0 results, automatically run diagnostics:
 * 1. Verify latest dt partition exists
 * 2. Run rowcount on target table for latest dt
 * 3. If 0, query previous dt partitions (backward search up to N days)
 * 4. Verify user's filters aren't excluding data
 * 5. Return structured error with evidence and next steps
 * 
 * Input: { table_name, filters?, days_back? }
 * Output: { diagnosis, evidence, recommendations }
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    const { table_name, filters = {}, days_back = 7 } = await req.json();
    
    if (!table_name) {
      return Response.json({
        ok: false,
        error: 'Missing table_name parameter'
      }, { status: 400 });
    }
    
    const diagnosis = {
      table_name,
      timestamp: new Date().toISOString(),
      steps: []
    };
    
    // STEP 1: Check if latest partition exists
    console.log('[Self-Diagnosis] Step 1: Verify latest partition...');
    const partitionCheckSql = `SELECT MAX(dt) as latest_dt, COUNT(*) as total_rows FROM ${table_name} LIMIT 1`;
    
    let latestDt = null;
    let hasPartition = false;
    
    try {
      const partitionResult = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: partitionCheckSql }
      });
      
      const row = partitionResult?.data?.data_rows?.[0];
      const values = Array.isArray(row) ? row : Object.values(row || {});
      latestDt = values[0];
      const totalRows = values[1] || 0;
      
      diagnosis.steps.push({
        step: 1,
        name: 'Partition Check',
        status: latestDt ? 'PASS' : 'FAIL',
        latest_dt: latestDt,
        total_rows: totalRows,
        qid: partitionResult?.data?.athena_query_execution_id
      });
      
      hasPartition = !!latestDt;
    } catch (error) {
      diagnosis.steps.push({
        step: 1,
        name: 'Partition Check',
        status: 'ERROR',
        error: error.message
      });
    }
    
    if (!hasPartition) {
      return Response.json({
        diagnosis,
        recommendations: [
          'Table exists but has no data partitions',
          'Check ETL pipeline status',
          'Verify table is being populated correctly'
        ],
        severity: 'CRITICAL'
      });
    }
    
    // STEP 2: Row count for latest partition
    console.log('[Self-Diagnosis] Step 2: Row count for latest partition...');
    const rowCountSql = `SELECT COUNT(*) as row_count FROM ${table_name} WHERE dt = '${latestDt}' LIMIT 1`;
    
    let latestPartitionCount = 0;
    
    try {
      const rowCountResult = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql: rowCountSql }
      });
      
      const row = rowCountResult?.data?.data_rows?.[0];
      const values = Array.isArray(row) ? row : Object.values(row || {});
      latestPartitionCount = values[0] || 0;
      
      diagnosis.steps.push({
        step: 2,
        name: 'Latest Partition Row Count',
        status: latestPartitionCount > 0 ? 'PASS' : 'FAIL',
        latest_dt: latestDt,
        row_count: latestPartitionCount,
        qid: rowCountResult?.data?.athena_query_execution_id
      });
    } catch (error) {
      diagnosis.steps.push({
        step: 2,
        name: 'Latest Partition Row Count',
        status: 'ERROR',
        error: error.message
      });
    }
    
    // STEP 3: If latest is empty, backward search through previous partitions
    if (latestPartitionCount === 0) {
      console.log('[Self-Diagnosis] Step 3: Latest partition empty, searching backward...');
      const backwardSearchSql = `SELECT dt, COUNT(*) as row_count 
                                 FROM ${table_name} 
                                 GROUP BY dt 
                                 ORDER BY dt DESC 
                                 LIMIT ${days_back}`;
      
      try {
        const backwardResult = await base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { sql: backwardSearchSql }
        });
        
        const partitions = (backwardResult?.data?.data_rows || []).map(row => {
          const values = Array.isArray(row) ? row : Object.values(row);
          return { dt: values[0], row_count: values[1] };
        });
        
        const lastNonEmpty = partitions.find(p => p.row_count > 0);
        
        diagnosis.steps.push({
          step: 3,
          name: 'Backward Partition Search',
          status: lastNonEmpty ? 'FOUND' : 'FAIL',
          partitions_checked: partitions.length,
          last_non_empty_partition: lastNonEmpty,
          qid: backwardResult?.data?.athena_query_execution_id
        });
      } catch (error) {
        diagnosis.steps.push({
          step: 3,
          name: 'Backward Partition Search',
          status: 'ERROR',
          error: error.message
        });
      }
    }
    
    // STEP 4: Verify filters aren't over-constraining
    if (Object.keys(filters).length > 0) {
      console.log('[Self-Diagnosis] Step 4: Checking if filters exclude all data...');
      const noFilterSql = `SELECT COUNT(*) as row_count FROM ${table_name} WHERE dt = '${latestDt}' LIMIT 1`;
      
      try {
        const noFilterResult = await base44.functions.invoke('aiLayerQuery', {
          template_id: 'freeform_sql_v1',
          params: { sql: noFilterSql }
        });
        
        const row = noFilterResult?.data?.data_rows?.[0];
        const values = Array.isArray(row) ? row : Object.values(row || {});
        const totalWithoutFilters = values[0] || 0;
        
        diagnosis.steps.push({
          step: 4,
          name: 'Filter Impact Check',
          status: totalWithoutFilters > 0 ? 'PASS' : 'FAIL',
          rows_without_filters: totalWithoutFilters,
          rows_with_filters: latestPartitionCount,
          filters_applied: filters,
          qid: noFilterResult?.data?.athena_query_execution_id
        });
      } catch (error) {
        diagnosis.steps.push({
          step: 4,
          name: 'Filter Impact Check',
          status: 'ERROR',
          error: error.message
        });
      }
    }
    
    // Generate recommendations
    const recommendations = [];
    const severity = latestPartitionCount === 0 ? 'HIGH' : 'LOW';
    
    if (latestPartitionCount === 0) {
      recommendations.push('Latest partition has 0 rows - ETL may have failed');
      recommendations.push(`Check partition date: ${latestDt}`);
      
      const backwardStep = diagnosis.steps.find(s => s.step === 3);
      if (backwardStep?.last_non_empty_partition) {
        recommendations.push(`Last valid data: ${backwardStep.last_non_empty_partition.dt} (${backwardStep.last_non_empty_partition.row_count} rows)`);
      } else {
        recommendations.push('No valid data found in last 7 days - critical ETL failure');
      }
    }
    
    const filterStep = diagnosis.steps.find(s => s.step === 4);
    if (filterStep && filterStep.rows_without_filters > 0 && filterStep.rows_with_filters === 0) {
      recommendations.push('Filters are excluding all data - try broader criteria');
    }
    
    return Response.json({
      diagnosis,
      recommendations,
      severity,
      guard_status: latestPartitionCount > 0 ? 'OK' : 'FAIL',
      evidence: {
        table_name,
        latest_dt: latestDt,
        latest_partition_row_count: latestPartitionCount,
        diagnostic_steps: diagnosis.steps.length
      }
    });
    
  } catch (error) {
    console.error('[runSelfDiagnosis] Exception:', error);
    return Response.json({
      ok: false,
      error: error.message,
      hint: 'Self-diagnosis sequence failed'
    }, { status: 500 });
  }
});