import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from 'npm:@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: 'us-east-2',
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
  },
});

const BUCKET = 'gwi-raw-us-east-2-pc';
const PREFIX = 'raw/projects_pipeline/';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.email !== 'patrick.cochran@icloud.com') {
      return Response.json({ error: 'Forbidden: Only patrick.cochran@icloud.com can clear S3' }, { status: 403 });
    }

    // List all objects with the prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: PREFIX,
    });

    const listResponse = await s3Client.send(listCommand);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return Response.json({
        success: true,
        message: 'No objects found to delete',
        deleted_count: 0
      });
    }

    // Delete all objects
    const objectsToDelete = listResponse.Contents.map(obj => ({ Key: obj.Key }));

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: {
        Objects: objectsToDelete,
      },
    });

    const deleteResponse = await s3Client.send(deleteCommand);

    return Response.json({
      success: true,
      message: `Cleared ${objectsToDelete.length} objects from projects pipeline`,
      deleted_count: objectsToDelete.length,
      deleted_keys: objectsToDelete.map(o => o.Key)
    });

  } catch (error) {
    console.error('clearProjectsS3 error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});