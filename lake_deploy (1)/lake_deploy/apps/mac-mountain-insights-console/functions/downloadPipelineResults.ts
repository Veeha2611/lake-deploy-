import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { projectId } = body;

    if (!projectId) {
      return Response.json({ error: 'Project ID required' }, { status: 400 });
    }

    // Query for project model outputs
    const response = await base44.functions.invoke('listProjectModelOutputs', {
      project_id: projectId
    });

    if (!response.data.success || !response.data.outputs || response.data.outputs.length === 0) {
      return Response.json({ 
        error: 'No pipeline results found for this project',
        outputs: []
      }, { status: 404 });
    }

    const outputs = response.data.outputs;
    
    // Generate CSV from outputs
    let csvContent = 'Scenario Name,Metric,Value\n';
    
    outputs.forEach(output => {
      const scenarioName = output.scenario_name || 'Unknown';
      const metrics = output.results || {};
      
      Object.entries(metrics).forEach(([key, value]) => {
        const escapedValue = typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
        csvContent += `"${scenarioName}","${key}",${escapedValue}\n`;
      });
    });

    const encoder = new TextEncoder();
    const csvBytes = encoder.encode(csvContent);

    return new Response(csvBytes, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="pipeline_results_${projectId}_${new Date().toISOString().split('T')[0]}.csv"`
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    return Response.json({ 
      error: error.message
    }, { status: 500 });
  }
});