import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.654.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.654.0';

const S3_BUCKET = 'gwi-mac-knowledge-us-east-1-pc';
const S3_REGION = 'us-east-1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null); // Allow public access

    const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      return Response.json({ 
        ok: false, 
        error: 'AWS credentials not configured' 
      }, { status: 500 });
    }

    const s3Client = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey
      }
    });

    const { action, key } = await req.json();

    if (action === 'get_signed_url' && key) {
      const getCommand = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key
      });
      
      const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
      
      return Response.json({ 
        ok: true, 
        signed_url: signedUrl
      });
    }

    if (action === 'list') {
      const command = new ListObjectsV2Command({
        Bucket: S3_BUCKET
      });

      const response = await s3Client.send(command);
      
      const documents = (response.Contents || []).map(item => ({
        key: item.Key,
        name: item.Key.split('/').pop(),
        size: item.Size || 0,
        lastModified: item.LastModified?.toISOString() || null,
        url: `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${item.Key}`
      }));

      return Response.json({ ok: true, documents });
    }

    if (action === 'summarize' && key) {
      // Generate signed URL for private document access
      const getCommand = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key
      });
      
      const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
      
      // Use LLM to summarize
      const summary = await base44.integrations.Core.InvokeLLM({
        prompt: `Summarize this document from ${key}. Focus on:
- Main topics and purpose
- Key metrics or data points mentioned
- Actionable insights for business analysis
- How it relates to customer analytics, revenue, or operations

Keep summary to 2-3 concise bullet points.`,
        file_urls: [signedUrl]
      });

      return Response.json({ 
        ok: true, 
        key,
        summary: summary.response || 'Unable to generate summary'
      });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    return Response.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 });
  }
});