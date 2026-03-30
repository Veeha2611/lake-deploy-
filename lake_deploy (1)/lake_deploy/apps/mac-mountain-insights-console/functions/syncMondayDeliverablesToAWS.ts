import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.705.0';

/**
 * MONDAY → AWS SYNC (Bi-directional with field-level control)
 * 
 * Architecture:
 * - Monday allows edits ONLY on: state, stage, priority, owner, notes
 * - All other fields are read-only (managed by AWS)
 * - Writes to append-only table: curated_core.project_updates
 * - Daily load process merges these updates into curated_core.projects_enriched
 * - NO direct writes to projects_enriched
 * - Only syncs items with Module Type = "Project Pipeline" AND Sync to AWS = checked
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = await req.json();
    
    // Monday webhook payload structure
    const { event } = payload;
    
    if (!event) {
      return Response.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }
    
    // Verify it's from the deliverables board
    const boardId = event.boardId || event.board_id;
    if (boardId !== 18396205202 && boardId !== '18396205202') {
      return Response.json({ 
        error: 'Ignored - not deliverables board',
        received_board: boardId 
      }, { status: 200 });
    }
    
    // Get Monday credentials
    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    if (!mondayApiKey) {
      return Response.json({ error: 'MONDAY_API_KEY not configured' }, { status: 500 });
    }
    
    // Fetch the updated item from Monday
    const itemId = event.pulseId || event.item_id;
    const query = `
      query {
        items(ids: [${itemId}]) {
          id
          name
          column_values {
            id
            title
            text
            value
          }
        }
      }
    `;
    
    const mondayResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayApiKey,
      },
      body: JSON.stringify({ query }),
    });
    
    const mondayData = await mondayResponse.json();
    const item = mondayData?.data?.items?.[0];
    
    if (!item) {
      return Response.json({ error: 'Item not found in Monday' }, { status: 404 });
    }
    
    // Extract column values
    const columnValues = {};
    item.column_values.forEach(col => {
      columnValues[col.title] = col.text || col.value;
    });
    
    const projectId = columnValues['Project ID'];
    if (!projectId) {
      return Response.json({ error: 'No Project ID found' }, { status: 400 });
    }
    
    // CHECK MODULE TYPE: Only sync if tagged as "Project Pipeline"
    const moduleType = columnValues['Module Type'];
    if (moduleType !== 'Project Pipeline') {
      return Response.json({ 
        message: 'Sync skipped - Module Type is not "Project Pipeline"',
        project_id: projectId,
        module_type: moduleType
      }, { status: 200 });
    }
    
    // CHECK TRIGGER: Only sync if "Sync to AWS" is checked
    const syncToAWS = columnValues['Sync to AWS'];
    if (syncToAWS !== 'true' && syncToAWS !== true && syncToAWS !== 'checked') {
      return Response.json({ 
        message: 'Sync skipped - "Sync to AWS" toggle is OFF',
        project_id: projectId 
      }, { status: 200 });
    }
    
    // FIELD-LEVEL CONTROL: Extract ONLY allowed fields (aligned with Projects module)
    const allowedFields = {
      state: columnValues['State'],
      stage: columnValues['Stage'],
      priority: columnValues['Priority'],
      owner: columnValues['Owner'],
      notes: columnValues['Notes']
    };
    
    // Filter out null/undefined values
    const updates = {};
    Object.keys(allowedFields).forEach(key => {
      if (allowedFields[key] !== null && allowedFields[key] !== undefined && allowedFields[key] !== '') {
        updates[key] = allowedFields[key];
      }
    });
    
    if (Object.keys(updates).length === 0) {
      return Response.json({ 
        message: 'No allowed fields were updated',
        project_id: projectId 
      }, { status: 200 });
    }
    
    // Create append-only log entry
    const updateRecord = {
      project_id: projectId,
      updated_at: new Date().toISOString(),
      updated_by: user.email,
      source: 'monday_webhook',
      updates: updates
    };
    
    // Write to S3 as append-only log (curated_core.deliverables_updates)
    const s3Client = new S3Client({
      region: 'us-east-1',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
      },
    });
    
    const bucketName = 'macmtn-curated-data';
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const s3Key = `project_updates/dt=${new Date().toISOString().split('T')[0]}/update_${timestamp}_${projectId}.json`;
    
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: JSON.stringify(updateRecord, null, 2),
      ContentType: 'application/json',
      Metadata: {
        project_id: projectId,
        updated_by: user.email,
        source: 'monday_webhook'
      }
    });
    
    await s3Client.send(putCommand);
    
    return Response.json({
      success: true,
      project_id: projectId,
      s3_key: s3Key,
      allowed_updates: updates,
      timestamp: updateRecord.updated_at,
      updated_by: user.email,
      architecture_note: 'Update logged to curated_core.project_updates - will merge to curated_core.projects_enriched in daily load'
    });
    
  } catch (error) {
    return Response.json({ 
      error: error.message, 
      stack: error.stack 
    }, { status: 500 });
  }
});