import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.614.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check Capital Committee permission
    const CAPITAL_COMMITTEE = ['patrick.cochran@icloud.com'];
    if (!CAPITAL_COMMITTEE.includes(user.email)) {
      return Response.json({ error: 'Only Capital Committee members can view submissions' }, { status: 403 });
    }

    const s3Client = new S3Client({
      region: 'us-east-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    const bucket = 'gwi-raw-us-east-2-pc';
    const prefix = 'raw/projects_pipeline/submissions/';

    // List all submission files
    const listResult = await s3Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix
    }));

    const submissions = [];
    if (listResult.Contents) {
      for (const obj of listResult.Contents) {
        try {
          const getResult = await s3Client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: obj.Key
          }));

          const content = await getResult.Body.transformToString();
          const submission = JSON.parse(content);
          
          // Extract submission_id from key
          const submission_id = obj.Key.split('/').pop().replace('.json', '');
          
          submissions.push({
            ...submission,
            submission_id,
            s3_key: obj.Key
          });
        } catch (error) {
          console.error(`Error reading ${obj.Key}:`, error);
        }
      }
    }

    // Sort by submitted_at descending
    submissions.sort((a, b) => 
      new Date(b.submitted_at) - new Date(a.submitted_at)
    );

    return Response.json({
      success: true,
      submissions
    });

  } catch (error) {
    console.error('List submissions error:', error);
    return Response.json({ 
      success: false,
      message: `Failed to list submissions: ${error.message}`
    }, { status: 500 });
  }
});