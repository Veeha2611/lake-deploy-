import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.614.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project } = body;

    if (!project) {
      return Response.json({ error: 'Project data required' }, { status: 400 });
    }

    // Configure S3 client
    const s3Client = new S3Client({
      region: 'us-east-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    // Validate required fields (only entity and project_name are required)
    if (!project.entity || !project.project_name) {
      return Response.json({ 
        success: false, 
        message: 'Missing required fields: entity, project_name' 
      }, { status: 400 });
    }

    // Validate stage if provided
    const validStages = ['Term Sheet / NDA', 'Project Discussion', 'Contract Discussion', 'Final Documents Negotiation', 'Signed'];
    if (project.stage && !validStages.includes(project.stage)) {
      return Response.json({ 
        success: false, 
        message: `Invalid stage. Must be one of: ${validStages.join(', ')}` 
      }, { status: 400 });
    }

    // Validate priority
    const validPriorities = ['Low', 'Medium', 'High', 'Must Win'];
    if (!validPriorities.includes(project.priority)) {
      return Response.json({ 
        success: false, 
        message: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` 
      }, { status: 400 });
    }

    // Generate project_id if not provided
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 20) + 'Z';
    const slug = project.project_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const projectId = project.project_id || `${slug}-${timestamp}`;

    // Check if this is test data (default to false)
    const isTest = project.is_test || false;

    // Proper CSV escaping function
    const escapeCsvValue = (val) => {
      const str = String(val || '');
      // If contains comma, quote, CR, or LF, must quote and escape internal quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV row with proper escaping
    const csvRow = [
      projectId,
      project.entity || '',
      project.project_name || '',
      project.project_type || '',
      project.state || '',
      project.partner_share_raw || '',
      project.investor_label || '',
      project.stage || '',
      project.priority || '',
      project.owner || '',
      project.notes || '',
      isTest ? 'true' : 'false'
    ].map(escapeCsvValue).join(',');

    // Create CSV content with header (include is_test column)
    const csvContent = `project_id,entity,project_name,project_type,state,partner_share_raw,investor_label,stage,priority,owner,notes,is_test\n${csvRow}\n`;

    // Generate timestamp-based filename with test prefix if needed
    const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '').replace('Z', '000Z');
    const prefix = isTest ? 'test_' : '';
    const key = `raw/projects_pipeline/input/${prefix}projects_input__${fileTimestamp}.csv`;

    // Upload to S3 with proper metadata
    const command = new PutObjectCommand({
      Bucket: 'gwi-raw-us-east-2-pc',
      Key: key,
      Body: csvContent,
      ContentType: 'text/csv; charset=utf-8',
      ContentDisposition: `attachment; filename="${key.split('/').pop()}"`,
    });

    const uploadResult = await s3Client.send(command);
    console.log('S3 upload successful:', {
      key,
      projectId,
      isTest,
      uploadResult: JSON.stringify(uploadResult)
    });

    return Response.json({ 
      success: true, 
      project_id: projectId,
      s3_key: key,
      is_test: isTest,
      message: 'Project saved to S3 change-file.'
    });

  } catch (error) {
    console.error('Save project error:', error);
    console.error('Error stack:', error.stack);
    return Response.json({ 
      success: false,
      message: `Failed to save project: ${error.message}`
    }, { status: 500 });
  }
});