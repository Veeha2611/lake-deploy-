import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.662.0';

const s3Client = new S3Client({
  region: 'us-east-2',
  credentials: {
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')
  }
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const testResults = {
      timestamp: new Date().toISOString(),
      user: user.email,
      tests: []
    };

    // Test 1: Direct Athena Query via AWS SDK
    const test1 = {
      test_id: 'DATA-001',
      feature: 'Direct Athena Query (AWS SDK)',
      status: null,
      evidence: {}
    };

    try {
      const awsUrl = Deno.env.get('AWS_AI_LAYER_INVOKE_URL');
      const awsKey = Deno.env.get('AWS_AI_LAYER_API_KEY');

      if (!awsUrl || !awsKey) {
        throw new Error('AWS credentials not configured');
      }

      const sql = `SELECT COUNT(*) as project_count FROM curated_core.projects_enriched LIMIT 1`;
      
      const response = await fetch(awsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': awsKey
        },
        body: JSON.stringify({
          template_id: 'freeform_sql_v1',
          params: { sql }
        })
      });

      if (response.ok) {
        const data = await response.json();
        test1.status = 'PASS';
        test1.evidence = {
          status_code: response.status,
          project_count: data.data_rows?.[0]?.[0] || 0,
          execution_id: data.execution_id,
          message: 'Direct AWS AI Layer access successful'
        };
      } else {
        const errorText = await response.text();
        test1.status = 'FAIL';
        test1.evidence = {
          status_code: response.status,
          error: errorText,
          message: 'AWS AI Layer returned error'
        };
      }
    } catch (error) {
      test1.status = 'FAIL';
      test1.evidence = {
        error: error.message,
        message: 'Failed to connect to AWS AI Layer'
      };
    }

    testResults.tests.push(test1);

    // Test 2: S3 Direct Access
    const test2 = {
      test_id: 'DATA-002',
      feature: 'S3 Direct Access (Project Updates)',
      status: null,
      evidence: {}
    };

    try {
      const command = new ListObjectsV2Command({
        Bucket: 'mac-analytics-data-lake',
        Prefix: 'project-change-files/',
        MaxKeys: 10
      });

      const response = await s3Client.send(command);
      const files = response.Contents || [];

      test2.status = 'PASS';
      test2.evidence = {
        files_count: files.length,
        bucket: 'mac-analytics-data-lake',
        prefix: 'project-change-files/',
        sample_files: files.slice(0, 3).map(f => f.Key),
        message: 'S3 access successful'
      };
    } catch (error) {
      test2.status = 'FAIL';
      test2.evidence = {
        error: error.message,
        message: 'S3 access failed'
      };
    }

    testResults.tests.push(test2);

    // Test 3: Read Sample Project File
    const test3 = {
      test_id: 'DATA-003',
      feature: 'Read S3 Project File',
      status: null,
      evidence: {}
    };

    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: 'mac-analytics-data-lake',
        Prefix: 'project-change-files/',
        MaxKeys: 1
      });

      const listResponse = await s3Client.send(listCommand);
      const files = listResponse.Contents || [];

      if (files.length > 0) {
        const getCommand = new GetObjectCommand({
          Bucket: 'mac-analytics-data-lake',
          Key: files[0].Key
        });

        const getResponse = await s3Client.send(getCommand);
        const content = await getResponse.Body.transformToString();

        test3.status = 'PASS';
        test3.evidence = {
          file_key: files[0].Key,
          file_size: files[0].Size,
          content_preview: content.substring(0, 200),
          message: 'Project file read successful'
        };
      } else {
        test3.status = 'WARN';
        test3.evidence = {
          message: 'No project files found in S3'
        };
      }
    } catch (error) {
      test3.status = 'FAIL';
      test3.evidence = {
        error: error.message,
        message: 'Failed to read project file'
      };
    }

    testResults.tests.push(test3);

    // Test 4: Verify curated_core.projects_enriched view
    const test4 = {
      test_id: 'DATA-004',
      feature: 'Verify projects_enriched View Schema',
      status: null,
      evidence: {}
    };

    try {
      const awsUrl = Deno.env.get('AWS_AI_LAYER_INVOKE_URL');
      const awsKey = Deno.env.get('AWS_AI_LAYER_API_KEY');

      const sql = `SELECT project_id, entity, project_name, project_type, state, stage, priority, owner FROM curated_core.projects_enriched LIMIT 5`;
      
      const response = await fetch(awsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': awsKey
        },
        body: JSON.stringify({
          template_id: 'freeform_sql_v1',
          params: { sql }
        })
      });

      if (response.ok) {
        const data = await response.json();
        test4.status = 'PASS';
        test4.evidence = {
          rows_returned: data.data_rows?.length || 0,
          columns: data.columns || [],
          sample_project: data.data_rows?.[0] || null,
          message: 'View schema verified and accessible'
        };
      } else {
        test4.status = 'FAIL';
        test4.evidence = {
          status_code: response.status,
          error: await response.text(),
          message: 'View not accessible or does not exist'
        };
      }
    } catch (error) {
      test4.status = 'FAIL';
      test4.evidence = {
        error: error.message
      };
    }

    testResults.tests.push(test4);

    // Summary
    const passCount = testResults.tests.filter(t => t.status === 'PASS').length;
    const failCount = testResults.tests.filter(t => t.status === 'FAIL').length;

    testResults.summary = {
      total: testResults.tests.length,
      passed: passCount,
      failed: failCount,
      assessment: failCount === 0 ? 'ALL DATA SOURCES ACCESSIBLE' : 'SOME DATA SOURCES HAVE ISSUES'
    };

    return Response.json({
      success: true,
      test_results: testResults
    });

  } catch (error) {
    return Response.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});