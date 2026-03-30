import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.614.0';

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
      return Response.json({ error: 'Only Capital Committee members can promote submissions' }, { status: 403 });
    }

    const body = await req.json();
    const { submission_id, submission } = body;

    if (!submission_id || !submission) {
      return Response.json({ error: 'submission_id and submission required' }, { status: 400 });
    }

    const s3Client = new S3Client({
      region: 'us-east-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    const bucket = 'gwi-raw-us-east-2-pc';
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    
    // Create official project record
    const project_id = submission.project_id || `proj_${Date.now()}`;
    const projectRecord = {
      project_id,
      project_name: submission.project_name,
      entity: submission.entity,
      state: submission.state,
      project_type: submission.project_type,
      stage: 'project_discussion',
      priority: 'medium',
      estimated_passings: submission.estimated_passings,
      estimated_capex: submission.estimated_capex,
      notes: submission.notes,
      owner: user.email,
      promoted_from_submission: submission_id,
      promoted_at: new Date().toISOString(),
      promoted_by: user.email
    };

    // Write to projects change-file
    const projectKey = `raw/projects_pipeline/project_changes/${project_id}__${timestamp}.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: projectKey,
      Body: JSON.stringify(projectRecord, null, 2),
      ContentType: 'application/json'
    }));

    // Create default scenario if passings and capex are provided
    if (submission.estimated_passings && submission.estimated_capex) {
      const scenario_id = `scenario_${Date.now()}`;
      const scenario = {
        scenario_id,
        scenario_name: `${submission.project_name} — Base Case`,
        is_test: false,
        inputs: {
          passings: submission.estimated_passings,
          build_months: 18,
          total_capex: submission.estimated_capex,
          start_date: new Date().toISOString().split('T')[0],
          start_month_offset: 0,
          arpu_start: 63,
          penetration_start_pct: 0.10,
          penetration_target_pct: 0.40,
          ramp_months: 36,
          capex_per_passing: Math.round(submission.estimated_capex / submission.estimated_passings),
          opex_per_sub: 25,
          discount_rate_pct: 10,
          analysis_months: 120
        }
      };

      // Store scenario in registry
      await base44.functions.invoke('manageScenariosRegistry', {
        action: 'upsert',
        project_id,
        scenario
      });
    }

    return Response.json({
      success: true,
      project_id,
      message: 'Submission promoted to official project'
    });

  } catch (error) {
    console.error('Promote submission error:', error);
    return Response.json({ 
      success: false,
      message: `Failed to promote submission: ${error.message}`
    }, { status: 500 });
  }
});