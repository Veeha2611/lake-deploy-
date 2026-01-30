import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand, GetObjectCommand } from 'npm:@aws-sdk/client-s3';

const s3 = new S3Client({
  region: Deno.env.get("AWS_REGION") || 'us-east-2',
  credentials: {
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID"),
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY"),
  },
});

const BUCKET = 'gwi-raw-us-east-2-pc';
const CATALOG_KEY = 'mac/architecture_catalog.json';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.email !== 'patrick.cochran@icloud.com') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { action, entry } = await req.json();

    if (action === 'add') {
      // Load existing catalog
      let catalog = { entries: [] };
      try {
        const getResponse = await s3.send(new GetObjectCommand({
          Bucket: BUCKET,
          Key: CATALOG_KEY
        }));
        const body = await getResponse.Body.transformToString();
        catalog = JSON.parse(body);
      } catch (error) {
        console.log('No existing catalog, starting fresh');
      }

      // Add new entry
      const newEntry = {
        timestamp: new Date().toISOString(),
        version: entry.version || 'v2.0.x',
        summary: entry.summary || 'Update',
        surfaces_affected: entry.surfaces_affected || [],
        files_changed: entry.files_changed || [],
        aws_surfaces: entry.aws_surfaces || [],
        verification: entry.verification || [],
        user: user.email
      };

      catalog.entries.unshift(newEntry);

      // Save back to S3
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: CATALOG_KEY,
        Body: JSON.stringify(catalog, null, 2),
        ContentType: 'application/json'
      }));

      return Response.json({
        success: true,
        entry: newEntry,
        total_entries: catalog.entries.length
      });
    }

    if (action === 'list') {
      try {
        const getResponse = await s3.send(new GetObjectCommand({
          Bucket: BUCKET,
          Key: CATALOG_KEY
        }));
        const body = await getResponse.Body.transformToString();
        const catalog = JSON.parse(body);
        return Response.json({ success: true, catalog });
      } catch (error) {
        return Response.json({ success: true, catalog: { entries: [] } });
      }
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});