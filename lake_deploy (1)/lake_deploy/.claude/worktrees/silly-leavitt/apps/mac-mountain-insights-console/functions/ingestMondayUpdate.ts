import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.662.0';

const s3Client = new S3Client({
  region: 'us-east-2',
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')
  }
});

// CSV escaping function
function escapeCsvValue(val) {
  const str = String(val || '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // For webhooks, we might not have user auth, so validate via API key or shared secret
    const authHeader = req.headers.get('x-api-key') || req.headers.get('authorization');
    const expectedKey = Deno.env.get('MONDAY_WEBHOOK_SECRET') || 'temp-dev-key';
    
    if (authHeader !== expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      return Response.json({ error: 'Unauthorized webhook' }, { status: 401 });
    }

    const body = await req.json();
    
    // Monday.com webhook payload structure
    const {
      board_id,
      item_id,
      item_name,
      column_values = {},
      updated_at,
      updated_by
    } = body;

    // Stage 1: Save raw Monday payload to staging
    const rawTimestamp = new Date().toISOString().replace(/[:.]/g, '').replace('Z', '000Z');
    const stagingKey = `raw/projects_pipeline/monday_staging/monday_update_${rawTimestamp}.json`;
    
    const stagingCommand = new PutObjectCommand({
      Bucket: 'gwi-raw-us-east-2-pc',
      Key: stagingKey,
      Body: JSON.stringify(body, null, 2),
      ContentType: 'application/json'
    });

    await s3Client.send(stagingCommand);

    // Stage 2: Transform to project format
    const project = {
      project_id: column_values.project_id || `monday-${item_id}`,
      entity: column_values.entity || '',
      project_name: column_values.project_name || item_name || '',
      project_type: column_values.project_type || '',
      state: column_values.state || 'Active',
      partner_share_raw: column_values.partner_share_raw || '',
      investor_label: column_values.investor_label || '',
      stage: column_values.stage || '',
      priority: column_values.priority || 'Medium',
      owner: column_values.owner || updated_by || '',
      notes: column_values.notes || '',
      is_test: column_values.is_test || false
    };

    // Validate required fields
    if (!project.entity || !project.project_name) {
      return Response.json({
        success: false,
        error: 'Missing required fields: entity, project_name',
        staging_key: stagingKey
      }, { status: 400 });
    }

    // Stage 3: Create CSV and save to input directory
    const csvRow = [
      project.project_id,
      project.entity,
      project.project_name,
      project.project_type,
      project.state,
      project.partner_share_raw,
      project.investor_label,
      project.stage,
      project.priority,
      project.owner,
      project.notes,
      project.is_test ? 'true' : 'false'
    ].map(escapeCsvValue).join(',');

    const csvContent = `project_id,entity,project_name,project_type,state,partner_share_raw,investor_label,stage,priority,owner,notes,is_test\n${csvRow}\n`;

    const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '').replace('Z', '000Z');
    const inputKey = `raw/projects_pipeline/input/projects_input__${fileTimestamp}.csv`;

    const inputCommand = new PutObjectCommand({
      Bucket: 'gwi-raw-us-east-2-pc',
      Key: inputKey,
      Body: csvContent,
      ContentType: 'text/csv; charset=utf-8'
    });

    await s3Client.send(inputCommand);

    console.log('Monday update processed:', {
      item_id,
      project_id: project.project_id,
      staging_key: stagingKey,
      input_key: inputKey
    });

    return Response.json({
      success: true,
      message: 'Monday update processed and saved to S3',
      project_id: project.project_id,
      staging_key: stagingKey,
      input_key: inputKey,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Monday ingestion error:', error);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});