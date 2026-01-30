import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.485.0';
import { SignatureV4 } from 'npm:@smithy/signature-v4@2.1.1';
import { HttpRequest } from 'npm:@smithy/protocol-http@3.2.1';
import { sha256 } from 'npm:@noble/hashes/sha256@1.4.0';

/**
 * Syncs Monday.com board items to AWS S3 (append-only CSV)
 * Pulls from Monday, maps columns by ID (stable), calculates financials, appends to S3
 * System of Record: AWS Athena
 */

function calculateFinancials(inputs) {
  const {
    passings = 0,
    build_months = 1,
    total_capex = 0,
    arpu_start = 63,
    penetration_start_pct = 0.10,
    penetration_target_pct = 0.40,
    ramp_months = 36,
    opex_per_sub = 25,
    discount_rate_pct = 10,
    analysis_months = 120
  } = inputs;

  if (total_capex <= 0 || !passings) {
    return {
      npv: null,
      irr_pct: null,
      moic: null,
      actual_cash_invested: 0,
      error: 'Missing financials'
    };
  }

  const monthly_rate = discount_rate_pct / 100 / 12;
  const monthly = [];
  const monthly_capex_schedule = total_capex / build_months;
  let cumulative_external_cash = 0;

  for (let month = 1; month <= analysis_months; month++) {
    const buildProgress = Math.min(month / build_months, 1);
    const rampProgress = Math.min(Math.max(month - build_months, 0) / ramp_months, 1);
    const penetration = penetration_start_pct + (penetration_target_pct - penetration_start_pct) * rampProgress;
    const subscribers = Math.floor(passings * buildProgress * penetration);

    const revenue = subscribers * arpu_start;
    const opex = subscribers * opex_per_sub;
    const ebitda = revenue - opex;
    const capex_book = month <= build_months ? monthly_capex_schedule : 0;

    let external_cash_this_month = 0;
    if (ebitda < 0) {
      external_cash_this_month = capex_book - ebitda;
    } else {
      external_cash_this_month = Math.max(0, capex_book - ebitda);
    }

    cumulative_external_cash += external_cash_this_month;

    const fcf = ebitda - capex_book;
    const discountFactor = Math.pow(1 + monthly_rate, -month);
    const pv = fcf * discountFactor;

    monthly.push({
      month,
      subscribers,
      revenue,
      ebitda,
      capex_book,
      external_cash_this_month,
      cumulative_external_cash,
      fcf,
      pv
    });
  }

  const actual_cash_invested = Math.max(...monthly.map(m => m.cumulative_external_cash));
  const npv = monthly.reduce((sum, m) => sum + m.pv, -actual_cash_invested);

  // IRR calculation
  let irr_monthly_decimal = null;
  const cashflows = [-actual_cash_invested, ...monthly.map(m => m.fcf)];
  const minCF = Math.min(...cashflows);
  const maxCF = Math.max(...cashflows);

  if (actual_cash_invested > 0 && minCF < 0 && maxCF > 0) {
    let rate = 0.10;
    for (let i = 0; i < 50; i++) {
      let npvAtRate = -actual_cash_invested;
      let derivative = 0;

      monthly.forEach((m, idx) => {
        const factor = Math.pow(1 + rate, -(idx + 1));
        npvAtRate += m.fcf * factor;
        derivative -= (idx + 1) * m.fcf * factor / (1 + rate);
      });

      if (Math.abs(npvAtRate) < 0.001 || Math.abs(derivative) < 1e-10) {
        irr_monthly_decimal = rate;
        break;
      }
      rate = rate - npvAtRate / derivative;
      if (rate < -0.95) rate = -0.95;
      if (rate > 3.0) rate = 3.0;
    }
  }

  const irr_pct = irr_monthly_decimal !== null
    ? ((Math.pow(1 + irr_monthly_decimal, 12) - 1) * 100)
    : null;

  const distributed_sum_pos_fcf = monthly.reduce((sum, m) => sum + Math.max(0, m.fcf), 0);
  const moic = actual_cash_invested > 0 && distributed_sum_pos_fcf > 0
    ? distributed_sum_pos_fcf / actual_cash_invested
    : null;

  return {
    npv: Math.round(npv),
    irr_pct: irr_pct ? Math.round(irr_pct * 10) / 10 : null,
    moic: moic ? Math.round(moic * 100) / 100 : null,
    actual_cash_invested: Math.round(actual_cash_invested)
  };
}

Deno.serve(async (req) => {
  // Monday webhook verification - MUST be first, before auth
  const url = new URL(req.url);
  const challenge = url.searchParams.get('challenge');
  
  console.log('[syncMondayToAWS] Incoming request:', {
    method: req.method,
    url: req.url,
    challenge,
    headers: Object.fromEntries(req.headers.entries())
  });
  
  if (challenge) {
    console.log('[syncMondayToAWS] Returning challenge:', challenge);
    return new Response(challenge, { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  try {
    // No auth required - this is a webhook endpoint

    const mondayApiKey = Deno.env.get('MONDAY_API_KEY');
    const mondayBoardId = Deno.env.get('MONDAY_BOARD_ID');
    const awsAccessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
    const awsSecretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const awsRegion = Deno.env.get('AWS_REGION');

    if (!mondayApiKey || !mondayBoardId || !awsAccessKeyId || !awsSecretAccessKey || !awsRegion) {
      return Response.json({
        error: 'Missing Monday or AWS credentials',
        missing: {
          monday_api_key: !mondayApiKey,
          monday_board_id: !mondayBoardId,
          aws_access_key_id: !awsAccessKeyId,
          aws_secret_access_key: !awsSecretAccessKey,
          aws_region: !awsRegion
        }
      }, { status: 500 });
    }

    // Fetch board schema and items from Monday
    const boardQuery = `
      query {
        boards(ids: [${mondayBoardId}]) {
          id
          name
          columns {
            id
            title
            type
          }
          items_page(limit: 100) {
            items {
              id
              name
              column_values {
                id
                value
              }
            }
          }
        }
      }
    `;

    const boardResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': mondayApiKey,
      },
      body: JSON.stringify({ query: boardQuery }),
    });

    const boardData = await boardResponse.json();
    if (boardData.errors) {
      return Response.json({ error: 'Monday API error', details: boardData.errors }, { status: 500 });
    }

    const board = boardData.data?.boards[0];
    if (!board) {
      return Response.json({ error: 'Board not found', boardId: mondayBoardId }, { status: 404 });
    }

    // Map columns by ID → normalized field name (stable references)
    const columnMap = {};
    board.columns.forEach(col => {
      const normalized = col.title.toLowerCase().replace(/\s+/g, '_');
      columnMap[col.id] = {
        title: col.title,
        type: col.type,
        normalized
      };
    });

    console.log('[syncMondayToAWS] Column map:', columnMap);

    // Build reverse lookup: normalized → column ID (for safe extraction)
    const fieldToColId = {};
    Object.entries(columnMap).forEach(([colId, info]) => {
      fieldToColId[info.normalized] = colId;
    });

    // Process items
    const items = board.items_page?.items || [];
    const csvRows = [];
    let calculatedCount = 0;
    let skippedCount = 0;

    // CSV header
    const header = [
      'project_id',
      'project_name',
      'entity',
      'project_type',
      'state',
      'stage',
      'priority',
      'owner',
      'passings',
      'build_months',
      'total_capex',
      'arpu_start',
      'penetration_start_pct',
      'penetration_target_pct',
      'ramp_months',
      'opex_per_sub',
      'discount_rate_pct',
      'npv',
      'irr_pct',
      'moic',
      'actual_cash_invested',
      'sync_timestamp'
    ];
    csvRows.push(header);

    // Helper: safe value extraction by normalized field name
    const extractValue = (item, fieldName) => {
      const colId = fieldToColId[fieldName];
      if (!colId) return undefined;
      const cv = item.column_values.find(c => c.id === colId);
      return cv?.value ? String(cv.value).trim() : undefined;
    };

    // Process each item
    for (const item of items) {
      // Extract inputs by normalized field name (stable)
      const passings = Number(extractValue(item, 'passings')) || 0;
      const total_capex = Number(extractValue(item, 'total_capex')) || 0;
      const build_months = Number(extractValue(item, 'build_months')) || 1;

      let npv = null, irr_pct = null, moic = null, actual_cash_invested = null;

      if (passings > 0 && total_capex > 0) {
        const calcs = calculateFinancials({
          passings,
          build_months,
          total_capex,
          arpu_start: Number(extractValue(item, 'arpu_start')) || 63,
          penetration_start_pct: (Number(extractValue(item, 'penetration_start_pct')) || 10) / 100,
          penetration_target_pct: (Number(extractValue(item, 'penetration_target_pct')) || 40) / 100,
          ramp_months: Number(extractValue(item, 'ramp_months')) || 36,
          opex_per_sub: Number(extractValue(item, 'opex_per_sub')) || 25,
          discount_rate_pct: Number(extractValue(item, 'discount_rate_pct')) || 10,
          analysis_months: 120
        });

        if (!calcs.error) {
          npv = calcs.npv;
          irr_pct = calcs.irr_pct;
          moic = calcs.moic;
          actual_cash_invested = calcs.actual_cash_invested;
          calculatedCount++;
        }
      } else {
        skippedCount++;
      }

      // Build CSV row
      const row = [
        item.id,
        item.name,
        extractValue(item, 'entity') || '',
        extractValue(item, 'project_type') || '',
        extractValue(item, 'state') || '',
        extractValue(item, 'stage') || '',
        extractValue(item, 'priority') || '',
        extractValue(item, 'owner') || '',
        passings,
        build_months,
        total_capex,
        extractValue(item, 'arpu_start') || 63,
        extractValue(item, 'penetration_start_pct') || 10,
        extractValue(item, 'penetration_target_pct') || 40,
        extractValue(item, 'ramp_months') || 36,
        extractValue(item, 'opex_per_sub') || 25,
        extractValue(item, 'discount_rate_pct') || 10,
        npv ?? '',
        irr_pct ?? '',
        moic ?? '',
        actual_cash_invested ?? '',
        new Date().toISOString()
      ];

      csvRows.push(row);
    }

    // Format CSV
    const csvContent = csvRows
      .map(row => row.map(val => {
        const str = String(val ?? '');
        return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','))
      .join('\n');

    // Upload to S3 with AWS Signature V4
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('-').slice(0, 4).join('-');
    const s3Key = `raw/projects_pipeline/input/${timestamp}-sync-${Date.now()}.csv`;
    const s3Bucket = 'gwi-raw-us-east-2-pc';

    // Create S3 client with explicit credentials
    const s3Client = new S3Client({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey
      }
    });

    // Upload using SigV4
    const putCommand = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
      Body: csvContent,
      ContentType: 'text/csv',
      Metadata: {
        'sync-source': 'monday.com',
        'board-id': String(mondayBoardId),
        'row-count': String(csvRows.length - 1)
      }
    });

    let s3UploadSuccess = false;
    let s3Error = null;

    try {
      const s3Response = await s3Client.send(putCommand);
      s3UploadSuccess = s3Response.$metadata?.httpStatusCode === 200;
      console.log('[syncMondayToAWS] S3 upload success:', {
        key: s3Key,
        status: s3Response.$metadata?.httpStatusCode,
        etag: s3Response.ETag
      });
    } catch (err) {
      s3Error = err.message;
      console.error('[syncMondayToAWS] S3 upload failed:', {
        key: s3Key,
        error: err.message,
        code: err.code
      });
    }

    if (!s3UploadSuccess) {
      return Response.json({
        status: 'error',
        error: 'S3 upload failed: ' + (s3Error || 'unknown error'),
        details: {
          bucket: s3Bucket,
          key: s3Key,
          rows_prepared: csvRows.length - 1
        }
      }, { status: 500 });
    }

    return Response.json({
      status: 'success',
      board_name: board.name,
      board_id: board.id,
      sync_results: {
        total_items: items.length,
        calculated: calculatedCount,
        skipped: skippedCount,
        s3_key: s3Key,
        s3_bucket: s3Bucket,
        row_count: csvRows.length - 1,
        calculated_fields: ['npv', 'irr_pct', 'moic', 'actual_cash_invested'],
        timestamp: new Date().toISOString()
      },
      next_step: 'Results appended to S3. Athena will refresh on next scheduled scan.',
      s3_location: `s3://${s3Bucket}/${s3Key}`
    });

  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({
      status: 'error',
      error: error.message
    }, { status: 500 });
  }
});