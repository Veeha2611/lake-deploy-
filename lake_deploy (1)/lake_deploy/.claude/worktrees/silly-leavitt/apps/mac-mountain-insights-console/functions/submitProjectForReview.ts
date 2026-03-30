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
    const { submission } = body;

    if (!submission) {
      return Response.json({ error: 'submission object required' }, { status: 400 });
    }

    const s3Client = new S3Client({
      region: 'us-east-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    const bucket = 'gwi-raw-us-east-2-pc';
    const submission_id = `submission_${Date.now()}`;
    
    // Write submission to S3
    const key = `raw/projects_pipeline/submissions/${submission_id}.json`;
    
    const submissionData = {
      submission_id,
      ...submission,
      status: 'pending_review',
      submitted_at: new Date().toISOString()
    };

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(submissionData, null, 2),
      ContentType: 'application/json'
    }));

    // TODO: Send notification email to Capital Committee
    // await base44.integrations.Core.SendEmail({
    //   to: 'patrick.cochran@icloud.com',
    //   subject: `New Project Submission: ${submission.project_name}`,
    //   body: `Project submitted by ${submission.submitted_by}\n\nReview at: [link to submissions view]`
    // });

    return Response.json({
      success: true,
      submission_id,
      s3_key: key,
      message: 'Project submitted for Capital Committee review'
    });

  } catch (error) {
    console.error('Submission error:', error);
    return Response.json({ 
      success: false,
      message: `Failed to submit: ${error.message}`
    }, { status: 500 });
  }
});