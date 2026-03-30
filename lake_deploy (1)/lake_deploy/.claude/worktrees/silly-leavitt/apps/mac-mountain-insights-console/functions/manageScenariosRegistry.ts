import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, GetObjectCommand, PutObjectCommand } from 'npm:@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: 'us-east-2',
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
  },
});

const BUCKET = 'gwi-raw-us-east-2-pc';

/**
 * Load scenarios.json for a project, or return empty structure if not exists
 */
async function loadScenariosRegistry(projectId) {
  const key = `raw/projects_pipeline/model_outputs/${projectId}/scenarios.json`;
  
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const response = await s3Client.send(command);
    const body = await response.Body.transformToString();
    return JSON.parse(body);
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return {
        project_id: projectId,
        scenarios: []
      };
    }
    throw error;
  }
}

/**
 * Save scenarios.json for a project
 */
async function saveScenariosRegistry(projectId, registry) {
  const key = `raw/projects_pipeline/model_outputs/${projectId}/scenarios.json`;
  
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: JSON.stringify(registry, null, 2),
    ContentType: 'application/json',
  });
  
  await s3Client.send(command);
  return key;
}

/**
 * Add or update a scenario in the registry
 */
function upsertScenario(registry, scenario) {
  const existingIndex = registry.scenarios.findIndex(s => s.scenario_id === scenario.scenario_id);
  
  if (existingIndex >= 0) {
    // Update existing
    registry.scenarios[existingIndex] = {
      ...registry.scenarios[existingIndex],
      ...scenario,
      updated_at: new Date().toISOString()
    };
  } else {
    // Add new
    registry.scenarios.push({
      ...scenario,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  
  return registry;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, project_id, scenario } = await req.json();

    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }

    // Load registry
    const registry = await loadScenariosRegistry(project_id);

    if (action === 'get') {
      return Response.json({ success: true, registry });
    }

    if (action === 'upsert') {
      if (!scenario || !scenario.scenario_id) {
        return Response.json({ error: 'scenario with scenario_id required for upsert' }, { status: 400 });
      }

      const updatedRegistry = upsertScenario(registry, scenario);
      const key = await saveScenariosRegistry(project_id, updatedRegistry);

      return Response.json({
        success: true,
        registry: updatedRegistry,
        s3_key: key
      });
    }

    return Response.json({ error: 'Invalid action. Use "get" or "upsert"' }, { status: 400 });

  } catch (error) {
    console.error('manageScenariosRegistry error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});