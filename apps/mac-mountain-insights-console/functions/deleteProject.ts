import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3.614.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { s3_key } = body;

    if (!s3_key) {
      return Response.json({ error: 'S3 key required' }, { status: 400 });
    }

    // Configure S3 client
    const s3Client = new S3Client({
      region: 'us-east-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    // Delete the file
    const command = new DeleteObjectCommand({
      Bucket: 'gwi-raw-us-east-2-pc',
      Key: s3_key,
    });

    const result = await s3Client.send(command);
    
    console.log('S3 deletion successful:', {
      s3_key,
      result: JSON.stringify(result)
    });

    return Response.json({ 
      success: true, 
      message: 'Project deleted successfully.'
    });

  } catch (error) {
    console.error('Delete project error:', error);
    return Response.json({ 
      success: false,
      message: `Failed to delete project: ${error.message}`
    }, { status: 500 });
  }
});