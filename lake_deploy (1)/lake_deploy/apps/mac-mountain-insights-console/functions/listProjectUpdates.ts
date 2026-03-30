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

    const s3Client = new S3Client({
      region: 'us-east-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    const { action, key } = await req.json();

    // List all files in the input directory
    if (action === 'list') {
      const command = new ListObjectsV2Command({
        Bucket: 'gwi-raw-us-east-2-pc',
        Prefix: 'raw/projects_pipeline/input/',
        MaxKeys: 100,
      });

      const response = await s3Client.send(command);
      
      const files = (response.Contents || [])
        .filter(obj => obj.Key.endsWith('.csv'))
        .map(obj => {
          const fileName = obj.Key.split('/').pop();
          return {
            key: obj.Key,
            file_name: fileName,
            size_bytes: obj.Size,
            last_modified: obj.LastModified.toISOString(),
            is_test: fileName.startsWith('test_projects_input__'),
          };
        })
        .sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified));

      console.log('Listed S3 files:', { count: files.length, files });
      return Response.json({ success: true, files });
    }

    // Get download URL for a specific file
    if (action === 'download' && key) {
      const command = new GetObjectCommand({
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: key,
        ResponseContentDisposition: `attachment; filename="${key.split('/').pop()}"`
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });
      return Response.json({ 
        success: true, 
        key,
        download_url: url,
        expires_in_seconds: 900
      });
    }

    // Get file content
    if (action === 'content' && key) {
      const command = new GetObjectCommand({
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: key,
      });

      const response = await s3Client.send(command);
      const content = await response.Body.transformToString();
      
      return Response.json({ success: true, key, content });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('List project updates error:', error);
    console.error('Error stack:', error.stack);
    return Response.json({ 
      success: false,
      message: `Failed to process request: ${error.message}`
    }, { status: 500 });
  }
});