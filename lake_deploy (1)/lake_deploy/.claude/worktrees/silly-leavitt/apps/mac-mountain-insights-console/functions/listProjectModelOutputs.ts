import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.614.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.614.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, action, key } = body;

    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // Configure S3
    const s3Client = new S3Client({
      region: 'us-east-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    const bucket = 'gwi-raw-us-east-2-pc';

    // Handle list action - list runs and their outputs
    if (action === 'list') {
      const prefix = `raw/projects_pipeline/model_outputs/${project_id}/`;

      const listResult = await s3Client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000
      }));

      const runs = {};
      
      if (listResult.Contents) {
        for (const obj of listResult.Contents) {
          // Parse: raw/projects_pipeline/model_outputs/<project_id>/<scenario_id>/<run_id>/<filename>
          const parts = obj.Key.replace(prefix, '').split('/');
          if (parts.length >= 3) {
            const scenario_id = parts[0];
            const run_id = parts[1];
            const file_name = parts[parts.length - 1];
            const runKey = `${scenario_id}/${run_id}`;
            
            if (!runs[runKey]) {
              runs[runKey] = {
                scenario_id,
                run_id,
                scenario_name: null, // Will be populated from inputs.json if available
                files: [],
                created: obj.LastModified,
                metrics: null // Will be populated from summary_metrics.csv
              };
            }
            
            runs[runKey].files.push({
              key: obj.Key,
              file_name,
              file_type: file_name.replace('.csv', '').replace('.json', ''),
              last_modified: obj.LastModified,
              size_bytes: obj.Size
            });
          }
        }
      }

      // For each run, try to load the inputs.json to get scenario_name and metrics
      for (const runKey of Object.keys(runs)) {
        const run = runs[runKey];
        
        // Try to read inputs.json for scenario_name
        const inputsFile = run.files.find(f => f.file_name === 'inputs.json');
        if (inputsFile) {
          try {
            const getResult = await s3Client.send(new GetObjectCommand({
              Bucket: bucket,
              Key: inputsFile.key
            }));
            const content = await getResult.Body.transformToString();
            const inputsData = JSON.parse(content);
            
            // Get scenario_name - NEVER use "Unnamed Scenario"
            if (inputsData.scenario_name && inputsData.scenario_name.trim().length > 0 && inputsData.scenario_name !== 'Unnamed Scenario') {
              run.scenario_name = inputsData.scenario_name;
            }
          } catch (err) {
            console.log('Could not read inputs.json for run', runKey, err.message);
          }
        }
        
        // Try to read summary_metrics.csv for metrics
        const metricsFile = run.files.find(f => f.file_name === 'summary_metrics.csv');
        if (metricsFile) {
          try {
            const getResult = await s3Client.send(new GetObjectCommand({
              Bucket: bucket,
              Key: metricsFile.key
            }));
            const content = await getResult.Body.transformToString();
            
            // Parse CSV
            const metrics = {};
            const lines = content.split('\n');
            for (let i = 1; i < lines.length; i++) {
              const [metric, value] = lines[i].split(',');
              if (metric && value !== undefined) {
                metrics[metric] = value;
              }
            }
            run.metrics = metrics;
          } catch (err) {
            console.log('Could not read summary_metrics.csv for run', runKey, err.message);
          }
        }
      }

      // Convert to array and sort by created descending
      const runsList = Object.values(runs).sort((a, b) => 
        new Date(b.created) - new Date(a.created)
      );

      return Response.json({ success: true, runs: runsList });
    }

    // Handle download action
    if (action === 'download') {
      if (!key) {
        return Response.json({ error: 'key required for download action' }, { status: 400 });
      }

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${key.split('/').pop()}"`
      });

      const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 min

      return Response.json({ 
        success: true,
        key,
        download_url: downloadUrl,
        expires_in_seconds: 900
      });
    }

    // Handle content action (for preview)
    if (action === 'content') {
      if (!key) {
        return Response.json({ error: 'key required for content action' }, { status: 400 });
      }

      const getResult = await s3Client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key
      }));

      const content = await getResult.Body.transformToString();

      return Response.json({ 
        success: true, 
        content 
      });
    }

    return Response.json({ error: 'Invalid action. Use list, download, or content.' }, { status: 400 });

  } catch (error) {
    console.error('listProjectModelOutputs error:', error);
    return Response.json({ 
      success: false,
      message: `Failed: ${error.message}`
    }, { status: 500 });
  }
});