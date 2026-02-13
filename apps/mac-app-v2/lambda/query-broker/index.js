'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AWS = require('aws-sdk');
const XLSX = require('xlsx');
const Ajv = require('ajv');
const yaml = require('js-yaml');

const athena = new AWS.Athena({ region: process.env.AWS_REGION || 'us-east-2' });
const ddb = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION || 'us-east-2' });
const s3 = new AWS.S3({ region: process.env.AWS_REGION || 'us-east-2' });
const secretsManager = new AWS.SecretsManager({ region: process.env.AWS_REGION || 'us-east-2' });
const bedrock = new AWS.BedrockRuntime({ region: process.env.AWS_REGION || 'us-east-2' });
const cognitoIdp = new AWS.CognitoIdentityServiceProvider({ region: process.env.AWS_REGION || 'us-east-2' });
const ses = new AWS.SES({ region: process.env.AWS_REGION || 'us-east-2' });
const lambda = new AWS.Lambda({ region: process.env.AWS_REGION || 'us-east-2' });

const REGISTRY_PATH = process.env.QUERY_REGISTRY_PATH || path.join(__dirname, 'query-registry.json');
const REGISTRY = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const NETWORK_MIX_DOMAIN_PATH = process.env.NETWORK_MIX_DOMAIN_PATH || path.join(__dirname, 'network-mix-domain.yaml');

const CACHE_TABLE = process.env.CACHE_TABLE;
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 120);
const INTERNAL_QUERY_CACHE_SECONDS = Number(process.env.INTERNAL_QUERY_CACHE_SECONDS || 300);
const FRESHNESS_CACHE_SECONDS = Number(process.env.FRESHNESS_CACHE_SECONDS || 600);
const CASE_TABLE = process.env.CASE_TABLE;
const CASE_TTL_SECONDS = Number(process.env.CASE_TTL_SECONDS || 2592000);
const MAX_QUERY_SECONDS = Number(process.env.MAX_QUERY_SECONDS || 25);
const ATHENA_WORKGROUP = process.env.ATHENA_WORKGROUP || 'primary';
const ATHENA_DATABASE = process.env.ATHENA_DATABASE || 'curated_core';
const ATHENA_OUTPUT = process.env.ATHENA_OUTPUT || 's3://gwi-raw-us-east-2-pc/athena-results/';
const ALLOW_FREEFORM_SQL = String(process.env.ALLOW_FREEFORM_SQL || 'true').toLowerCase() === 'true';
const AWS_ONLY = String(process.env.AWS_ONLY || 'false').toLowerCase() === 'true';
const ALLOWED_VIEW_PREFIXES = (process.env.ALLOWED_VIEW_PREFIXES || 'curated_core.,curated_ssot.,curated_recon.,raw_platt.,raw_finance.,information_schema.')
  .split(',')
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);
const BEDROCK_ENABLED = String(process.env.BEDROCK_ENABLED || 'false').toLowerCase() === 'true';
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || '';
const BEDROCK_INFERENCE_PROFILE_ID = process.env.BEDROCK_INFERENCE_PROFILE_ID || '';
const BEDROCK_MAX_TOKENS = Number(process.env.BEDROCK_MAX_TOKENS || 1200);
const BEDROCK_STRUCTURED_OUTPUTS = String(process.env.BEDROCK_STRUCTURED_OUTPUTS || 'false').toLowerCase() === 'true';
const AUTO_VERIFY_ALL = String(process.env.AUTO_VERIFY_ALL || 'false').toLowerCase() === 'true';
// Feature flags (default safe/off unless explicitly enabled).
const CASE_RUNTIME_ENABLED = String(process.env.CASE_RUNTIME_ENABLED || 'false').toLowerCase() === 'true';
const BEDROCK_TOOL_USE_ENABLED = String(process.env.BEDROCK_TOOL_USE_ENABLED || 'false').toLowerCase() === 'true';
const KB_ENABLED = String(process.env.KB_ENABLED || 'false').toLowerCase() === 'true';
const VERIFY_ACTION_ENABLED = String(process.env.VERIFY_ACTION_ENABLED || 'false').toLowerCase() === 'true';
const REPORT_EXPORT_ENABLED = String(process.env.REPORT_EXPORT_ENABLED || 'false').toLowerCase() === 'true';
// Capability routing flags (safe defaults).
const TEMPLATES_ONLY = String(process.env.TEMPLATES_ONLY || 'true').toLowerCase() === 'true';
const PLANNER_ALLOWED = String(process.env.PLANNER_ALLOWED || 'false').toLowerCase() === 'true';
const NATIVE_VERIFY_ENABLED = String(process.env.NATIVE_VERIFY_ENABLED || 'false').toLowerCase() === 'true';
const CAPABILITY_ROUTER_ENABLED = String(process.env.CAPABILITY_ROUTER_ENABLED || 'false').toLowerCase() === 'true';
const IPV4_ENABLED = String(process.env.IPV4_ENABLED || 'false').toLowerCase() === 'true';
const MAX_RESULT_ROWS = Number(process.env.MAX_RESULT_ROWS || 2000);
const MAX_RESULT_ROWS_HARD = Number(process.env.MAX_RESULT_ROWS_HARD || 50000);
const GUARD_STATUS_BUCKET = process.env.GUARD_STATUS_BUCKET || 'gwi-raw-us-east-2-pc';
const GUARD_STATUS_KEY = process.env.GUARD_STATUS_KEY || 'curated_recon/guard_status/mac_ai_console_latest.json';
const GUARD_STALE_MINUTES = Number(process.env.GUARD_STALE_MINUTES || 30);
const GUARD_EXCEPTION_WARN_PCT = Number(process.env.GUARD_EXCEPTION_WARN_PCT || 0.05);
const GUARD_EXCEPTION_FAIL_PCT = Number(process.env.GUARD_EXCEPTION_FAIL_PCT || 0.2);
const GUARD_MRR_STALE_DAYS = Number(process.env.GUARD_MRR_STALE_DAYS || 45);
const AUTH_ENABLED = String(process.env.AUTH_ENABLED || 'false').toLowerCase() === 'true';
const AUTH_ALLOWED_DOMAIN = String(process.env.AUTH_ALLOWED_DOMAIN || '').toLowerCase().trim();
const AUTH_ADMIN_GROUPS = (process.env.AUTH_ADMIN_GROUPS || 'mac-admin')
  .split(',')
  .map((g) => g.trim().toLowerCase())
  .filter(Boolean);
const COGNITO_USER_POOL_ID = String(process.env.COGNITO_USER_POOL_ID || '').trim();
const ADMIN_TOOL_ALLOWLIST = String(process.env.ADMIN_TOOL_ALLOWLIST || '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
const ADMIN_TOOL_NOTIFY_FROM = String(process.env.ADMIN_TOOL_NOTIFY_FROM || '').trim();
const APP_BASE_URL = String(process.env.APP_BASE_URL || 'https://mac-app.macmtn.com').trim();
const QUERY_LIBRARY_BUCKET = process.env.QUERY_LIBRARY_BUCKET || 'gwi-raw-us-east-2-pc';
const QUERY_LIBRARY_PREFIX = process.env.QUERY_LIBRARY_PREFIX || 'curated_recon/mac_query_library/';
const REPORTS_BUCKET = process.env.REPORTS_BUCKET || 'gwi-raw-us-east-2-pc';
const REPORTS_PREFIX = process.env.REPORTS_PREFIX || 'raw/mac_ai_console/reports/';
const AGENT_ARTIFACTS_BUCKET = process.env.AGENT_ARTIFACTS_BUCKET || 'gwi-raw-us-east-2-pc';
const AGENT_ARTIFACTS_PREFIX = process.env.AGENT_ARTIFACTS_PREFIX || 'raw/mac_ai_console/agent_artifacts/';
const MODEL_VERSION_HASH = String(process.env.MODEL_VERSION_HASH || process.env.GIT_SHA || 'unknown').trim();
// Freshness gating: when enabled, stale sources fail closed (UNAVAILABLE).
const FRESHNESS_GATE_ENABLED = String(process.env.FRESHNESS_GATE_ENABLED || 'true').toLowerCase() === 'true';

const READ_ONLY_SQL_BLOCKLIST = /\b(insert|update|delete|create|drop|alter|truncate|merge|replace|refresh|msck|repair|grant|revoke|call|unload|export|vacuum)\b/i;
const ADMIN_ONLY_PATHS = [
  '/engine/run',
  '/engine/scenarios',
  '/projects/save',
  '/projects/submissions',
  '/projects/baseline-scenario',
  '/projects/baseline-migrate',
  '/monday/scenario-subitem',
  '/admin/users'
];

const MONDAY_SECRET_ID = process.env.MONDAY_SECRET_ID || 'monday/prod';
const MONDAY_PIPELINE_BOARD_ID = process.env.MONDAY_PIPELINE_BOARD_ID || null;
const MONDAY_MAPPING_PATH = path.join(__dirname, 'monday-mapping.json');
const MONDAY_MAPPING = fs.existsSync(MONDAY_MAPPING_PATH)
  ? JSON.parse(fs.readFileSync(MONDAY_MAPPING_PATH, 'utf8'))
  : null;
const MONDAY_WEBHOOK_SECRET = process.env.MONDAY_WEBHOOK_SECRET || null;
const MONDAY_FIELD_TITLES = {
  subscription_rate: 'Subscription Rate',
  subscription_months: 'Subscription Months',
  capex_per_passing: 'Capex per Passing',
  install_cost_per_subscriber: 'Install Cost per Subscriber',
  opex_per_passing: 'Monthly Opex per Passing',
  min_monthly_opex: 'Min Monthly Opex',
  cogs_pct_revenue: 'Monthly Avg - COGS % of Revenue',
  min_non_circuit_cogs: 'Monthly Minimum - Non Circuit COGS',
  circuit: 'Circuit (Yes or No)',
  circuit_type: 'Circuit Type',
  ebitda_multiple: 'EBITDA Multiple Method'
};
const MONDAY_INPUT_FIELDS = [
  'project_id',
  'module_type',
  'entity',
  'project_name',
  'project_type',
  'state',
  'stage',
  'priority',
  'owner',
  'notes',
  'sync_to_aws',
  'partner',
  'split_pct',
  'investment',
  'irr',
  'moic',
  'passings',
  'subscribers',
  'take_rate',
  'revenue',
  'cash_flow',
  'coc_return',
  'construction_cost',
  'construction_cost_per_passing',
  'install_cost',
  'install_cost_per_subscriber',
  'construction_plus_install_cost',
  'total_cost_per_passing',
  'arpu',
  'months_to_completion',
  'contract_date',
  'start_date',
  'end_date',
  'funnel_value',
  'funnel_multiple',
  'opex_per_sub',
  'subscription_months',
  'subscription_rate',
  'capex_per_passing',
  'opex_per_passing',
  'min_monthly_opex',
  'cogs_pct_revenue',
  'min_non_circuit_cogs',
  'circuit',
  'circuit_type',
  'ebitda_multiple',
  'npv'
];

const METADATA_BASE_PATHS = [
  process.env.METADATA_PATH,
  path.join(__dirname, 'metadata'),
  path.join(__dirname, '..', '..', '..', '..', '..', 'metadata')
].filter(Boolean);

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });

function resolveMetadataFile(fileName) {
  for (const base of METADATA_BASE_PATHS) {
    const full = path.join(base, fileName);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function loadTextFile(filePath, fallback = '') {
  if (!filePath) return fallback;
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return fallback;
  }
}

function loadJsonFile(filePath, fallback) {
  if (!filePath) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function loadYamlFile(filePath, fallback) {
  if (!filePath) return fallback;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  const raw = String(value);
  const trimmed = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }
  return `'${raw.replace(/'/g, "''")}'`;
}

function buildCaseFromMap(columnExpr, map, defaultExpr) {
  const entries = Object.entries(map || {});
  if (!entries.length) return defaultExpr;
  const cases = entries
    .filter(([key, val]) => key !== '' && val !== undefined && val !== null && String(val).trim() !== '')
    .map(([key, val]) => `WHEN ${columnExpr} = ${sqlLiteral(key)} THEN ${sqlLiteral(val)}`)
    .join(' ');
  return `CASE ${cases} ELSE ${defaultExpr} END`;
}

const ALLOWED_SOURCES_CATALOG = loadJsonFile(resolveMetadataFile('allowed_sources.json'), { version: 'unknown', sources: [] });
const JOIN_MAP_CATALOG = loadJsonFile(resolveMetadataFile('join_map.json'), { version: 'unknown', joins: [] });
const METRIC_DEFINITIONS = loadJsonFile(resolveMetadataFile('metric_definitions.json'), { version: 'unknown', metrics: {} });
const SYSTEM_CROSSWALKS = loadJsonFile(resolveMetadataFile('system_crosswalks.json'), { version: 'unknown', crosswalks: [] });
const QUERY_MANIFEST = loadJsonFile(resolveMetadataFile('query_manifest.json'), { version: 'unknown', queries: {} });
const QUERY_PLAN_SCHEMA = loadJsonFile(resolveMetadataFile('query_plan_schema.json'), {});

const NETWORK_MIX_DOMAIN = loadYamlFile(NETWORK_MIX_DOMAIN_PATH, null);

function includesAnyNormalized(normalized, terms) {
  const list = Array.isArray(terms) ? terms : [];
  return list.some((term) => term && normalized.includes(String(term).toLowerCase()));
}

function resolveNetworkMixSegmentKey(normalized) {
  const synonyms = NETWORK_MIX_DOMAIN?.synonyms || {};
  const hits = [];
  for (const [key, values] of Object.entries(synonyms)) {
    const terms = Array.isArray(values) ? values : [];
    if (terms.some((t) => t && normalized.includes(String(t).toLowerCase()))) {
      hits.push(key);
    }
  }
  if (!hits.length) return null;
  const unique = Array.from(new Set(hits));
  if (unique.length === 1) return unique[0];
  return { ambiguous: true, candidates: unique };
}

function resolveNetworkMixDomainQuestion(questionText) {
  if (!NETWORK_MIX_DOMAIN) return null;
  const normalized = normalizeQuestionText(questionText);
  if (!normalized) return null;

  const intents = NETWORK_MIX_DOMAIN.intents || {};
  const operations = NETWORK_MIX_DOMAIN.operations || {};
  const segments = NETWORK_MIX_DOMAIN.segments || {};

  // Let the existing Network Health templates handle explicit "network health" + "by <dimension>" questions.
  if (normalized.includes('network health') || normalized.includes('by network type') || normalized.includes('by customer type')) {
    return null;
  }

  const wantsListNetworks = includesAnyNormalized(normalized, intents.list_networks_terms) ||
    (includesAnyNormalized(normalized, ['list', 'show', 'which', 'what networks', 'which networks', 'networks']) &&
     includesAnyNormalized(normalized, ['network', 'networks', 'system', 'systems']));
  const wantsPercent = includesAnyNormalized(normalized, intents.percent_terms);
  const wantsExcludeDVFiber = includesAnyNormalized(normalized, intents.dvfiber_exclude_terms);

  const segmentKey = resolveNetworkMixSegmentKey(normalized);
  const isSegmentSafeAnchor = (() => {
    if (!segmentKey || typeof segmentKey !== 'string') return false;
    // "Owned" is too broad globally; require additional anchoring terms to avoid hijacking generic identity questions.
    if (segmentKey === 'owned') {
      return includesAnyNormalized(normalized, [
        'fttp',
        'fiber',
        'network',
        'networks',
        'passings',
        'subscriptions',
        'subscribers',
        'penetration',
        'arpu',
        'mix',
        'revenue',
        'billed',
        'plat id',
        'platid',
        'billing'
      ]);
    }
    // CLEC / Contracted / Resold are domain-specific enough to anchor routing.
    return true;
  })();
  const hasSheetSignal =
    normalized.includes('customer mix') ||
    normalized.includes('revenue mix') ||
    includesAnyNormalized(normalized, ['investor', 'workbook']) ||
    includesAnyNormalized(normalized, intents.revenue_mix_terms) ||
    includesAnyNormalized(normalized, intents.dvfiber_exclude_terms) ||
    includesAnyNormalized(normalized, ['customer mix', 'revenue mix']);
  const hasAnchorSignal =
    hasSheetSignal ||
    isSegmentSafeAnchor ||
    includesAnyNormalized(normalized, ['network', 'networks', 'system', 'systems', 'workbook', 'investor', 'mix']);

  // Don't hijack generic "owned customers" style questions unless the question is clearly anchored to this domain.
  if (!hasAnchorSignal) return null;
  // Summary questions: allow when sheet is explicit (customer mix / revenue mix / network mix).
  if (!segmentKey && !hasSheetSignal) return null;

  if (segmentKey && segmentKey.ambiguous) {
    return {
      notSupportedPayload: buildNotSupportedPayload({
        questionText,
        reason: `ambiguous network mix segment: ${segmentKey.candidates.join(', ')}`,
        nextStep: 'Ask for exactly one segment (Owned, Contracted, CLEC, or Resold) and specify customer mix (subscriptions) vs revenue mix (billed customers/revenue) if needed',
        details: [
          `Matched segments: ${segmentKey.candidates.join(', ')}`,
          'This domain is finite and deterministic; ambiguous segment routing fails closed.'
        ]
      })
    };
  }

  const segmentDef = segmentKey ? (segments[segmentKey] || null) : null;

  const wantsRevenueMix =
    includesAnyNormalized(normalized, intents.revenue_mix_terms) ||
    normalized.includes('revenue mix') ||
    (normalized.includes('billed') && normalized.includes('customer'));
  const wantsCustomerMix =
    includesAnyNormalized(normalized, intents.customer_mix_terms) ||
    normalized.includes('customer mix') ||
    normalized.includes('network mix');

  // Deterministic tie-breaker:
  // - If both are present, prefer revenue mix when question references billed/revenue/plat id/mrr.
  // - Otherwise default to customer mix for "customers/subscriptions/passings/penetration".
  const sheet = wantsRevenueMix ? 'revenue_mix' : 'customer_mix';

  if (wantsExcludeDVFiber && sheet !== 'revenue_mix') {
    return {
      notSupportedPayload: buildNotSupportedPayload({
        questionText,
        reason: 'DVFiber exclusion is not defined for Customer Mix in the workbook domain',
        nextStep: 'Ask for Revenue Mix totals excluding DVFiber, or add a governed DVFiber exclusion rule for Customer Mix and ingest/model it',
        details: [
          'Revenue Mix has a workbook-defined “Total excluding DVFiber Customers” row.',
          'Customer Mix does not define an equivalent exclusion rule.'
        ]
      })
    };
  }

  // Summary questions (no segment).
  if (!segmentKey) {
    if (sheet === 'revenue_mix') {
      if (wantsExcludeDVFiber) {
        return { questionId: operations.revenue_mix_totals_excluding_dvfiber.query_id, params: {} };
      }
      return { questionId: operations.revenue_mix_summary.query_id, params: {} };
    }
    return { questionId: operations.customer_mix_summary.query_id, params: {} };
  }

  // Segment-specific questions.
  if (sheet === 'revenue_mix') {
    const revenueMix = segmentDef?.revenue_mix || null;
    if (!revenueMix || !revenueMix.network_type_like) {
      return {
        notSupportedPayload: buildNotSupportedPayload({
          questionText,
          reason: `segment \"${segmentKey}\" is not supported for Revenue Mix in the workbook domain`,
          nextStep: 'Add the segment mapping in apps/mac-app-v2/lambda/query-broker/network-mix-domain.yaml',
          details: [`segment_key=${segmentKey}`]
        })
      };
    }

    if (wantsExcludeDVFiber) {
      return { questionId: operations.revenue_mix_totals_excluding_dvfiber.query_id, params: {} };
    }

    if (wantsListNetworks) {
      return {
        questionId: operations.revenue_mix_networks_list.query_id,
        params: { network_type_like: revenueMix.network_type_like, network_like: '' }
      };
    }

    if (wantsPercent) {
      const measure = includesAnyNormalized(normalized, ['plat id', 'platid', 'billed customers', 'customer count'])
        ? 'plat_id_count'
        : 'revenue';
      return {
        questionId: operations.revenue_mix_segment_pct.query_id,
        params: {
          segment_label: segmentDef.label || segmentKey,
          network_type_like: revenueMix.network_type_like,
          network_like: '',
          measure
        }
      };
    }

    return {
      questionId: operations.revenue_mix_kpis.query_id,
      params: {
        segment_label: segmentDef.label || segmentKey,
        network_type_like: revenueMix.network_type_like,
        network_like: ''
      }
    };
  }

  const customerMix = segmentDef?.customer_mix || null;
  if (!customerMix) {
    return {
      notSupportedPayload: buildNotSupportedPayload({
        questionText,
        reason: `segment \"${segmentKey}\" is not supported for Customer Mix in the workbook domain`,
        nextStep: 'Ask for Owned, Contracted, or CLEC (as defined by the workbook), or add a new segment mapping and deterministic templates',
        details: [`segment_key=${segmentKey}`]
      })
    };
  }

  if (wantsListNetworks) {
    return {
      questionId: operations.customer_mix_networks_list.query_id,
      params: {
        network_type: customerMix.network_type || '',
        customer_type: customerMix.customer_type || '',
        access_type: customerMix.access_type || ''
      }
    };
  }

  if (wantsPercent) {
    const measure = includesAnyNormalized(normalized, ['passings', 'homes passed']) ? 'passings' : 'subscriptions';
    return {
      questionId: operations.customer_mix_segment_pct.query_id,
      params: {
        network_type: customerMix.network_type || '',
        customer_type: customerMix.customer_type || '',
        access_type: customerMix.access_type || '',
        measure
      }
    };
  }

  return {
    questionId: operations.customer_mix_kpis.query_id,
    params: {
      network_type: customerMix.network_type || '',
      customer_type: customerMix.customer_type || '',
      access_type: customerMix.access_type || ''
    }
  };
}
const ACTION_INTENT_SCHEMA = loadJsonFile(resolveMetadataFile('action_intent_schema.json'), {});
const REPORT_SPEC_SCHEMA = loadJsonFile(resolveMetadataFile('report_spec_schema.json'), {});
const GOLDEN_QUESTIONS = loadJsonFile(resolveMetadataFile('golden_questions.json'), { version: 'unknown', questions: [] });
const REVENUE_REPORT_LABEL_MAP = loadJsonFile(resolveMetadataFile('revenue_report_label_map.json'), { company_map: {}, customer_type_map: {} });
const PLANNER_SYSTEM_PROMPT = (
  loadTextFile(resolveMetadataFile('planner_system_prompt.txt'), '').trim() ||
  // Backwards compatibility with older lambda bundles.
  loadTextFile(resolveMetadataFile('claude_planner_prompt.txt'), '').trim()
);
const GOVERNANCE_TEXT = loadTextFile(resolveMetadataFile('GOVERNANCE.md'), '').trim();
const KNOWN_GAPS_TEXT = loadTextFile(resolveMetadataFile('KNOWN_GAPS_AND_RISK.md'), '').trim();

const CAPABILITY_REGISTRY_PATH = process.env.CAPABILITY_REGISTRY_PATH || path.join(__dirname, 'config', 'ai', 'capabilities.yaml');
const CAPABILITY_REGISTRY = loadYamlFile(CAPABILITY_REGISTRY_PATH, { version: 'unknown', capabilities: {} });
const CAPABILITIES = (CAPABILITY_REGISTRY && typeof CAPABILITY_REGISTRY === 'object' && CAPABILITY_REGISTRY.capabilities && typeof CAPABILITY_REGISTRY.capabilities === 'object')
  ? CAPABILITY_REGISTRY.capabilities
  : {};

const ALLOWED_SOURCES_BY_NAME = new Map(
  (ALLOWED_SOURCES_CATALOG.sources || []).map((source) => [String(source.name).toLowerCase(), source])
);
const JOIN_MAP = JOIN_MAP_CATALOG.joins || [];
const METRIC_DEFS = METRIC_DEFINITIONS.metrics || {};
const QUERY_MANIFEST_DEFS = (QUERY_MANIFEST && typeof QUERY_MANIFEST === 'object' && QUERY_MANIFEST.queries && typeof QUERY_MANIFEST.queries === 'object')
  ? QUERY_MANIFEST.queries
  : {};
const SYSTEM_ALIAS_MAP = buildSystemAliasMap(SYSTEM_CROSSWALKS);
const SYSTEM_ALIAS_LABELS = buildSystemAliasLabels(SYSTEM_CROSSWALKS);

function compileSchema(schema) {
  if (!schema || typeof schema !== 'object' || !Object.keys(schema).length) return null;
  try {
    return ajv.compile(schema);
  } catch (_) {
    return null;
  }
}

const QUERY_PLAN_VALIDATOR = compileSchema(QUERY_PLAN_SCHEMA);
const ACTION_INTENT_VALIDATOR = compileSchema(ACTION_INTENT_SCHEMA);
const REPORT_SPEC_VALIDATOR = compileSchema(REPORT_SPEC_SCHEMA);

function validateWithSchema(validator, payload) {
  if (!validator) return { valid: true, errors: [] };
  const ok = validator(payload);
  if (ok) return { valid: true, errors: [] };
  const errors = (validator.errors || []).map((err) => {
    const path = err.instancePath || err.schemaPath || '';
    const msg = err.message || 'schema validation error';
    return `${path} ${msg}`.trim();
  });
  return { valid: false, errors };
}

function getHeaderValue(headers, key) {
  if (!headers) return null;
  const direct = headers[key];
  if (direct) return direct;
  const lowerKey = key.toLowerCase();
  const matchKey = Object.keys(headers).find((k) => k.toLowerCase() === lowerKey);
  return matchKey ? headers[matchKey] : null;
}

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    },
    body: JSON.stringify(payload)
  };
}

function getAuthorizerClaims(event) {
  const authorizer = event?.requestContext?.authorizer;
  if (!authorizer) return null;
  if (authorizer.claims) return authorizer.claims;
  if (authorizer.jwt && authorizer.jwt.claims) return authorizer.jwt.claims;
  return null;
}

function isAdminUser(claims) {
  const rawGroups = claims?.['cognito:groups'] || claims?.groups || [];
  const groups = Array.isArray(rawGroups)
    ? rawGroups
    : String(rawGroups || '').split(',');
  return groups.some((g) => AUTH_ADMIN_GROUPS.includes(String(g || '').trim().toLowerCase()));
}

function emailAllowed(claims) {
  if (!AUTH_ALLOWED_DOMAIN) return true;
  const email = String(claims?.email || claims?.['cognito:username'] || '').toLowerCase().trim();
  if (!email) return false;
  return email.endsWith(`@${AUTH_ALLOWED_DOMAIN.replace(/^@/, '')}`);
}

function getClaimsEmail(claims) {
  return String(claims?.email || claims?.['cognito:username'] || '').toLowerCase().trim();
}

function getCaseUserId(event) {
  const claims = getAuthorizerClaims(event);
  const email = getClaimsEmail(claims);
  return email || 'anonymous';
}

function buildCaseActions(payloadOut) {
  if (!CASE_RUNTIME_ENABLED) return [];
  const actions = ['SHOW_EVIDENCE'];
  if (REPORT_EXPORT_ENABLED && payloadOut?.generated_sql) {
    actions.push('EXPORT_CSV', 'EXPORT_XLSX', 'BUILD_REPORT');
  }
  if (VERIFY_ACTION_ENABLED) {
    actions.push('VERIFY_ACROSS_SYSTEMS');
  }
  return actions;
}

function buildCaseRecord({ caseId, event, questionText, questionId, payloadOut, threadId = null, parentCaseId = null }) {
  const nowIso = new Date().toISOString();
  return {
    case_id: caseId,
    created_at: nowIso,
    updated_at: nowIso,
    user_id: getCaseUserId(event),
    thread_id: threadId || null,
    parent_case_id: parentCaseId || null,
    question_original: questionText || questionId || null,
    question_id: questionId || null,
    metric_key: payloadOut?.metric_key || payloadOut?.query_id || null,
    request_params: payloadOut?.request_params || null,
    plan_status: payloadOut?.plan_status || null,
    answer_markdown: payloadOut?.answer_markdown || null,
    views_used: payloadOut?.views_used || [],
    query_execution_id: payloadOut?.query_execution_id || null,
    generated_sql: payloadOut?.generated_sql || payloadOut?.sql || null,
    columns: payloadOut?.columns || [],
    rows_preview: Array.isArray(payloadOut?.rows) ? payloadOut.rows.slice(0, 50) : [],
    row_count: Array.isArray(payloadOut?.rows) ? payloadOut.rows.length : 0,
    evidence_pack: payloadOut?.evidence_pack || null,
    actions_available: buildCaseActions(payloadOut),
    expires_at: Math.floor(Date.now() / 1000) + CASE_TTL_SECONDS
  };
}

function generateCaseId() {
  return `case_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

async function writeCaseRecord(caseRecord) {
  if (!CASE_RUNTIME_ENABLED || !CASE_TABLE || !caseRecord) return;
  await ddb.put({ TableName: CASE_TABLE, Item: caseRecord }).promise();
}

async function loadCaseRecord(caseId) {
  if (!CASE_RUNTIME_ENABLED || !CASE_TABLE || !caseId) return null;
  const res = await ddb.get({ TableName: CASE_TABLE, Key: { case_id: caseId } }).promise();
  return res.Item || null;
}

async function appendCaseArtifact(caseId, artifact) {
  if (!CASE_RUNTIME_ENABLED || !CASE_TABLE || !caseId || !artifact) return;
  const nowIso = new Date().toISOString();
  try {
    await ddb.update({
      TableName: CASE_TABLE,
      Key: { case_id: caseId },
      UpdateExpression: 'SET artifacts = list_append(if_not_exists(artifacts, :empty), :artifact), updated_at = :now',
      ExpressionAttributeValues: {
        ':empty': [],
        ':artifact': [artifact],
        ':now': nowIso
      }
    }).promise();
  } catch (_) {
    // Non-fatal: exports should not break query responses.
  }
}

async function setThreadLastCase(threadId, caseId) {
  if (!CASE_RUNTIME_ENABLED || !CACHE_TABLE || !threadId || !caseId) return;
  // Pointer so follow-ups can work even if the UI forgets to pass payload.context.
  await putCache(`thread_last_case:${threadId}`, { case_id: caseId }, Math.min(CASE_TTL_SECONDS, 60 * 60 * 24 * 14));
}

async function loadThreadContext(threadId) {
  if (!CASE_RUNTIME_ENABLED || !CACHE_TABLE || !CASE_TABLE || !threadId) return null;
  const item = await getCache(`thread_last_case:${threadId}`);
  const caseId = item?.result?.case_id || null;
  if (!caseId) return null;
  const record = await loadCaseRecord(caseId);
  if (!record) return null;
  return {
    case_id: record.case_id,
    question: record.question_original || null,
    answer_markdown: record.answer_markdown || '',
    question_id: record.question_id || null,
    metric_key: record.metric_key || null
  };
}

function enforceAuth(event, { requireAdmin = false } = {}) {
  if (!AUTH_ENABLED) return null;
  const claims = getAuthorizerClaims(event);
  if (!claims) {
    return response(401, { ok: false, error: 'Unauthorized' });
  }
  if (!emailAllowed(claims)) {
    return response(403, { ok: false, error: 'Access restricted to macmtn.com emails' });
  }
  if (requireAdmin && !isAdminUser(claims)) {
    return response(403, { ok: false, error: 'Admin access required' });
  }
  return null;
}

function enforceAdminToolAllowlist(event) {
  if (!ADMIN_TOOL_ALLOWLIST.length) return null;
  const claims = getAuthorizerClaims(event);
  const email = getClaimsEmail(claims);
  if (!email) {
    return response(403, { ok: false, error: 'Admin allowlist requires an email claim' });
  }
  if (!ADMIN_TOOL_ALLOWLIST.includes(email)) {
    return response(403, { ok: false, error: 'Admin tool restricted to allowlisted users' });
  }
  return null;
}

function validateTargetEmail(email) {
  if (!email || !email.includes('@')) {
    throw new Error('Valid email required');
  }
  const lower = email.toLowerCase().trim();
  if (AUTH_ALLOWED_DOMAIN) {
    const domain = AUTH_ALLOWED_DOMAIN.replace(/^@/, '');
    if (!lower.endsWith(`@${domain}`)) {
      throw new Error(`Email must be @${domain}`);
    }
  }
  return lower;
}

async function sendAdminNotification(email, action) {
  if (!ADMIN_TOOL_NOTIFY_FROM) {
    throw new Error('ADMIN_TOOL_NOTIFY_FROM is required to send access notifications');
  }
  const verb = action === 'remove' ? 'removed from' : 'granted access to';
  const body = [
    `Hello ${email},`,
    '',
    `You have been ${verb} the MAC App.`,
    '',
    `Access URL: ${APP_BASE_URL}`,
    '',
    'What you can do:',
    '- View dashboards and SSOT evidence',
    '- Run plain-language queries (deterministic + evidence-backed)',
    '- Run scenarios and save analysis outputs (admin only)',
    '- Export reports and CSVs',
    '',
    'Notes:',
    '- Access is read-only to SSOT data (no write operations).',
    '- Use your @macmtn.com email to sign in.',
    '- If you have trouble logging in, reply to the admin who invited you.'
  ].join('\n');

  await ses.sendEmail({
    Source: ADMIN_TOOL_NOTIFY_FROM,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: 'MAC App Access' },
      Body: { Text: { Data: body } }
    }
  }).promise();
}

async function listAdminUsers(groupName) {
  if (!COGNITO_USER_POOL_ID) {
    throw new Error('COGNITO_USER_POOL_ID not configured');
  }
  let token = undefined;
  const users = [];
  do {
    const resp = await cognitoIdp.listUsersInGroup({
      UserPoolId: COGNITO_USER_POOL_ID,
      GroupName: groupName,
      NextToken: token
    }).promise();
    (resp.Users || []).forEach((user) => {
      users.push({
        username: user.Username,
        status: user.UserStatus,
        enabled: user.Enabled
      });
    });
    token = resp.NextToken;
  } while (token);
  return users;
}

async function ensureUserExists(email, tempPassword) {
  if (!COGNITO_USER_POOL_ID) {
    throw new Error('COGNITO_USER_POOL_ID not configured');
  }
  try {
    await cognitoIdp.adminGetUser({ UserPoolId: COGNITO_USER_POOL_ID, Username: email }).promise();
    return false;
  } catch (err) {
    if (err?.code !== 'UserNotFoundException') {
      throw err;
    }
  }
  const params = {
    UserPoolId: COGNITO_USER_POOL_ID,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' }
    ],
    DesiredDeliveryMediums: ['EMAIL']
  };
  if (tempPassword) {
    params.TemporaryPassword = tempPassword;
  }
  await cognitoIdp.adminCreateUser(params).promise();
  return true;
}

function stableStringify(obj) {
  const keys = Object.keys(obj || {}).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

function hashKey(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

function escapeGraphQLString(val) {
  return String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function applyParams(sql, params, allowedParams) {
  if (!allowedParams || allowedParams.length === 0) return sql;
  const missing = allowedParams.filter((p) => !(p in (params || {})));
  if (missing.length) {
    throw new Error(`Missing required params: ${missing.join(', ')}`);
  }
  let rendered = sql;
  for (const p of allowedParams) {
    const value = escapeSqlValue(params[p]);
    rendered = rendered.replace(new RegExp(`\\$\\{${p}\\}`, 'g'), value);
  }
  return rendered;
}

function extractCteNames(sql) {
  if (!sql) return [];
  const normalized = String(sql).trim();
  if (!/^with\b/i.test(normalized)) return [];
  const withSection = normalized.replace(/^\s*with\s+/i, '');
  const names = [];
  const regex = /(?:^|,)\s*([A-Za-z_][\w]*)\s+as\s*\(/gi;
  let match;
  while ((match = regex.exec(withSection)) !== null) {
    names.push(match[1].toLowerCase());
  }
  return names;
}

function extractReferencedTables(sql) {
  if (!sql) return [];
  const cteNames = new Set(extractCteNames(sql));
  const matches = [...sql.matchAll(/(?:from|join)\s+([\w.]+)/gi)];
  const tables = matches.map((m) => m[1].replace(/["`]/g, '').toLowerCase());
  return tables.filter((name) => !cteNames.has(name));
}

function validateSqlAllowlist(sql) {
  const referenced = extractReferencedTables(sql);
  if (!referenced.length) return;
  const unauthorized = referenced.filter((table) => {
    if (table === 'dual') return false;
    if (table.startsWith('information_schema.')) return false;
    return !ALLOWED_VIEW_PREFIXES.some((prefix) => table.startsWith(prefix));
  });
  if (unauthorized.length) {
    throw new Error(`SQL uses unauthorized tables: ${unauthorized.join(', ')}`);
  }
}

function validateReadOnlySql(sql) {
  if (!sql) return;
  const normalized = String(sql).trim();
  if (!/^(with|select)\b/i.test(normalized)) {
    throw new Error('Only SELECT/CTE queries are allowed');
  }
  if (READ_ONLY_SQL_BLOCKLIST.test(normalized)) {
    throw new Error('Non read-only SQL detected');
  }
  if (/\b(raw\.|curated_raw\.)/i.test(normalized)) {
    throw new Error('Raw data access prohibited');
  }
  const multiStatements = normalized.split(';').map((s) => s.trim()).filter(Boolean);
  if (multiStatements.length > 1) {
    throw new Error('Multiple statements are not allowed');
  }
}

function ensureLimit(sql, limit = 2000) {
  const normalized = String(sql || '').trim().replace(/;+\s*$/, '');
  if (!normalized) return normalized;
  if (/\blimit\s+\d+/i.test(normalized)) return normalized;
  if (/\bcount\s*\(|\bsum\s*\(|\bavg\s*\(|\bmin\s*\(|\bmax\s*\(|\bgroup\s+by\b/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}\nLIMIT ${limit}`;
}

function extractJsonFromBedrock(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // Fallthrough
  }
  const codeFence = trimmed.match(/```json\s*([\s\S]+?)\s*```/i);
  if (codeFence && codeFence[1]) {
    try {
      return JSON.parse(codeFence[1].trim());
    } catch (_) {
      return null;
    }
  }
  return null;
}

function buildBedrockPlanPrompt(question, validationErrors = []) {
  const allowedSources = (ALLOWED_SOURCES_CATALOG.sources || [])
    .map((s) => s.name)
    .slice(0, 30)
    .join(', ');
  const metricKeys = Object.keys(METRIC_DEFS || {}).slice(0, 40).join(', ');
  const header = PLANNER_SYSTEM_PROMPT && !BEDROCK_TOOL_USE_ENABLED ? `${PLANNER_SYSTEM_PROMPT}\n\n` : '';
  const errorBlock = validationErrors.length
    ? `Validation errors: ${validationErrors.join('; ')}\nPlease correct the JSON plan to resolve these errors.\n\n`
    : '';
  const governanceSnippet = KB_ENABLED && GOVERNANCE_TEXT
    ? `Governance (excerpt):\n${GOVERNANCE_TEXT.slice(0, 2000)}\n`
    : '';
  const gapsSnippet = KB_ENABLED && KNOWN_GAPS_TEXT
    ? `Known gaps and risk (excerpt):\n${KNOWN_GAPS_TEXT.slice(0, 2000)}\n`
    : '';
  return [
    header,
    errorBlock,
    BEDROCK_STRUCTURED_OUTPUTS && QUERY_PLAN_SCHEMA && Object.keys(QUERY_PLAN_SCHEMA).length
      ? `JSON Schema (must comply):\n${JSON.stringify(QUERY_PLAN_SCHEMA)}\n`
      : '',
    governanceSnippet,
    gapsSnippet,
    'Allowed metric keys:',
    metricKeys || '(none)',
    '',
    'Allowed source views (subset):',
    allowedSources || '(none)',
    '',
    `Question: ${question}`
  ].join('\n');
}

function normalizeQuestionText(question) {
  return String(question || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DATASET_SOURCE_MAP = {
  customers: [
    'curated_core.platt_customer_current_ssot',
    'curated_core.dim_customer_platt_v1_1',
    'curated_core.v_platt_billing_customer_month_latest'
  ],
  mrr: [
    'curated_core.v_platt_billing_mrr_monthly',
    'curated_core.v_monthly_mrr_platt'
  ],
  costs: [
    'curated_core.v_customer_fully_loaded_margin_banded'
  ],
  action_band: [
    'curated_core.v_customer_fully_loaded_margin_banded'
  ],
  tickets: [
    'curated_core.v_cci_tickets_clean',
    'curated_core.v_ticket_burden_banded'
  ],
  platt: [
    'raw_platt.customer',
    'raw_platt.iheader_raw'
  ],
  salesforce: [],
  intacct: [],
  crosswalks: [
    'curated_core.dim_customer_system_latest'
  ],
  risk_register: [],
  delta_history: [],
  ipv4_raw: [],
  ipv4_dhcp: [],
  ipv4_dns: [],
  ipv4_routing: []
};

function getFlagValueByName(flagName) {
  const key = String(flagName || '').trim().toUpperCase();
  if (!key) return false;
  switch (key) {
    case 'TEMPLATES_ONLY':
      return TEMPLATES_ONLY;
    case 'PLANNER_ALLOWED':
      return PLANNER_ALLOWED;
    case 'NATIVE_VERIFY_ENABLED':
      return NATIVE_VERIFY_ENABLED;
    case 'REPORT_EXPORT_ENABLED':
      return REPORT_EXPORT_ENABLED;
    case 'CAPABILITY_ROUTER_ENABLED':
      return CAPABILITY_ROUTER_ENABLED;
    case 'IPV4_ENABLED':
      return IPV4_ENABLED;
    default:
      return false;
  }
}

function matchCapability(questionText) {
  const normalized = normalizeQuestionText(questionText).replace(/-/g, ' ');
  if (!normalized) return null;
  const entries = Object.entries(CAPABILITIES || {});
  if (!entries.length) return null;

  let best = null;
  for (const [capabilityKey, def] of entries) {
    const keywords = Array.isArray(def?.keywords) ? def.keywords : [];
    if (!keywords.length) continue;
    let score = 0;
    for (const keyword of keywords) {
      const kw = normalizeQuestionText(keyword).replace(/-/g, ' ');
      if (!kw) continue;
      if (normalized.includes(kw)) score += 1;
    }
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { capability_key: capabilityKey, capability: def, score };
    }
  }
  return best;
}

function resolveMissingCapabilityFlags(capabilityDef) {
  const required = Array.isArray(capabilityDef?.flags_required) ? capabilityDef.flags_required : [];
  const missing = required
    .map((f) => String(f || '').trim().toUpperCase())
    .filter(Boolean)
    .filter((flag) => !getFlagValueByName(flag));
  return Array.from(new Set(missing));
}

function resolveMissingCapabilitySources(capabilityDef) {
  const required = Array.isArray(capabilityDef?.required_sources) ? capabilityDef.required_sources : [];
  const missing = [];
  const satisfied_views = [];
  for (const datasetKey of required) {
    const key = String(datasetKey || '').trim();
    if (!key) continue;
    const candidates = DATASET_SOURCE_MAP[key] || [];
    const available = candidates.filter((view) => Boolean(getAllowedSource(view)));
    if (!available.length) {
      missing.push(key);
      continue;
    }
    satisfied_views.push(...available);
  }
  return {
    missing: Array.from(new Set(missing)),
    satisfied_views: Array.from(new Set(satisfied_views))
  };
}

function ensureSentence(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  return trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
}

function buildNotSupportedMarkdown({ reason, nextStep, details = [], suggestions = [] }) {
  const lines = [];
  lines.push(`NOT SUPPORTED YET: ${ensureSentence(reason).replace(/\.$/, '')}.`);
  lines.push(`NEXT STEP: ${ensureSentence(nextStep).replace(/\.$/, '')}.`);

  const detailLines = (Array.isArray(details) ? details : []).filter(Boolean);
  if (detailLines.length) {
    lines.push('');
    lines.push(...detailLines.map((d) => `- ${d}`));
  }

  const suggestionLines = (Array.isArray(suggestions) ? suggestions : []).filter(Boolean);
  if (suggestionLines.length) {
    lines.push('');
    lines.push('Suggested governed templates:');
    lines.push(...suggestionLines.map((s) => `- ${s}`));
  }

  return lines.join('\n');
}

function buildNotSupportedPayload({
  questionText,
  capabilityMatch = null,
  reason,
  nextStep,
  details = [],
  suggestions = []
}) {
  const capKey = capabilityMatch?.capability_key || null;
  const capDef = capabilityMatch?.capability || null;
  const missingFlags = capDef ? resolveMissingCapabilityFlags(capDef) : [];
  const missingSources = capDef ? resolveMissingCapabilitySources(capDef) : { missing: [], satisfied_views: [] };

  return {
    ok: true,
    cached: false,
    stale: false,
    question_id: 'not_supported_yet',
    columns: [],
    rows: [],
    views_used: [],
    answer_markdown: buildNotSupportedMarkdown({ reason, nextStep, details, suggestions }),
    capability: capDef
      ? {
          capability_key: capKey,
          support_level: capDef.support_level || null,
          supported_actions: capDef.supported_actions || [],
          required_flags: capDef.flags_required || [],
          missing_flags: missingFlags,
          required_sources: capDef.required_sources || [],
          missing_sources: missingSources.missing || []
        }
      : null,
    evidence_pack: {
      executed_sql: null,
      query_execution_id: null,
      sources: [],
      row_count: 0,
      validations: { read_only: true, allowlist: true },
      confidence: 'low',
      status: 'not_supported_yet',
      question: questionText || null
    }
  };
}

function chooseDeterministicQueryForCapability(capabilityKey, questionText) {
  const normalized = normalizeQuestionText(questionText);
  const key = String(capabilityKey || '').trim().toLowerCase();
  if (!key || !normalized) return null;

  if (key === 'data_quality_recon') {
    if (normalized.includes('customer')) return { question_id: 'unmapped_network_customers', params: {} };
    return { question_id: 'unmapped_network_services', params: {} };
  }

  if (key === 'unit_economics') {
    if (normalized.includes('e-band') || normalized.includes('e band') || normalized.includes('eband') || normalized.includes('exit')) {
      return { question_id: 'worst_e_band', params: {} };
    }
    if (normalized.includes('ticket') || normalized.includes('support')) {
      return { question_id: 'margin_tickets', params: {} };
    }
    return { question_id: 'ae_band_distribution', params: {} };
  }

  if (key === 'repricing_call_lists') {
    return { question_id: 'margin_tickets', params: {} };
  }

  return null;
}

function hasDestructiveIntent(questionText) {
  const normalized = normalizeQuestionText(questionText);
  if (!normalized) return false;
  return READ_ONLY_SQL_BLOCKLIST.test(normalized);
}

function detectNonDataQuestion(questionText) {
  const normalized = normalizeQuestionText(questionText);
  if (!normalized) return null;
  const identityPhrases = [
    'who are you',
    'who r you',
    'what are you',
    'tell me who you are',
    'identify yourself',
    'describe yourself',
    'what is this'
  ];
  if (identityPhrases.some((phrase) => normalized === phrase)) {
    return {
      question_id: 'non_data_response',
      non_data_key: 'ai_identity',
      answer_markdown: [
        '**MAC AI Console**',
        '- Deterministic, read-only analytics over the MAC data lake.',
        '- I translate questions into governed queries with evidence packs.',
        '- Ask about MRR, customers, network mix, tickets, outages, or projects.'
      ].join('\n')
    };
  }
  if (normalized.startsWith('help') || normalized.includes('what can you do')) {
    return {
      question_id: 'non_data_response',
      non_data_key: 'ai_help',
      answer_markdown: [
        '**How to use the MAC AI Console**',
        '- Ask plain-language questions about MRR, customers, network mix, tickets, outages, and projects.',
        '- I return deterministic answers with evidence packs from SSOT views.',
        '- If a question is ambiguous, I will ask a clarifying question.'
      ].join('\n')
    };
  }
  return null;
}

function cleanCity(raw) {
  if (!raw) return null;
  let city = String(raw)
    .replace(/[?.!,]+$/g, '')
    .replace(/\b(customers?|customer)\b/gi, ' ')
    .replace(/\b(please|right now|today|currently|now)\b/gi, ' ')
    .replace(/[^a-z\s'-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!city) return null;
  city = city.replace(/\b(the|a|an)\b/gi, '').trim();
  city = city.replace(/\b[a-z]{2}\b$/i, '').trim();
  return city || null;
}

function normalizeSystemKey(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSystemAliasMap(crosswalks) {
  const aliasMap = new Map();
  const entries = (crosswalks?.crosswalks || [])
    .flatMap((cw) => cw?.entries || [])
    .filter(Boolean);
  entries.forEach((entry) => {
    const aliases = new Set([
      entry.network,
      entry.gwi_system,
      ...(Array.isArray(entry.aliases) ? entry.aliases : [])
    ]);
    aliases.forEach((alias) => {
      const key = normalizeSystemKey(alias);
      if (!key) return;
      const existing = aliasMap.get(key) || [];
      if (!existing.find((item) => item.network === entry.network && item.gwi_system === entry.gwi_system)) {
        existing.push({ network: entry.network, gwi_system: entry.gwi_system });
      }
      aliasMap.set(key, existing);
    });
  });
  return aliasMap;
}

function buildSystemAliasLabels(crosswalks) {
  const labelMap = new Map();
  const entries = (crosswalks?.crosswalks || [])
    .flatMap((cw) => cw?.entries || [])
    .filter(Boolean);
  entries.forEach((entry) => {
    const aliases = new Set([
      entry.network,
      entry.gwi_system,
      ...(Array.isArray(entry.aliases) ? entry.aliases : [])
    ]);
    aliases.forEach((alias) => {
      const key = normalizeSystemKey(alias);
      if (!key) return;
      if (!labelMap.has(key)) {
        labelMap.set(key, String(alias).trim());
      }
    });
  });
  return labelMap;
}

function findSystemMatchInQuestion(questionText) {
  const normalized = normalizeSystemKey(questionText);
  if (!normalized) return null;
  let bestKey = null;
  for (const key of SYSTEM_ALIAS_MAP.keys()) {
    if (!key) continue;
    if (
      normalized === key ||
      normalized.startsWith(`${key} `) ||
      normalized.endsWith(` ${key}`) ||
      normalized.includes(` ${key} `)
    ) {
      if (!bestKey || key.length > bestKey.length) {
        bestKey = key;
      }
    }
  }
  if (!bestKey) return null;
  const matches = SYSTEM_ALIAS_MAP.get(bestKey) || [];
  if (!matches.length) return null;
  return {
    key: bestKey,
    label: SYSTEM_ALIAS_LABELS.get(bestKey) || bestKey,
    matches,
    ambiguous: matches.length > 1
  };
}

function resolveSystemMatch(label) {
  const key = normalizeSystemKey(label);
  if (!key) return null;
  const matches = SYSTEM_ALIAS_MAP.get(key) || [];
  if (!matches.length) return null;
  return {
    matches,
    ambiguous: matches.length > 1
  };
}

function detectInvestigationIntent(text) {
  const normalized = normalizeQuestionText(text);
  if (!normalized) return false;
  const terms = [
    'investigate',
    'verify',
    'verification',
    'cross system',
    'cross-system',
    'cross check',
    'cross-check',
    'across systems',
    'all systems',
    'compare systems',
    'reconcile',
    'validate across'
  ];
  return terms.some((term) => normalized.includes(term));
}

function resolveMetricKeyForQuestionId(questionId) {
  if (!questionId) return null;
  const lowered = String(questionId).toLowerCase();
  if (METRIC_DEFS[lowered]) return lowered;
  const entries = Object.entries(METRIC_DEFS);
  for (const [metricKey, def] of entries) {
    if (!def) continue;
    const queryId = def.query_id ? String(def.query_id).toLowerCase() : null;
    if (queryId && queryId === lowered) return metricKey;
    const queryIds = Array.isArray(def.query_ids) ? def.query_ids.map((q) => String(q).toLowerCase()) : [];
    if (queryIds.includes(lowered)) return metricKey;
  }
  return null;
}

function buildCustomerLocationQuestion(city) {
  const systemMatch = resolveSystemMatch(city);
  if (systemMatch?.matches?.length === 1) {
    const match = systemMatch.matches[0];
    return {
      questionId: 'customers_in_location_multiscope',
      params: {
        city,
        network: match.network,
        gwi_system: match.gwi_system
      }
    };
  }
  if (systemMatch?.matches?.length > 1) {
    return {
      questionId: 'customers_in_location_multiscope',
      params: {
        city,
        system_candidates: systemMatch.matches.map((match) => match.network)
      }
    };
  }
  return { questionId: 'customers_in_location_multiscope', params: { city } };
}

function resolveDeterministicQuestion(questionText) {
  const normalized = normalizeQuestionText(questionText);
  if (!normalized) return null;

  const includesAny = (terms) => terms.some((term) => normalized.includes(term));
  const isCountQuestion = includesAny(['how many', 'count', 'number of', 'total']);
  const isListQuestion = includesAny(['list', 'show', 'display', 'which', 'what are', 'what is']);
  const wantsInvestigation = detectInvestigationIntent(normalized);
  const wantsOwned = includesAny(['owned', 'oned']);
  const wantsContracted = includesAny(['contracted', 'resold']);
  const wantsClec = includesAny(['clec', 'copper']);
  const wantsNetworks = includesAny(['network', 'networks', 'systems', 'system']);
  const wantsCustomers = includesAny(['customer', 'customers', 'subscriber', 'subscribers', 'subscription', 'subscriptions', 'subs']);
  const wantsWorkbookDomain = includesAny(['investor', 'workbook', 'customer mix', 'revenue mix', 'mix network', 'network mix']);
  const wantsRevenueMix = includesAny(['revenue mix', 'plat id', 'platid', 'billed', 'billing', 'invoice']);
  const wantsCustomerMix = includesAny(['customer mix', 'customer-mix']) || (includesAny(['mix']) && wantsCustomers);

  const buildCustomerMixParams = ({ networkType = '', customerType = '', accessType = '' }) => ({
    network_type: networkType,
    customer_type: customerType,
    access_type: accessType
  });

  // Network Mix workbook domain (finite + deterministic).
  // If this detects a Network Mix question, it either returns a deterministic route OR fails-closed as NOT SUPPORTED.
  const networkMixEarly = resolveNetworkMixDomainQuestion(questionText);
  if (networkMixEarly) return networkMixEarly;

  // Vetro construction / phase questions: don't let these fall into generic "network KPI" routing.
  if (
    includesAny(['construction', 'in construction', 'build phase', 'phase', 'in build']) &&
    includesAny(['network', 'networks', 'vetro'])
  ) {
    return { questionId: 'vetro_networks_in_construction', params: {} };
  }

  if (includesAny(['month end close', 'month-end close']) || (includesAny(['month end', 'month-end']) && includesAny(['close']))) {
    return { questionId: 'month_end_close', params: {} };
  }

  if (includesAny(['revenue report'])) {
    return { questionId: 'revenue_report_12m', params: {} };
  }

  if (includesAny(['arpu', 'average revenue per user', 'average revenue per customer'])) {
    return { questionId: 'arpu_overview', params: {} };
  }

  if (includesAny(['passings', 'subscribers', 'penetration', 'homes passed'])) {
    return { questionId: 'passings_subscribers', params: {} };
  }

  if (includesAny(['network health', 'network mix']) && includesAny(['network type', 'by network type'])) {
    return { questionId: 'network_network_type_summary', params: {} };
  }

  if (includesAny(['network health', 'network mix']) && includesAny(['customer type', 'by customer type'])) {
    return { questionId: 'network_customer_type_summary', params: {} };
  }

  if (includesAny(['network health', 'network mix']) && !includesAny(['network type', 'customer type', 'by network type', 'by customer type'])) {
    return { questionId: 'network_health', params: {} };
  }

  if (includesAny(['at risk'])) {
    if (isCountQuestion) {
      return { questionId: 'at_risk_count', params: {} };
    }
    return { questionId: 'at_risk_customers', params: {} };
  }

  if (includesAny(['projects pipeline', 'project pipeline', 'pipeline', 'projects'])) {
    if (isCountQuestion) {
      return { questionId: 'projects_summary', params: {} };
    }
    return { questionId: 'projects_pipeline', params: {} };
  }

  if (includesAny(['mrr', 'monthly recurring revenue', 'recurring revenue', 'total revenue'])) {
    if (includesAny(['trend', 'trajectory', 'history', 'last 12', '12 month', 'twelve month', 'last twelve', 'by month', 'monthly'])) {
      return { questionId: 'mrr_trend_12m', params: {} };
    }
    return { questionId: 'mrr_overview', params: {} };
  }

  if (includesAny(['ticket', 'tickets', 'support', 'support queue', 'queue', 'cci'])) {
    if (isCountQuestion) {
      return { questionId: 'tickets_summary', params: {} };
    }
    if (includesAny(['open', 'active']) || isListQuestion) {
      return { questionId: 'open_tickets_active', params: {} };
    }
    return { questionId: 'tickets_summary', params: {} };
  }

  if (normalized.includes('outage')) {
    if (isCountQuestion) {
      return { questionId: 'outages_summary', params: {} };
    }
    return { questionId: 'outages_reported', params: {} };
  }

  if (normalized.includes('copper') && (normalized.includes('customer') || normalized.includes('customers') || normalized.includes('only'))) {
    const systemMatch = findSystemMatchInQuestion(questionText);
    const copperParams = {
      network: '',
      network_prefix: ''
    };
    if (systemMatch?.matches?.length === 1) {
      const match = systemMatch.matches[0];
      copperParams.network = match.network || match.gwi_system || '';
    } else if (normalized.includes('gwi')) {
      copperParams.network_prefix = 'gwi%';
    }

    const hasCopperScope = Boolean(copperParams.network || copperParams.network_prefix);
    const wantsInvestigation = detectInvestigationIntent(questionText);
    if (wantsInvestigation) {
      return { questionId: 'copper_customers_multiscope', params: hasCopperScope ? copperParams : {} };
    }
    return { questionId: 'copper_customers_count', params: hasCopperScope ? copperParams : {} };
  }

  // Owned networks / owned customers (multi-scope). Users will not always say "investor workbook".
  // Return a reconciled view of "owned" counts across:
  // - bucketed billing customers (latest Platt MRR month)
  // - investor workbook PLAT ID COUNT (owned networks)
  // - modeled subscriptions/passings (Owned FTTP + Owned Customer)
  if (
    wantsOwned &&
    (includesAny(['customer', 'customers']) || isCountQuestion)
  ) {
    return { questionId: 'owned_customers_multiscope', params: {} };
  }

  if (
    wantsOwned &&
    (includesAny(['what networks', 'which networks', 'list', 'show']) || (includesAny(['network', 'networks']) && isListQuestion))
  ) {
    return { questionId: 'owned_networks_list', params: {} };
  }

  // Investor Questions workbook: "owned networks" is ambiguous across tabs.
  // Return both (a) modeled Owned FTTP subscriptions (network health) and (b) investor revenue mix PLAT ID COUNT for Owned;*.
  // This prevents accidental fall-through to generic identity totals.
  if (
    includesAny(['investor', 'investor question', 'investor questions', 'workbook', 'revenue mix']) &&
    includesAny(['owned']) &&
    (includesAny(['network', 'networks']) || includesAny(['customer', 'customers', 'plat id', 'platid', 'billed', 'subscription', 'subscriptions']))
  ) {
    return { questionId: 'owned_customers_investor_workbook', params: {} };
  }

  if (normalized.includes('customer') && normalized.includes(' in ')) {
    const match = String(questionText || '').match(/customers?.*?\bin\s+([A-Za-z][A-Za-z\s'-]+)/i);
    if (match && match[1]) {
      const city = cleanCity(match[1]);
      if (city) {
        return buildCustomerLocationQuestion(city);
      }
    }
  }

  if (normalized.includes('customer')) {
    const systemMatch = findSystemMatchInQuestion(questionText);
    if (systemMatch?.matches?.length === 1) {
      const match = systemMatch.matches[0];
      return {
        questionId: 'customers_in_location_multiscope',
        params: {
          city: systemMatch.label,
          network: match.network,
          gwi_system: match.gwi_system
        }
      };
    }
    if (systemMatch?.matches?.length > 1) {
      return {
        questionId: 'customers_in_location_multiscope',
        params: {
          city: systemMatch.label,
          system_candidates: systemMatch.matches.map((match) => match.network)
        }
      };
    }
  }

  if (includesAny(['active accounts', 'active account', 'active customers', 'customers with mrr', 'billing customers', 'billing customer', 'billed customers', 'billed customer'])) {
    return { questionId: 'customer_identity_overview', params: {} };
  }

  if ((normalized.includes('unique') && (normalized.includes('customer id') || normalized.includes('customer ids'))) ||
      normalized.includes('customer ids') || normalized.includes('customer id count')) {
    return { questionId: 'customer_identity_overview', params: {} };
  }

  if (normalized.includes('how many customers') || normalized.includes('customer count')) {
    return { questionId: 'customer_identity_overview', params: {} };
  }

  return null;
}

const REGISTRY_ALIASES = {
  mrr_overview: ['total mrr', 'mrr total', 'monthly recurring revenue', 'recurring revenue', 'total revenue'],
  mrr_trend_12m: ['mrr trend', 'mrr trajectory', 'mrr history', 'mrr last 12 months', 'mrr by month'],
  arpu_overview: ['arpu', 'average revenue per user', 'average revenue per customer'],
  revenue_report_12m: ['revenue report', 'revenue last 12 months', '12 month revenue'],
  month_end_close: ['month end close', 'month-end close', 'close summary'],
  customer_overview: ['customer count', 'how many customers', 'customer base', 'total customers'],
  customer_identity_overview: [
    'active customers',
    'billing customers',
    'unique customer ids',
    'unique customer id',
    'customer ids',
    'customer id count',
    'active accounts'
  ],
  unique_customer_ids: ['unique customer id', 'unique customer ids'],
  customer_trend_12m: ['customer trend', 'customers by month', 'customer history'],
  passings_subscribers: ['passings', 'subscribers', 'subscriptions', 'penetration', 'homes passed'],
  network_health: ['network health', 'network mix'],
  tickets_summary: ['ticket count', 'tickets count', 'how many tickets', 'open tickets count'],
  open_tickets_active: ['open tickets', 'active tickets'],
  outages_summary: ['outage count', 'outages count', 'how many outages'],
  outages_reported: ['outages reported', 'outage list'],
  at_risk_customers: ['at risk customers', 'at risk accounts'],
  at_risk_count: ['at risk count'],
  projects_pipeline: ['projects pipeline', 'project pipeline', 'pipeline'],
  projects_summary: ['project count', 'projects count', 'how many projects'],
  vetro_networks_in_construction: [
    'networks in construction',
    'network construction',
    'construction phase networks',
    'networks under construction',
    'vetro construction'
  ]
};

const TOKEN_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'our', 'we', 'do', 'does', 'is', 'are', 'what', 'how', 'many',
  'total', 'show', 'me', 'please', 'latest', 'current', 'this', 'that', 'last', 'trailing',
  'month', 'months', 'year', 'years', 'ytd', 'to', 'in', 'for'
]);

function tokenizeForMatch(text) {
  return normalizeQuestionText(text)
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t && !TOKEN_STOPWORDS.has(t));
}

function jaccardScore(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union ? intersection / union : 0;
}

function findRegistryMatch(questionText) {
  const tokens = tokenizeForMatch(questionText);
  let best = { id: null, score: 0 };
  Object.entries(REGISTRY_ALIASES).forEach(([id, aliases]) => {
    const idTokens = tokenizeForMatch(id.replace(/_/g, ' '));
    const idScore = jaccardScore(tokens, idTokens);
    if (idScore > best.score) best = { id, score: idScore };
    (aliases || []).forEach((alias) => {
      const aliasTokens = tokenizeForMatch(alias);
      const score = jaccardScore(tokens, aliasTokens);
      if (score > best.score) best = { id, score };
    });
  });
  if (best.score >= 0.32) return best.id;
  return null;
}

function suggestRegistryMatches(questionText, limit = 5) {
  const tokens = tokenizeForMatch(questionText);
  const scored = Object.entries(REGISTRY_ALIASES).map(([id, aliases]) => {
    const idTokens = tokenizeForMatch(id.replace(/_/g, ' '));
    let bestScore = jaccardScore(tokens, idTokens);
    (aliases || []).forEach((alias) => {
      const aliasTokens = tokenizeForMatch(alias);
      const score = jaccardScore(tokens, aliasTokens);
      if (score > bestScore) bestScore = score;
    });
    return { id, score: bestScore };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((item) => item.score > 0).slice(0, limit);
}

function detectTimeRange(normalized) {
  const lastMonthsMatch = normalized.match(/last\s+(\d{1,2})\s+months?/);
  const lastDaysMatch = normalized.match(/last\s+(\d{1,3})\s+days?/);
  const hasTrend = normalized.includes('trend') || normalized.includes('trajectory') || normalized.includes('history') || normalized.includes('by month') || normalized.includes('monthly');
  return {
    lastMonths: lastMonthsMatch ? Number(lastMonthsMatch[1]) : null,
    lastDays: lastDaysMatch ? Number(lastDaysMatch[1]) : null,
    ytd: normalized.includes('ytd') || normalized.includes('year to date'),
    latest: normalized.includes('this month') || normalized.includes('current month') || normalized.includes('latest'),
    trend: hasTrend
  };
}

function detectDimension(normalized) {
  if (normalized.includes('by city') || normalized.includes('by town') || normalized.includes('by location')) return 'city';
  if (normalized.includes('by month') || normalized.includes('monthly')) return 'month';
  if (normalized.includes('by network type') || normalized.includes('network type')) return 'network_type';
  if (normalized.includes('by customer type') || normalized.includes('customer type')) return 'customer_type';
  return null;
}

function detectMetric(normalized) {
  if (normalized.includes('arpu') || normalized.includes('average revenue per')) return 'arpu';
  if (normalized.includes('mrr') || normalized.includes('monthly recurring revenue') || normalized.includes('recurring revenue') || normalized.includes('total revenue')) return 'mrr';
  if (normalized.includes('ticket')) return 'tickets';
  if (normalized.includes('outage')) return 'outages';
  // "network" alone is too ambiguous (can mean construction phase, Vetro plans, etc).
  // Only treat as "network metrics" when the question includes a network KPI keyword or an explicit network mix/health phrase.
  if (
    normalized.includes('network health') ||
    normalized.includes('network mix') ||
    normalized.includes('network type') ||
    normalized.includes('customer type') ||
    normalized.includes('passings') ||
    normalized.includes('subscriptions') ||
    normalized.includes('subscribers') ||
    normalized.includes('penetration') ||
    normalized.includes('homes passed')
  ) return 'network';
  if (normalized.includes('project') || normalized.includes('pipeline')) return 'projects';
  if (normalized.includes('customer')) return 'customers';
  return null;
}

function buildMetricDrivenQuery(questionText) {
  const normalized = normalizeQuestionText(questionText);
  const metric = detectMetric(normalized);
  if (!metric) return null;
  const timeRange = detectTimeRange(normalized);
  const dimension = detectDimension(normalized);
  const isCountQuestion = normalized.includes('how many') || normalized.includes('count') || normalized.includes('number of') || normalized.includes('total');

  if (metric === 'mrr') {
    if (timeRange.trend || dimension === 'month') {
      return { questionId: 'mrr_trend_12m', params: {}, cacheKeySeed: `mrr_trend_12m:${stableStringify({})}` };
    }
    return { questionId: 'mrr_overview', params: {}, cacheKeySeed: `mrr_overview:${stableStringify({})}` };
  }

  if (metric === 'arpu') {
    return { questionId: 'arpu_overview', params: {}, cacheKeySeed: `arpu_overview:${stableStringify({})}` };
  }

  if (metric === 'projects') {
    if (isCountQuestion) {
      return { questionId: 'projects_summary', params: {}, cacheKeySeed: `projects_summary:${stableStringify({})}` };
    }
    return { questionId: 'projects_pipeline', params: {}, cacheKeySeed: `projects_pipeline:${stableStringify({})}` };
  }

  if (metric === 'tickets') {
    if (dimension === 'city') {
      const sql = `SELECT\n  COALESCE(NULLIF(TRIM(service_location_city), ''), 'Unknown') AS city,\n  COUNT(*) AS ticket_count\nFROM curated_core.v_cci_tickets_clean\nWHERE service_location_city IS NOT NULL\n  AND TRIM(service_location_city) <> ''\nGROUP BY 1\nORDER BY ticket_count DESC\nLIMIT 200;`;
      return {
        questionId: 'tickets_by_city',
        params: {},
        cacheKeySeed: `tickets_by_city:${stableStringify({})}`,
        queryDef: { sql, params: [], views_used: ['curated_core.v_cci_tickets_clean'], __dynamic: true }
      };
    }
    if (isCountQuestion) {
      return { questionId: 'tickets_summary', params: {}, cacheKeySeed: `tickets_summary:${stableStringify({})}` };
    }
    if (normalized.includes('open') || normalized.includes('active')) {
      return { questionId: 'open_tickets_active', params: {}, cacheKeySeed: `open_tickets_active:${stableStringify({})}` };
    }
    return { questionId: 'tickets_summary', params: {}, cacheKeySeed: `tickets_summary:${stableStringify({})}` };
  }

  if (metric === 'outages') {
    if (isCountQuestion) {
      return { questionId: 'outages_summary', params: {}, cacheKeySeed: `outages_summary:${stableStringify({})}` };
    }
    return { questionId: 'outages_reported', params: {}, cacheKeySeed: `outages_reported:${stableStringify({})}` };
  }

  if (metric === 'network') {
    if (dimension === 'network_type' || dimension === 'customer_type') {
      const groupCol = dimension === 'network_type' ? 'network_type' : 'customer_type';
      const sql = `SELECT\n  ${groupCol} AS ${groupCol},\n  SUM(passings) AS passings,\n  SUM(subscriptions) AS subscriptions,\n  CASE WHEN SUM(passings) > 0 THEN (SUM(subscriptions) / SUM(passings)) * 100 ELSE NULL END AS penetration_pct,\n  CASE WHEN SUM(subscriptions) > 0 THEN SUM(mrr) / SUM(subscriptions) ELSE NULL END AS avg_arpu\nFROM curated_recon.v_network_mix_billing_aligned_latest\nWHERE network <> 'Unmapped'\n  AND period_month = (SELECT MAX(period_month) FROM curated_recon.v_network_mix_billing_aligned_latest)\nGROUP BY ${groupCol}\nORDER BY passings DESC\nLIMIT 100;`;
      return {
        questionId: `network_${groupCol}_summary`,
        params: {},
        cacheKeySeed: `network_${groupCol}_summary:${stableStringify({})}`,
        queryDef: { sql, params: [], views_used: ['curated_recon.v_network_mix_billing_aligned_latest'], __dynamic: true }
      };
    }
    return { questionId: 'passings_subscribers', params: {}, cacheKeySeed: `passings_subscribers:${stableStringify({})}` };
  }

  if (metric === 'customers') {
    const systemMatch = findSystemMatchInQuestion(questionText);
    if (systemMatch?.matches?.length === 1) {
      const match = systemMatch.matches[0];
      return {
        questionId: 'customers_in_location_multiscope',
        params: {
          city: systemMatch.label,
          network: match.network,
          gwi_system: match.gwi_system
        },
        cacheKeySeed: `customers_in_location_multiscope:${stableStringify({
          city: systemMatch.label,
          network: match.network,
          gwi_system: match.gwi_system
        })}`
      };
    }
    if (systemMatch?.matches?.length > 1) {
      return {
        questionId: 'customers_in_location_multiscope',
        params: {
          city: systemMatch.label,
          system_candidates: systemMatch.matches.map((match) => match.network)
        },
        cacheKeySeed: `customers_in_location_multiscope:${stableStringify({
          city: systemMatch.label,
          system_candidates: systemMatch.matches.map((match) => match.network)
        })}`
      };
    }
    if (dimension === 'month' || timeRange.trend) {
      return { questionId: 'customer_trend_12m', params: {}, cacheKeySeed: `customer_trend_12m:${stableStringify({})}` };
    }
    if (dimension === 'city') {
      const activeOnly = !normalized.includes('total') && !normalized.includes('all');
      const cityFilter = normalized.includes(' in ');
      if (cityFilter) {
        const match = String(questionText || '').match(/customers?.*?\bin\s+([A-Za-z][A-Za-z\s'-]+)/i);
        if (match && match[1]) {
          const city = cleanCity(match[1]);
          if (city) {
            const resolved = buildCustomerLocationQuestion(city);
            return {
              ...resolved,
              cacheKeySeed: `${resolved.questionId}:${stableStringify(resolved.params || {})}`
            };
          }
        }
      }
      const sql = `SELECT\n  COALESCE(NULLIF(TRIM(gwi_lq_city), ''), NULLIF(TRIM(city), ''), 'Unknown') AS city,\n  COUNT(DISTINCT username) AS customer_count\nFROM curated_core.platt_customer_current_ssot\nWHERE username IS NOT NULL\n  AND TRIM(username) <> ''\n  AND LOWER(COALESCE(sensitive_p, '')) <> 'y'\n  ${activeOnly ? "AND LOWER(COALESCE(active, '')) IN ('y','yes','true','1')" : ''}\nGROUP BY 1\nORDER BY customer_count DESC\nLIMIT 200;`;
      return {
        questionId: 'customers_by_city',
        params: {},
        cacheKeySeed: `customers_by_city:${stableStringify({ activeOnly })}`,
        queryDef: { sql, params: [], views_used: ['curated_core.platt_customer_current_ssot'], __dynamic: true }
      };
    }
    if (isCountQuestion) {
      return { questionId: 'customer_identity_overview', params: {}, cacheKeySeed: `customer_identity_overview:${stableStringify({})}` };
    }
    return { questionId: 'customer_identity_overview', params: {}, cacheKeySeed: `customer_identity_overview:${stableStringify({})}` };
  }

  return null;
}

function resolveDeterministicQuery(questionText) {
  const direct = resolveDeterministicQuestion(questionText);
  if (direct) {
    if (direct.notSupportedPayload) return direct;
    return { ...direct, cacheKeySeed: `${direct.questionId}:${stableStringify(direct.params || {})}` };
  }
  const metricDriven = buildMetricDrivenQuery(questionText);
  if (metricDriven) return metricDriven;
  const fuzzyMatch = findRegistryMatch(questionText);
  if (fuzzyMatch) {
    return { questionId: fuzzyMatch, params: {}, cacheKeySeed: `${fuzzyMatch}:${stableStringify({})}` };
  }
  return null;
}

const BEDROCK_MODEL_FALLBACKS = (process.env.BEDROCK_MODEL_FALLBACKS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const DEFAULT_BEDROCK_FALLBACKS = [
  'anthropic.claude-3-haiku-20240307-v1:0',
  'anthropic.claude-3-7-sonnet-20250219-v1:0',
  'anthropic.claude-3-5-sonnet-20241022-v2:0',
  'anthropic.claude-3-5-haiku-20241022-v1:0'
];

async function invokeBedrockPlan(modelId, prompt) {
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: BEDROCK_MAX_TOKENS,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }]
  });
  const res = await bedrock.invokeModel({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body
  }).promise();
  const payload = JSON.parse(res.body.toString());
  const content = payload?.content?.[0]?.text || payload?.output_text || payload?.completion || '';
  return extractJsonFromBedrock(content);
}

function extractConverseToolInput(converseResult, expectedToolName = null) {
  const message = converseResult?.output?.message || null;
  const content = Array.isArray(message?.content) ? message.content : [];
  for (const block of content) {
    if (!block || !block.toolUse) continue;
    const toolUse = block.toolUse;
    if (expectedToolName && toolUse.name !== expectedToolName) continue;
    if (toolUse.input && typeof toolUse.input === 'object') return toolUse.input;
  }
  return null;
}

function extractConverseText(converseResult) {
  const message = converseResult?.output?.message || null;
  const content = Array.isArray(message?.content) ? message.content : [];
  return content
    .map((block) => (block && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function invokeBedrockPlanToolUse(modelId, prompt) {
  if (!QUERY_PLAN_SCHEMA || !Object.keys(QUERY_PLAN_SCHEMA).length) {
    throw new Error('Query plan schema missing');
  }
  const res = await bedrock.converse({
    modelId,
    system: PLANNER_SYSTEM_PROMPT ? [{ text: PLANNER_SYSTEM_PROMPT }] : undefined,
    inferenceConfig: {
      maxTokens: BEDROCK_MAX_TOKENS,
      temperature: 0
    },
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: 'create_query_plan',
            description: 'Create a governed QueryPlan JSON for execution by the deterministic engine.',
            inputSchema: { json: QUERY_PLAN_SCHEMA }
          }
        }
      ],
      toolChoice: { tool: { name: 'create_query_plan' } }
    },
    messages: [{ role: 'user', content: [{ text: prompt }] }]
  }).promise();

  const toolInput = extractConverseToolInput(res, 'create_query_plan');
  if (toolInput) return toolInput;

  const text = extractConverseText(res);
  const parsed = extractJsonFromBedrock(text);
  if (parsed) return parsed;

  throw new Error('Bedrock planner did not return tool output');
}

async function generatePlanWithBedrock(question, validationErrors = []) {
  if (!BEDROCK_ENABLED || !BEDROCK_MODEL_ID || !BEDROCK_TOOL_USE_ENABLED) {
    throw new Error('Bedrock planner not enabled');
  }
  const prompt = buildBedrockPlanPrompt(question, validationErrors);
  const modelIds = [
    BEDROCK_INFERENCE_PROFILE_ID,
    BEDROCK_MODEL_ID,
    ...BEDROCK_MODEL_FALLBACKS,
    ...DEFAULT_BEDROCK_FALLBACKS
  ]
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);

  let lastError = null;
  for (const modelId of modelIds) {
    try {
      const plan = await invokeBedrockPlanToolUse(modelId, prompt);
      if (!plan) throw new Error('Bedrock returned invalid plan JSON');
      return plan;
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || err || '');
      if (!/AccessDenied|ValidationException|ModelNotFound|UnknownOperation|not authorized|on-demand throughput|inference profile|not supported|use case details|use-case details|use case form|details form/i.test(msg)) {
        break;
      }
    }
  }
  throw lastError || new Error('Bedrock planner failed');
}

function normalizePlan(plan) {
  const normalized = { ...(plan || {}) };
  normalized.intent = normalized.intent || null;
  normalized.metric_key = normalized.metric_key || null;
  normalized.grain = normalized.grain || null;
  normalized.dimensions = Array.isArray(normalized.dimensions) ? normalized.dimensions : [];
  normalized.filters = Array.isArray(normalized.filters) ? normalized.filters : [];
  normalized.time_window = normalized.time_window && typeof normalized.time_window === 'object' ? normalized.time_window : null;
  normalized.source_view = normalized.source_view || null;
  normalized.joins = Array.isArray(normalized.joins) ? normalized.joins : [];
  normalized.limits = normalized.limits && typeof normalized.limits === 'object' ? normalized.limits : {};
  normalized.limits.rows = Number(normalized.limits.rows || 0) || MAX_RESULT_ROWS;
  normalized.cross_checks = Array.isArray(normalized.cross_checks) ? normalized.cross_checks : [];
  normalized.driver_queries = Array.isArray(normalized.driver_queries) ? normalized.driver_queries : [];
  normalized.assumptions = Array.isArray(normalized.assumptions) ? normalized.assumptions : [];
  normalized.clarifying_question = normalized.clarifying_question || null;
  return normalized;
}

function resolveMaxRows(queryDef) {
  if (!queryDef) return MAX_RESULT_ROWS;
  const requested = Number(queryDef.max_rows || queryDef?.limits?.rows || 0);
  const target = requested > 0 ? requested : MAX_RESULT_ROWS;
  const capped = Math.min(target, MAX_RESULT_ROWS_HARD);
  return Math.max(capped, 1);
}

function fillMissingParams(queryDef, params) {
  if (!queryDef?.params || queryDef.params.length === 0) return params || {};
  const next = { ...(params || {}) };
  queryDef.params.forEach((p) => {
    if (!(p in next)) next[p] = '';
  });
  return next;
}

function normalizePeriodMonth(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(20\d{2})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}_${match[2]}`;
}

function buildGlClosePackQuery(questionId, params) {
  const source = String(process.env.GL_CLOSE_PACK_SOURCE || 'intacct').toLowerCase();
  if (source !== 'platt') {
    return null;
  }
  const period = params?.period_month || params?.periodMonth;
  const monthTag = normalizePeriodMonth(period);
  if (!monthTag) return null;
  const limit = Number(params?.limit || (questionId === 'glclosepack_detail' ? 5000 : 500)) || 500;
  if (questionId === 'glclosepack_detail') {
    const table = `curated_core.v_platt_gl_revenue_by_customer_${monthTag}`;
    return {
      sql: `SELECT * FROM ${table} LIMIT ${limit}`,
      params: [],
      views_used: [table],
      __dynamic: true
    };
  }
  if (questionId === 'glclosepack_summary') {
    const table = `curated_core.v_platt_gl_revenue_${monthTag}`;
    return {
      sql: `SELECT * FROM ${table} LIMIT ${limit}`,
      params: [],
      views_used: [table],
      __dynamic: true
    };
  }
  return null;
}

function getMetricDef(metricKey) {
  if (!metricKey) return null;
  return METRIC_DEFS[String(metricKey).toLowerCase()] || METRIC_DEFS[metricKey] || null;
}

function getQueryManifestEntry(questionId) {
  if (!questionId) return null;
  const lowered = String(questionId).toLowerCase();
  return QUERY_MANIFEST_DEFS[lowered] || QUERY_MANIFEST_DEFS[questionId] || null;
}

function getAllowedSource(sourceView) {
  if (!sourceView) return null;
  return ALLOWED_SOURCES_BY_NAME.get(String(sourceView).toLowerCase()) || null;
}

function validatePlan(plan) {
  const errors = [];
  const schemaValidation = validateWithSchema(QUERY_PLAN_VALIDATOR, plan);
  if (!schemaValidation.valid) {
    errors.push(...schemaValidation.errors.map((err) => `schema: ${err}`));
  }
  if (!plan.intent || !['metric', 'trend', 'breakdown', 'compare', 'anomaly'].includes(plan.intent)) {
    errors.push('intent is required and must be metric|trend|breakdown|compare|anomaly');
  }
  if (!plan.metric_key && !plan.source_view) {
    errors.push('metric_key or source_view is required');
  }

  const metricDef = getMetricDef(plan.metric_key);
  const sourceView = plan.source_view || metricDef?.compile?.source_view || (metricDef?.source_views || [])[0] || null;
  if (!sourceView) {
    errors.push('source_view could not be resolved');
  } else if (!getAllowedSource(sourceView)) {
    errors.push(`source_view not in allowed sources: ${sourceView}`);
  }

  const sourceMeta = getAllowedSource(sourceView);
  const allowedDims = new Set([...(sourceMeta?.allowed_dimensions || [])]);
  plan.dimensions.forEach((dim) => {
    if (dim && !allowedDims.has(dim)) {
      errors.push(`dimension not allowed for source ${sourceView}: ${dim}`);
    }
  });
  plan.filters.forEach((filter) => {
    if (!filter || !filter.field) return;
    if (filter.field !== sourceMeta?.time_column && !allowedDims.has(filter.field)) {
      errors.push(`filter field not allowed for source ${sourceView}: ${filter.field}`);
    }
  });

  plan.joins.forEach((join) => {
    if (!join || !join.to_view || !Array.isArray(join.on)) {
      errors.push('join entries must include to_view and on[]');
      return;
    }
    if (!getAllowedSource(join.to_view)) {
      errors.push(`join target not allowed: ${join.to_view}`);
      return;
    }
    const rule = JOIN_MAP.find((j) => j.from_view === sourceView && j.to_view === join.to_view);
    if (!rule) {
      errors.push(`join not allowed (no join map) from ${sourceView} to ${join.to_view}`);
      return;
    }
    const invalidKeys = join.on.filter((key) => !rule.keys.includes(key));
    if (invalidKeys.length) {
      errors.push(`join keys not allowed from ${sourceView} to ${join.to_view}: ${invalidKeys.join(', ')}`);
    }
  });

  return { errors, sourceView, metricDef, sourceMeta };
}

function applyPlanDefaults(plan, validation) {
  const updated = { ...plan };
  if (!updated.source_view && validation.sourceView) {
    updated.source_view = validation.sourceView;
  }
  if (!updated.time_window) {
    if (validation.metricDef?.default_time_window) {
      updated.time_window = validation.metricDef.default_time_window;
    } else if (validation.sourceMeta?.default_time_window) {
      updated.time_window = validation.sourceMeta.default_time_window;
    }
  }
  if (!updated.dimensions.length && validation.metricDef?.compile?.default_dimensions) {
    updated.dimensions = validation.metricDef.compile.default_dimensions.slice();
  }
  return updated;
}

function buildTimePredicate(sourceView, sourceMeta, timeWindow) {
  if (!sourceMeta || !sourceMeta.time_column) return null;
  const timeCol = sourceMeta.time_column;
  const timeType = sourceMeta.time_type || 'timestamp';
  const windowType = timeWindow?.type || null;
  if (windowType === 'snapshot') return null;
  if (windowType === 'latest' || (!windowType && sourceMeta.required_time_filter)) {
    return `${timeCol} = (SELECT MAX(${timeCol}) FROM ${sourceView})`;
  }
  if (windowType === 'between' && timeWindow?.start && timeWindow?.end) {
    if (timeType === 'varchar_date') {
      return `date_parse(${timeCol}, '%Y-%m-%d') BETWEEN date '${timeWindow.start}' AND date '${timeWindow.end}'`;
    }
    if (timeType === 'varchar_datetime') {
      return `from_iso8601_timestamp(${timeCol}) BETWEEN timestamp '${timeWindow.start} 00:00:00' AND timestamp '${timeWindow.end} 23:59:59'`;
    }
    return `${timeCol} BETWEEN date '${timeWindow.start}' AND date '${timeWindow.end}'`;
  }
  if (windowType === 'last_n') {
    const unit = timeWindow.unit || sourceMeta.time_grain || 'day';
    const n = Number(timeWindow.n || 1);
    if (timeType === 'varchar_date') {
      return `date_parse(${timeCol}, '%Y-%m-%d') >= date_add('${unit}', -${n - 1}, (SELECT MAX(date_parse(${timeCol}, '%Y-%m-%d')) FROM ${sourceView}))`;
    }
    if (timeType === 'varchar_datetime') {
      return `from_iso8601_timestamp(${timeCol}) >= date_add('${unit}', -${n - 1}, (SELECT MAX(from_iso8601_timestamp(${timeCol})) FROM ${sourceView}))`;
    }
    return `${timeCol} >= date_add('${unit}', -${n - 1}, (SELECT MAX(${timeCol}) FROM ${sourceView}))`;
  }
  return null;
}

function compileFilter(filter) {
  if (!filter || !filter.field) return null;
  const op = String(filter.op || '=').toLowerCase();
  if (op === 'between' && Array.isArray(filter.value) && filter.value.length === 2) {
    return `${filter.field} BETWEEN ${escapeSqlValue(filter.value[0])} AND ${escapeSqlValue(filter.value[1])}`;
  }
  if (op === 'in' && Array.isArray(filter.value)) {
    const values = filter.value.map((v) => escapeSqlValue(v)).join(', ');
    return `${filter.field} IN (${values})`;
  }
  if (op === 'like') {
    return `${filter.field} LIKE ${escapeSqlValue(filter.value)}`;
  }
  if (['=', '!=', '>=', '<='].includes(op)) {
    return `${filter.field} ${op} ${escapeSqlValue(filter.value)}`;
  }
  return null;
}

function compileNetworkMixSql(sourceView, groupCol) {
  const meta = getAllowedSource(sourceView) || {};
  const timeCol = meta.time_column;
  const timeFilter = timeCol ? `${timeCol} = (SELECT MAX(${timeCol}) FROM ${sourceView})` : null;
  const whereClauses = [
    timeFilter,
    'network <> \'Unmapped\''
  ].filter(Boolean);
  const whereSql = whereClauses.length ? `\nWHERE ${whereClauses.join('\n  AND ')}` : '';
  return `SELECT\n  ${groupCol} AS ${groupCol},\n  SUM(passings) AS passings,\n  SUM(subscriptions) AS subscriptions,\n  CASE WHEN SUM(passings) > 0 THEN (SUM(subscriptions) / SUM(passings)) * 100 ELSE NULL END AS penetration_pct,\n  CASE WHEN SUM(subscriptions) > 0 THEN SUM(mrr) / SUM(subscriptions) ELSE NULL END AS avg_arpu\nFROM ${sourceView}${whereSql}\nGROUP BY ${groupCol}\nORDER BY passings DESC\nLIMIT 200;`;
}

function compilePlanToSql(plan, validation) {
  const metricDef = validation.metricDef;
  const sourceView = plan.source_view || validation.sourceView;

  if (metricDef?.query_id && REGISTRY[metricDef.query_id]) {
    return {
      sql: REGISTRY[metricDef.query_id].sql,
      params: REGISTRY[metricDef.query_id].params || [],
      query_id: metricDef.query_id,
      views_used: REGISTRY[metricDef.query_id].views_used || [sourceView],
      value_column: metricDef.value_column || null,
      metric_key: plan.metric_key
    };
  }

  if (plan.metric_key === 'network_mix_by_network_type') {
    return {
      sql: compileNetworkMixSql(sourceView, 'network_type'),
      params: [],
      query_id: null,
      views_used: [sourceView],
      value_column: 'subscriptions',
      metric_key: plan.metric_key
    };
  }

  if (plan.metric_key === 'network_mix_by_customer_type') {
    return {
      sql: compileNetworkMixSql(sourceView, 'customer_type'),
      params: [],
      query_id: null,
      views_used: [sourceView],
      value_column: 'subscriptions',
      metric_key: plan.metric_key
    };
  }

  if (!metricDef?.compile) {
    throw new Error(`No compiler rule for metric_key: ${plan.metric_key || 'unknown'}`);
  }

  const compileSpec = metricDef.compile;
  const measureExpr = compileSpec.measure_expr;
  const metricAlias = compileSpec.metric_alias || 'value';
  const dims = plan.dimensions.length ? plan.dimensions : (compileSpec.default_dimensions || []);
  const filters = [...(compileSpec.default_filters || []), ...(plan.filters || [])];

  const whereParts = [];
  const timePredicate = buildTimePredicate(sourceView, validation.sourceMeta, plan.time_window);
  if (timePredicate) whereParts.push(timePredicate);
  filters.forEach((filter) => {
    const clause = compileFilter(filter);
    if (clause) whereParts.push(clause);
  });

  const selectParts = [];
  dims.forEach((dim) => {
    selectParts.push(dim);
  });
  selectParts.push(`${measureExpr} AS ${metricAlias}`);

  const groupBy = dims.length ? `\nGROUP BY ${dims.join(', ')}` : '';
  const orderBy = dims.length ? `\nORDER BY ${metricAlias} DESC` : '';
  const whereClause = whereParts.length ? `\nWHERE ${whereParts.join('\n  AND ')}` : '';

  const sql = `SELECT\n  ${selectParts.join(',\n  ')}\nFROM ${sourceView}${whereClause}${groupBy}${orderBy}\nLIMIT ${plan.limits.rows || MAX_RESULT_ROWS};`;
  return {
    sql,
    params: [],
    query_id: null,
    views_used: [sourceView],
    value_column: metricAlias,
    metric_key: plan.metric_key
  };
}

function compileReportSpec(reportSpec) {
  const spec = reportSpec || {};
  const schemaValidation = validateWithSchema(REPORT_SPEC_VALIDATOR, spec);
  if (!schemaValidation.valid) {
    throw new Error(`report_spec invalid: ${schemaValidation.errors.join('; ')}`);
  }

  if (spec.query_id) {
    const queryDef = REGISTRY[spec.query_id];
    if (!queryDef) {
      throw new Error(`report_spec query_id not found: ${spec.query_id}`);
    }
    return {
      queryDef,
      sql: ensureLimit(queryDef.sql, spec.limit || resolveMaxRows(queryDef)),
      views_used: queryDef.views_used || extractReferencedTables(queryDef.sql),
      params: spec.params || {}
    };
  }

  if (spec.metric_key) {
    const plan = normalizePlan({
      intent: 'metric',
      metric_key: spec.metric_key,
      grain: null,
      dimensions: Array.isArray(spec.columns) ? spec.columns : [],
      filters: Array.isArray(spec.filters) ? spec.filters : [],
      time_window: spec.time_window || null,
      limits: { rows: spec.limit || MAX_RESULT_ROWS }
    });
    let validation = validatePlan(plan);
    if (validation.errors.length) {
      throw new Error(`report_spec invalid metric_key: ${validation.errors.join('; ')}`);
    }
    const applied = applyPlanDefaults(plan, validation);
    const compiled = compilePlanToSql(applied, validation);
    const sql = ensureLimit(compiled.sql, applied.limits.rows || MAX_RESULT_ROWS);
    validateReadOnlySql(sql);
    validateSqlAllowlist(sql);
    validateSqlAgainstCatalog(sql);
    return {
      queryDef: null,
      sql,
      views_used: compiled.views_used || [validation.sourceView],
      params: {}
    };
  }

  if (spec.source_view) {
    const sourceView = spec.source_view;
    const sourceMeta = getAllowedSource(sourceView);
    if (!sourceMeta) {
      throw new Error(`report_spec source_view not allowed: ${sourceView}`);
    }
    const dims = Array.isArray(spec.columns) && spec.columns.length ? spec.columns : ['*'];
    const whereParts = [];
    const timePredicate = buildTimePredicate(sourceView, sourceMeta, spec.time_window);
    if (timePredicate) whereParts.push(timePredicate);
    (spec.filters || []).forEach((filter) => {
      const clause = compileFilter(filter);
      if (clause) whereParts.push(clause);
    });
    const whereClause = whereParts.length ? `\nWHERE ${whereParts.join('\n  AND ')}` : '';
    const sql = `SELECT ${dims.join(', ')}\nFROM ${sourceView}${whereClause}\nLIMIT ${spec.limit || MAX_RESULT_ROWS};`;
    validateReadOnlySql(sql);
    validateSqlAllowlist(sql);
    validateSqlAgainstCatalog(sql);
    return {
      queryDef: null,
      sql,
      views_used: [sourceView],
      params: {}
    };
  }

  throw new Error('report_spec must include query_id, metric_key, or source_view');
}

async function promoteQueryLibrary(planResult) {
  if (!planResult || planResult.status !== 'ok') return null;
  if (planResult.empty_unavailable) return null;
  if (planResult.cross_checks && planResult.cross_checks.some((c) => c.status === 'mismatch')) {
    return null;
  }
  const metricKey = planResult.plan?.metric_key || planResult.compiled?.metric_key || 'unknown_metric';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `${QUERY_LIBRARY_PREFIX}${sanitizeReportName(metricKey)}/${timestamp}.json`;
  const payload = {
    metric_key: metricKey,
    intent: planResult.plan?.intent || null,
    plan: planResult.plan || null,
    compiled: {
      sql: planResult.primaryResult?.sql || null,
      views_used: planResult.compiled?.views_used || []
    },
    evidence: {
      query_execution_id: planResult.primaryResult?.query_execution_id || null,
      freshness: planResult.freshness || null,
      cross_checks: planResult.cross_checks || [],
      sanity_check: planResult.sanity_check || null
    },
    promoted_at: new Date().toISOString()
  };
  try {
    await writeS3Json(QUERY_LIBRARY_BUCKET, key, payload);
    return { key };
  } catch (_) {
    return null;
  }
}

function validateSqlAgainstCatalog(sql) {
  const referenced = extractReferencedTables(sql);
  const allowed = new Set((ALLOWED_SOURCES_CATALOG.sources || []).map((s) => String(s.name).toLowerCase()));
  const unauthorized = referenced.filter((table) => !allowed.has(table));
  if (unauthorized.length) {
    throw new Error(`SQL uses non-allowed sources: ${unauthorized.join(', ')}`);
  }
  if (/\binformation_schema\./i.test(sql)) {
    throw new Error('information_schema access is not allowed in governed queries');
  }
}

function extractNumericValue(columns, rows, preferredColumn) {
  if (!columns || !rows || rows.length <= 1) return null;
  const dataRows = rows.slice(1);
  const columnIndex = preferredColumn ? columns.findIndex((c) => c === preferredColumn) : -1;
  for (const row of dataRows) {
    if (columnIndex >= 0) {
      const raw = row[columnIndex];
      const num = raw !== null && raw !== undefined ? Number(String(raw).replace(/,/g, '')) : NaN;
      if (!Number.isNaN(num)) return num;
    } else {
      for (let i = 0; i < row.length; i += 1) {
        const num = row[i] !== null && row[i] !== undefined ? Number(String(row[i]).replace(/,/g, '')) : NaN;
        if (!Number.isNaN(num)) return num;
      }
    }
  }
  return null;
}

function computeRowCount(rows) {
  if (!rows || rows.length <= 1) return 0;
  return rows.length - 1;
}

async function runFreshnessCheck(sourceView) {
  const sourceMeta = getAllowedSource(sourceView);
  if (!sourceMeta || !sourceMeta.time_column) {
    return { status: 'skipped', latest_partition: null, row_count: null };
  }
  // Avoid COUNT(*) on large views — MAX(time_column) is enough to determine emptiness and freshness.
  const sql = `SELECT MAX(${sourceMeta.time_column}) AS latest_partition FROM ${sourceView} LIMIT 1;`;
  const result = await executeFreeformQuery(sql, {});
  const latest = result.rows && result.rows.length > 1 ? result.rows[1][0] : null;
  return {
    status: latest ? 'ok' : 'empty',
    latest_partition: latest,
    row_count: null,
    query_execution_id: result.query_execution_id,
    sql
  };
}

async function runFreshnessCheckCached(sourceView) {
  if (!sourceView) return null;
  const cacheSeed = `freshness:${String(sourceView).toLowerCase()}`;
  const cacheKey = hashKey(cacheSeed);
  const cached = await getCache(cacheKey);
  if (cached && cached.expires_at > Math.floor(Date.now() / 1000) && cached.result) {
    return { ...cached.result, cached: true };
  }
  const freshness = await runFreshnessCheck(sourceView);
  await putCache(cacheKey, freshness, FRESHNESS_CACHE_SECONDS);
  return { ...freshness, cached: false };
}

function normalizeMaxAgeSeconds(check) {
  if (!check || typeof check !== 'object') return null;
  const minutes = Number(check.max_age_minutes || 0);
  const hours = Number(check.max_age_hours || 0);
  const days = Number(check.max_age_days || 0);
  const total = (Number.isFinite(minutes) ? minutes * 60 : 0) +
    (Number.isFinite(hours) ? hours * 3600 : 0) +
    (Number.isFinite(days) ? days * 86400 : 0);
  return total > 0 ? total : null;
}

function parseLatestPartitionAsDate(latestPartition) {
  if (!latestPartition) return null;
  return parseDateValue(latestPartition);
}

async function runFreshnessGate({ questionId } = {}) {
  if (!FRESHNESS_GATE_ENABLED) return null;
  const entry = getQueryManifestEntry(questionId);
  const checksSpec = Array.isArray(entry?.freshness_checks) ? entry.freshness_checks : [];
  if (!checksSpec.length) return null;

  const now = new Date();
  const tasks = checksSpec.map(async (spec) => {
    const view = spec?.view ? String(spec.view).trim() : '';
    if (!view) return null;
    const maxAgeSeconds = normalizeMaxAgeSeconds(spec);
    const meta = getAllowedSource(view);

    let freshness = null;
    try {
      freshness = await runFreshnessCheckCached(view);
    } catch (err) {
      return {
        blocked: true,
        result: {
          view,
          status: 'error',
          latest_partition: null,
          max_age_seconds: maxAgeSeconds,
          age_seconds: null,
          error: err?.message || String(err)
        }
      };
    }

    const latestPartition = freshness?.latest_partition || null;
    const latestDate = parseLatestPartitionAsDate(latestPartition);
    let ageSeconds = latestDate ? Math.floor((now.getTime() - latestDate.getTime()) / 1000) : null;
    const timeType = String(meta?.time_type || '').toLowerCase();
    const usesDaySlaOnly = Boolean(
      spec &&
      typeof spec === 'object' &&
      Number(spec.max_age_days || 0) > 0 &&
      Number(spec.max_age_hours || 0) <= 0 &&
      Number(spec.max_age_minutes || 0) <= 0
    );
    if (latestDate && timeType === 'varchar_date' && usesDaySlaOnly) {
      // `dt=YYYY-MM-DD` partitions are day-granularity; avoid false staleness due to time-of-day.
      const ageDays = diffDays(latestDate, now);
      ageSeconds = ageDays !== null ? ageDays * 86400 : ageSeconds;
    }

    let status = freshness?.status || 'error';
    if (status === 'ok' && maxAgeSeconds !== null && ageSeconds !== null && ageSeconds > maxAgeSeconds) {
      status = 'stale';
    }
    const blocked = status === 'empty' || status === 'error' || status === 'stale';

    return {
      blocked,
      result: {
        view,
        time_column: meta?.time_column || null,
        time_type: meta?.time_type || null,
        status,
        latest_partition: latestPartition,
        age_seconds: ageSeconds,
        max_age_seconds: maxAgeSeconds,
        query_execution_id: freshness?.query_execution_id || null,
        sql: freshness?.sql || null,
        cached: Boolean(freshness?.cached),
        raw_status: freshness?.status || null
      }
    };
  });

  const resolved = (await Promise.all(tasks)).filter(Boolean);
  const results = [];
  let blocked = false;
  for (const entry of resolved) {
    if (!entry?.result) continue;
    results.push(entry.result);
    if (entry.blocked) blocked = true;
  }

  return {
    status: blocked ? 'blocked' : 'ok',
    question_id: questionId || null,
    checked_at: now.toISOString(),
    checks: results
  };
}

function buildUnavailableMarkdownFromFreshnessGate(gate) {
  const checks = Array.isArray(gate?.checks) ? gate.checks : [];
  const lines = ['**UNAVAILABLE** — source freshness gate blocked this result.'];
  if (!checks.length) return lines.join('\n');
  checks.slice(0, 12).forEach((check) => {
    const view = check?.view ? `\`${check.view}\`` : '`(unknown)`';
    const latest = check?.latest_partition ? String(check.latest_partition).slice(0, 19) : 'N/A';
    const ageDays = typeof check?.age_seconds === 'number' ? Math.floor(check.age_seconds / 86400) : null;
    const maxDays = typeof check?.max_age_seconds === 'number' ? Math.floor(check.max_age_seconds / 86400) : null;
    const status = String(check?.status || 'unknown').toUpperCase();
    const ageText = ageDays !== null ? `${ageDays}d` : 'N/A';
    const maxText = maxDays !== null ? `${maxDays}d` : 'N/A';
    lines.push(`- ${view}: ${status} (latest ${latest}, age ${ageText}, SLA ${maxText}).`);
  });
  return lines.join('\n');
}

async function executeQueryCached(queryId, queryDef, params, ttlSeconds = INTERNAL_QUERY_CACHE_SECONDS) {
  if (!queryDef?.sql) {
    throw new Error(`queryDef missing sql for query: ${queryId || 'unknown'}`);
  }
  const signature = hashKey(String(queryDef.sql));
  const cacheSeed = `internal_query:${String(queryId || 'anon').toLowerCase()}:${stableStringify(params || {})}:${signature}`;
  const cacheKey = hashKey(cacheSeed);
  const cached = await getCache(cacheKey);
  if (cached && cached.expires_at > Math.floor(Date.now() / 1000) && cached.result) {
    return { ...cached.result, cached: true };
  }
  const result = await executeQuery(queryDef, params || {});
  await putCache(cacheKey, result, ttlSeconds);
  return { ...result, cached: false };
}

function evaluateCrossCheck(primaryValue, checkValue, tolerancePct = 0.05) {
  if (primaryValue === null || checkValue === null) {
    return { status: 'skipped', delta_pct: null };
  }
  if (primaryValue === 0 && checkValue === 0) return { status: 'match', delta_pct: 0 };
  const deltaPct = primaryValue !== 0 ? Math.abs(primaryValue - checkValue) / Math.abs(primaryValue) : null;
  if (deltaPct !== null && deltaPct <= tolerancePct) {
    return { status: 'match', delta_pct: deltaPct };
  }
  return { status: 'mismatch', delta_pct: deltaPct };
}

function computeConfidence(hasMismatch, hasFreshness, hasCrossCheck) {
  if (hasMismatch) return 'low';
  if (hasFreshness && hasCrossCheck) return 'high';
  return 'medium';
}

function normalizeCrossCheckTemplates(metricDef) {
  if (!metricDef) return [];
  let entries = metricDef.cross_checks || metricDef.cross_check_templates || metricDef.cross_check_query_ids || [];
  if (!Array.isArray(entries)) entries = entries ? [entries] : [];
  if (!entries.length && Array.isArray(metricDef.system_compare_query_ids)) {
    // If a metric only has system_compare templates, use those as the investigation cross-check set.
    entries = metricDef.system_compare_query_ids;
  }
  return entries
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        return { query_id: entry, value_column: null, label: null, tolerance_pct: null };
      }
      if (typeof entry === 'object') {
        return {
          query_id: entry.query_id || entry.template_key || entry.id || null,
          value_column: entry.value_column || null,
          label: entry.label || null,
          tolerance_pct: typeof entry.tolerance_pct === 'number' ? entry.tolerance_pct : null
        };
      }
      return null;
    })
    .filter((entry) => entry && entry.query_id);
}

function extractLatestNumericValue(columns, rows, preferredColumn) {
  if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length <= 1) return null;
  const dataRows = stripHeaderRow(columns, rows);
  if (!dataRows.length) return null;
  const row = dataRows[dataRows.length - 1];
  const idx = preferredColumn ? columns.findIndex((c) => c === preferredColumn) : -1;
  const parse = (raw) => {
    const num = raw !== null && raw !== undefined ? Number(String(raw).replace(/,/g, '')) : NaN;
    return Number.isNaN(num) ? null : num;
  };
  if (idx >= 0) {
    return parse(row[idx]);
  }
  for (let i = 0; i < row.length; i += 1) {
    const num = parse(row[i]);
    if (num !== null) return num;
  }
  return null;
}

async function runInvestigationLadder({
  metricKey,
  metricDef,
  questionId,
  primaryResult,
  viewsUsed,
  baseParams
}) {
  const primaryValue = extractLatestNumericValue(
    primaryResult?.columns || [],
    primaryResult?.rows || [],
    metricDef?.value_column || null
  );
  const rowCount = computeRowCount(primaryResult?.rows);

  // Freshness checks should only apply to sources actually touched by the executed SQL.
  // Metric semantic definitions may list broader "possible" sources; do not treat those as executed.
  const sources = Array.from(new Set(Array.isArray(viewsUsed) ? viewsUsed : []));

  const freshnessTasks = sources.map(async (view) => {
    const sourceMeta = getAllowedSource(view);
    if (!sourceMeta || !sourceMeta.time_column) return { view, status: 'skipped', latest_partition: null, row_count: null };
    try {
      const freshness = await runFreshnessCheckCached(view);
      return { view, ...freshness };
    } catch (err) {
      return { view, status: 'error', latest_partition: null, row_count: null, error: err.message || String(err) };
    }
  });
  const freshness = (await Promise.all(freshnessTasks)).filter(Boolean);

  const hasFreshnessOk = freshness.some((f) => f.status === 'ok');
  const emptySources = freshness.filter((f) => f.status === 'empty');

  const crossTemplates = normalizeCrossCheckTemplates(metricDef);
  const crossChecks = [];
  if (crossTemplates.length) {
    const crossTasks = crossTemplates.map(async (entry) => {
      const queryDef = REGISTRY[entry.query_id];
      if (!queryDef) {
        return { template_key: entry.query_id, label: entry.label || null, status: 'error', error: 'query_id not found in registry' };
      }
      const params = fillMissingParams(queryDef, baseParams || {});
      try {
        const checkResult = await executeQueryCached(entry.query_id, queryDef, params);
        const checkValue = extractLatestNumericValue(
          checkResult.columns || [],
          checkResult.rows || [],
          entry.value_column || metricDef?.value_column || null
        );
        const tolerancePct = entry.tolerance_pct ?? metricDef?.tolerance_pct ?? 0.05;
        const comparison = evaluateCrossCheck(primaryValue, checkValue, tolerancePct);
        return {
          template_key: entry.query_id,
          label: entry.label || null,
          value_column: entry.value_column || null,
          tolerance_pct: tolerancePct,
          query_execution_id: checkResult.query_execution_id,
          sql: checkResult.sql,
          value: checkValue,
          status: comparison.status,
          delta_pct: comparison.delta_pct,
          cached: Boolean(checkResult.cached)
        };
      } catch (err) {
        return {
          template_key: entry.query_id,
          label: entry.label || null,
          value_column: entry.value_column || null,
          status: 'error',
          error: err.message || String(err)
        };
      }
    });
    crossChecks.push(...(await Promise.all(crossTasks)));
  }

  const hasMismatch = crossChecks.some((c) => c.status === 'mismatch');
  const hasCrossCheck = crossChecks.some((c) => c.status === 'match' || c.status === 'mismatch');

  let sanity = null;
  try {
    sanity = await runSanityCheck(metricDef, { baseParams: baseParams || {} });
  } catch (err) {
    sanity = { status: 'error', delta_pct: null, error: err.message || String(err) };
  }

  const driverQueries = [];
  if (sanity && sanity.status === 'anomaly' && Array.isArray(metricDef?.driver_query_ids)) {
    for (const templateKey of metricDef.driver_query_ids) {
      const queryDef = REGISTRY[templateKey];
      if (!queryDef) continue;
      const params = fillMissingParams(queryDef, baseParams || {});
      try {
        const driverResult = await executeQueryCached(templateKey, queryDef, params, INTERNAL_QUERY_CACHE_SECONDS);
        driverQueries.push({
          template_key: templateKey,
          query_execution_id: driverResult.query_execution_id,
          sql: driverResult.sql
        });
      } catch (err) {
        driverQueries.push({ template_key: templateKey, error: err.message || String(err) });
      }
    }
  }

  const emptyUnavailable =
    rowCount === 0 ||
    emptySources.some((source) => {
      const meta = getAllowedSource(source.view);
      return meta?.empty_is_unavailable === true;
    });

  const confidence = computeConfidence(hasMismatch, hasFreshnessOk, hasCrossCheck);
  const status = hasMismatch ? 'inconclusive' : emptyUnavailable ? 'unavailable' : 'ok';

  return {
    status,
    metric_key: metricKey,
    question_id: questionId || null,
    primary_value: primaryValue,
    row_count: rowCount,
    sources,
    freshness,
    cross_checks: crossChecks,
    sanity_check: sanity,
    driver_queries: driverQueries,
    confidence,
    empty_unavailable: emptyUnavailable
  };
}

async function runSanityCheck(metricDef, { baseParams = {}, value_column: valueColumnOverride = null } = {}) {
  if (!metricDef?.sanity_query_id || !REGISTRY[metricDef.sanity_query_id]) return null;
  const sanityQueryId = metricDef.sanity_query_id;
  const sanityQuery = REGISTRY[sanityQueryId];

  const sanityMetricKey = resolveMetricKeyForQuestionId(sanityQueryId);
  const sanityMetricDef = sanityMetricKey ? getMetricDef(sanityMetricKey) : null;
  const preferredColumn =
    valueColumnOverride ||
    metricDef.sanity_value_column ||
    sanityMetricDef?.value_column ||
    metricDef.value_column ||
    null;

  const params = fillMissingParams(sanityQuery, baseParams || {});
  const result = await executeQuery(sanityQuery, params);

  const isTimeLike = (col) => {
    const name = String(col || '').toLowerCase();
    return ['period_month', 'dt', 'date', 'as_of_date', 'invoice_month', 'modeled_dt'].includes(name);
  };

  const findNumericColumnIndex = () => {
    if (!Array.isArray(result.columns) || !Array.isArray(result.rows) || result.rows.length <= 1) return -1;
    if (preferredColumn) {
      const idx = result.columns.findIndex((c) => c === preferredColumn);
      if (idx >= 0) return idx;
    }
    const candidates = result.columns
      .map((c, idx) => ({ name: String(c || ''), idx }))
      .filter((c) => c.name && !isTimeLike(c.name));
    const hasNumberAt = (idx) => {
      for (let i = 1; i < result.rows.length; i += 1) {
        const raw = result.rows[i]?.[idx];
        const num = raw !== null && raw !== undefined ? Number(String(raw).replace(/,/g, '')) : NaN;
        if (!Number.isNaN(num)) return true;
      }
      return false;
    };
    const preferredNameHints = ['mrr', 'revenue', 'value', 'total', 'count', 'customers', 'subscriptions'];
    for (const hint of preferredNameHints) {
      const match = candidates.find((c) => c.name.toLowerCase().includes(hint) && hasNumberAt(c.idx));
      if (match) return match.idx;
    }
    const fallback = candidates.find((c) => hasNumberAt(c.idx));
    return fallback ? fallback.idx : -1;
  };

  const colIndex = findNumericColumnIndex();
  const values = [];
  if (colIndex >= 0 && result.rows && result.rows.length > 1) {
    for (let i = 1; i < result.rows.length; i += 1) {
      const raw = result.rows[i]?.[colIndex];
      const num = raw !== null && raw !== undefined ? Number(String(raw).replace(/,/g, '')) : NaN;
      if (!Number.isNaN(num)) values.push(num);
    }
  }

  if (values.length < 2) {
    return {
      status: 'skipped',
      delta_pct: null,
      value_column: colIndex >= 0 ? result.columns[colIndex] : null,
      query_execution_id: result.query_execution_id,
      sql: result.sql
    };
  }

  const latest = values[values.length - 1];
  const prev = values[values.length - 2];
  const deltaPct = prev !== 0 ? (latest - prev) / Math.abs(prev) : null;
  const threshold = typeof metricDef.sanity_delta_threshold_pct === 'number'
    ? metricDef.sanity_delta_threshold_pct
    : 0.3;

  return {
    status: deltaPct !== null && Math.abs(deltaPct) > threshold ? 'anomaly' : 'ok',
    delta_pct: deltaPct,
    value_column: colIndex >= 0 ? result.columns[colIndex] : null,
    query_execution_id: result.query_execution_id,
    sql: result.sql
  };
}

async function executeGovernedPlan(questionText) {
  let planRaw = await generatePlanWithBedrock(questionText);
  let plan = normalizePlan(planRaw);
  let validation = validatePlan(plan);
  if (validation.errors.length) {
    planRaw = await generatePlanWithBedrock(questionText, validation.errors);
    plan = normalizePlan(planRaw);
    validation = validatePlan(plan);
    if (validation.errors.length) {
      return {
        status: 'invalid_plan',
        plan,
        errors: validation.errors
      };
    }
  }
  plan = applyPlanDefaults(plan, validation);

  if (plan.clarifying_question) {
    return {
      status: 'clarify',
      plan,
      clarifying_question: plan.clarifying_question
    };
  }

  const compiled = compilePlanToSql(plan, validation);
  const sql = ensureLimit(compiled.sql, plan.limits.rows || MAX_RESULT_ROWS);
  validateReadOnlySql(sql);
  validateSqlAllowlist(sql);
  validateSqlAgainstCatalog(sql);

  const primaryResult = compiled.query_id
    ? await executeQuery(REGISTRY[compiled.query_id], fillMissingParams(REGISTRY[compiled.query_id], {}))
    : await executeFreeformQuery(sql, {});

  const rowCount = computeRowCount(primaryResult.rows);
  const primaryValue = extractLatestNumericValue(primaryResult.columns, primaryResult.rows, compiled.value_column);
  const sourceView = (compiled.views_used && compiled.views_used[0]) || validation.sourceView;

  const freshnessViews = Array.from(new Set(
    Array.isArray(compiled.views_used) && compiled.views_used.length
      ? compiled.views_used
      : (sourceView ? [sourceView] : [])
  ));
  const freshnessTasks = freshnessViews.map(async (view) => {
    const sourceMeta = getAllowedSource(view);
    if (!sourceMeta || !sourceMeta.time_column) return { view, status: 'skipped', latest_partition: null, row_count: null };
    try {
      const freshness = await runFreshnessCheckCached(view);
      return { view, ...freshness };
    } catch (err) {
      return { view, status: 'error', latest_partition: null, row_count: null, error: err.message || String(err) };
    }
  });
  const freshness = (await Promise.all(freshnessTasks)).filter(Boolean);

  const crossChecks = [];
  const crossTemplates = [
    ...(Array.isArray(plan.cross_checks) ? plan.cross_checks : [])
      .map((c) => ({ query_id: c?.template_key || null, value_column: null, label: null, tolerance_pct: null }))
      .filter((c) => c.query_id),
    ...normalizeCrossCheckTemplates(validation.metricDef)
  ];
  const seenCross = new Set();
  const dedupedCross = crossTemplates.filter((entry) => {
    const key = String(entry.query_id || '').toLowerCase();
    if (!key || seenCross.has(key)) return false;
    seenCross.add(key);
    return true;
  });

  const crossTasks = dedupedCross.map(async (entry) => {
    const queryDef = REGISTRY[entry.query_id];
    if (!queryDef) {
      return { template_key: entry.query_id, label: entry.label || null, status: 'error', error: 'query_id not found in registry' };
    }
    try {
      const checkResult = await executeQueryCached(entry.query_id, queryDef, fillMissingParams(queryDef, {}));
      const checkValue = extractLatestNumericValue(
        checkResult.columns || [],
        checkResult.rows || [],
        entry.value_column || validation.metricDef?.value_column || null
      );
      const tolerancePct = entry.tolerance_pct ?? validation.metricDef?.tolerance_pct ?? 0.05;
      const comparison = evaluateCrossCheck(primaryValue, checkValue, tolerancePct);
      return {
        template_key: entry.query_id,
        label: entry.label || null,
        value_column: entry.value_column || null,
        tolerance_pct: tolerancePct,
        query_execution_id: checkResult.query_execution_id,
        sql: checkResult.sql,
        value: checkValue,
        status: comparison.status,
        delta_pct: comparison.delta_pct,
        cached: Boolean(checkResult.cached)
      };
    } catch (err) {
      return { template_key: entry.query_id, label: entry.label || null, status: 'error', error: err.message || String(err) };
    }
  });
  crossChecks.push(...(await Promise.all(crossTasks)));

  const sanity = await runSanityCheck(validation.metricDef, { baseParams: {} });
  const needsDriver = sanity && sanity.status === 'anomaly';
  const driverQueries = [];
  if (needsDriver && validation.metricDef?.driver_query_ids) {
    for (const templateKey of validation.metricDef.driver_query_ids) {
      const queryDef = REGISTRY[templateKey];
      if (!queryDef) continue;
      const driverResult = await executeQueryCached(templateKey, queryDef, fillMissingParams(queryDef, {}));
      driverQueries.push({
        template_key: templateKey,
        query_execution_id: driverResult.query_execution_id,
        sql: driverResult.sql
      });
    }
  }

  const hasMismatch = crossChecks.some((c) => c.status === 'mismatch');
  const hasCrossCheck = crossChecks.some((c) => c.status === 'match' || c.status === 'mismatch');
  const hasFreshness = freshness.some((f) => f.status === 'ok');
  const confidence = computeConfidence(hasMismatch, hasFreshness, hasCrossCheck);

  const emptyUnavailable =
    rowCount === 0 ||
    freshness.some((f) => {
      if (!f || f.status !== 'empty') return false;
      const meta = getAllowedSource(f.view);
      return meta?.empty_is_unavailable === true;
    });

  return {
    status: hasMismatch ? 'inconclusive' : emptyUnavailable ? 'unavailable' : 'ok',
    plan,
    compiled,
    primaryResult: { ...primaryResult, sql },
    row_count: rowCount,
    primary_value: primaryValue,
    freshness,
    cross_checks: crossChecks,
    sanity_check: sanity,
    driver_queries: driverQueries,
    confidence,
    empty_unavailable: emptyUnavailable
  };
}

let mondayConfigCache = null;

async function getMondayConfig() {
  if (mondayConfigCache) return mondayConfigCache;
  const secret = await secretsManager.getSecretValue({ SecretId: MONDAY_SECRET_ID }).promise();
  let secretString = secret.SecretString || '';
  let parsed = {};
  try {
    parsed = JSON.parse(secretString);
  } catch (_) {
    parsed = { token: secretString };
  }
  mondayConfigCache = {
    token: parsed.token || parsed.api_token || parsed.apiKey || parsed.key || secretString,
    pipeline_board_id: parsed.pipeline_board_id || parsed.pipelineBoardId || MONDAY_PIPELINE_BOARD_ID,
    webhook_secret: parsed.webhook_secret || parsed.webhookSecret || parsed.webhookSecretKey || MONDAY_WEBHOOK_SECRET
  };
  try {
    if (mondayConfigCache.token && mondayConfigCache.pipeline_board_id) {
      const columns = await getMondayBoardColumns(mondayConfigCache.pipeline_board_id, mondayConfigCache.token);
      mondayConfigCache.columns_by_title = buildColumnIdMapByTitle(columns);
    }
  } catch (_) {
    mondayConfigCache.columns_by_title = {};
  }
  return mondayConfigCache;
}

async function mondayGraphQL({ query, token }) {
  const resp = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token
    },
    body: JSON.stringify({ query })
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data || data.errors) {
    throw new Error(`Monday API error: ${JSON.stringify(data?.errors || data || resp.status)}`);
  }
  return data;
}

async function fetchMondayItem(boardId, itemId, token) {
  const query = `query { items(ids: [${itemId}]) { id name column_values { id text value column { title } } } }`;
  const data = await mondayGraphQL({ query, token });
  const item = data?.data?.items?.[0];
  return item || null;
}

function mapMondayItem(item, mapping) {
  if (!mapping || !item) return null;
  const columnValues = item.column_values || [];
  const byId = columnValues.reduce((acc, col) => {
    acc[col.id] = col;
    return acc;
  }, {});

  const result = {};
  const fieldMap = { ...(mapping.field_map || {}) };
  const columnsByTitle = mapping.columns_by_title || {};
  Object.entries(MONDAY_FIELD_TITLES).forEach(([field, title]) => {
    if (fieldMap[field]) return;
    const columnId = columnsByTitle[title.toLowerCase()];
    if (columnId) fieldMap[field] = columnId;
  });
  Object.entries(fieldMap).forEach(([field, columnId]) => {
    const col = byId[columnId];
    if (!col) return;
    if (col.text !== null && col.text !== undefined && String(col.text).trim() !== '') {
      result[field] = String(col.text).trim();
      return;
    }
    if (col.value) {
      try {
        const parsed = JSON.parse(col.value);
        if (parsed && typeof parsed === 'object') {
          if ('checked' in parsed) {
            result[field] = parsed.checked;
            return;
          }
          if ('date' in parsed) {
            result[field] = parsed.date;
            return;
          }
          if ('label' in parsed) {
            result[field] = parsed.label;
            return;
          }
          if ('text' in parsed) {
            result[field] = parsed.text;
            return;
          }
          if ('name' in parsed) {
            result[field] = parsed.name;
            return;
          }
        }
        result[field] = parsed;
      } catch (_) {
        result[field] = col.value;
      }
    } else {
      result[field] = '';
    }
  });

  result.project_id = result.project_id || `monday-${item.id}`;
  result.project_name = result.project_name || item.name || '';
  return result;
}

function asTruthy(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  const normalized = String(value).trim().toLowerCase();
  return ['true', 'yes', 'y', 'checked', '1', 'v', '✓'].includes(normalized);
}

function passesSyncFilter(mapped, mapping) {
  const filter = mapping?.sync_filter;
  if (!filter) return { ok: true };
  if (filter.module_type_value) {
    const desired = String(filter.module_type_value).trim().toLowerCase();
    const actual = String(mapped?.module_type || '').trim().toLowerCase();
    if (desired && actual !== desired) {
      return { ok: false, reason: `module_type mismatch (${mapped?.module_type || 'blank'})` };
    }
  }
  if (filter.sync_to_aws_required) {
    const allowed = asTruthy(mapped?.sync_to_aws);
    if (!allowed) {
      return { ok: false, reason: 'sync_to_aws not enabled' };
    }
  }
  return { ok: true };
}

function verifyMondaySignature(signature, rawBody, secret) {
  if (!signature || !rawBody || !secret) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
  } catch (_) {
    return false;
  }
}

async function writeS3Json(bucket, key, payload) {
  await s3
    .putObject({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: 'application/json'
    })
    .promise();
}

function streamToString(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf-8');
  return new Promise((resolve, reject) => {
    const chunks = [];
    body.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    body.on('error', reject);
    body.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

async function readS3Text(bucket, key) {
  const res = await s3.getObject({ Bucket: bucket, Key: key }).promise();
  return streamToString(res.Body);
}

async function listS3Objects(bucket, prefix, maxKeys = 1000) {
  const res = await s3.listObjectsV2({ Bucket: bucket, Prefix: prefix, MaxKeys: maxKeys }).promise();
  return res.Contents || [];
}

async function deleteS3Object(bucket, key) {
  await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
}

function escapeCsvValue(val) {
  const str = val === null || val === undefined ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateMonthlyCSV(monthly) {
  if (!monthly || monthly.length === 0) return '';
  const headers = Object.keys(monthly[0]).join(',');
  const rows = monthly.map((row) => Object.values(row).join(','));
  return `${headers}\n${rows.join('\n')}`;
}

function generateMetricsCSV(metrics) {
  const headers = 'metric,value';
  const rows = Object.entries(metrics || {}).map(([key, value]) => `${key},${value}`);
  return `${headers}\n${rows.join('\n')}`;
}

function generateScenarioMetricsCSV(scenarios) {
  const rows = Array.isArray(scenarios) ? scenarios : [];
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  return rowsToCSV(columns, rows);
}

function buildPipelineWorkbook({ summary, monthly, scenarios, scenarioDetails }) {
  const wb = XLSX.utils.book_new();

  const summaryRows = Object.entries(summary || {}).map(([key, value]) => [key, value]);
  const summarySheet = XLSX.utils.aoa_to_sheet([['metric', 'value'], ...summaryRows]);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  if (Array.isArray(monthly) && monthly.length > 0) {
    const monthlyColumns = Object.keys(monthly[0]);
    const monthlyRows = monthly.map((row) => monthlyColumns.map((col) => row[col]));
    const monthlySheet = XLSX.utils.aoa_to_sheet([monthlyColumns, ...monthlyRows]);
    XLSX.utils.book_append_sheet(wb, monthlySheet, 'Monthly');
  }

  if (Array.isArray(scenarios) && scenarios.length > 0) {
    const scenarioColumns = Object.keys(scenarios[0]);
    const scenarioRows = scenarios.map((row) => scenarioColumns.map((col) => row[col]));
    const scenarioSheet = XLSX.utils.aoa_to_sheet([scenarioColumns, ...scenarioRows]);
    XLSX.utils.book_append_sheet(wb, scenarioSheet, 'Scenarios');
  }

  if (Array.isArray(scenarioDetails) && scenarioDetails.length > 0) {
    const rows = scenarioDetails.map((detail) => {
      const row = {
        project_id: detail.project_id || null,
        scenario_id: detail.scenario_id || null,
        scenario_name: detail.scenario_name || null
      };
      if (detail.inputs) {
        Object.entries(detail.inputs).forEach(([key, value]) => {
          row[`input_${key}`] = value;
        });
      }
      if (detail.metrics) {
        Object.entries(detail.metrics).forEach(([key, value]) => {
          row[`metric_${key}`] = value;
        });
      }
      return row;
    });
    const columns = Object.keys(rows[0] || {});
    const detailRows = rows.map((row) => columns.map((col) => row[col]));
    const detailSheet = XLSX.utils.aoa_to_sheet([columns, ...detailRows]);
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Scenario Inputs');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function rowsToCSV(columns, rows) {
  if (!columns || !rows) return '';
  const header = columns.map(escapeCsvValue).join(',');
  const dataLines = rows.map((row) => {
    const values = Array.isArray(row) ? row : Object.values(row || {});
    return values.map(escapeCsvValue).join(',');
  });
  return [header, ...dataLines].join('\n');
}

function rowsToWorkbook(columns, rows, sheetName = 'Report') {
  const wb = XLSX.utils.book_new();
  const cleanColumns = Array.isArray(columns) ? columns : [];
  const cleanRows = Array.isArray(rows) ? rows : [];
  const dataRows = cleanRows.map((row) => (Array.isArray(row) ? row : Object.values(row || {})));
  const sheet = XLSX.utils.aoa_to_sheet([cleanColumns, ...dataRows]);
  XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function sanitizeReportName(name) {
  return String(name || 'report')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'report';
}

function buildAgentSteps(planResult, answerMarkdown) {
  if (!planResult) return [];
  const steps = [];
  const planStatus = planResult.status || 'unknown';
  steps.push({
    step: 'PLAN',
    status: planStatus === 'invalid_plan' ? 'failed' : 'ok',
    details: planResult.plan || null,
    errors: planResult.errors || null
  });
  steps.push({
    step: 'VALIDATE',
    status: (planResult.errors && planResult.errors.length) ? 'failed' : 'ok',
    errors: planResult.errors || null
  });
  steps.push({
    step: 'RUN',
    status: planResult.primaryResult?.query_execution_id ? 'ok' : 'failed',
    query_execution_id: planResult.primaryResult?.query_execution_id || null
  });
  steps.push({
    step: 'VERIFY',
    status: planResult.status === 'inconclusive' ? 'mismatch' : (planResult.status === 'unavailable' ? 'unavailable' : 'ok'),
    freshness: planResult.freshness || null,
    cross_checks: planResult.cross_checks || null,
    sanity_check: planResult.sanity_check || null
  });
  steps.push({
    step: 'ANSWER',
    status: answerMarkdown ? 'ok' : 'empty',
    summary: answerMarkdown || null
  });
  return steps;
}

function buildDeterministicAgentSteps({ questionId, metricKey, ladder, result, answerMarkdown }) {
  const steps = [];
  steps.push({
    step: 'PLAN',
    status: 'ok',
    details: {
      route: 'deterministic',
      question_id: questionId || null,
      metric_key: metricKey || null
    }
  });
  steps.push({
    step: 'RUN',
    status: result?.query_execution_id ? 'ok' : 'failed',
    query_execution_id: result?.query_execution_id || null
  });
  if (ladder) {
    steps.push({
      step: 'VERIFY',
      status: ladder.status === 'inconclusive'
        ? 'mismatch'
        : (ladder.status === 'unavailable' ? 'unavailable' : 'ok'),
      freshness: ladder.freshness || null,
      cross_checks: ladder.cross_checks || null,
      sanity_check: ladder.sanity_check || null,
      driver_queries: ladder.driver_queries || null,
      confidence: ladder.confidence || null
    });
  } else {
    steps.push({
      step: 'VERIFY',
      status: 'skipped',
      confidence: 'medium'
    });
  }
  steps.push({
    step: 'ANSWER',
    status: answerMarkdown ? 'ok' : 'empty',
    summary: answerMarkdown || null
  });
  return steps;
}

async function writeAgentArtifacts({ caseId, questionText, planResult, payloadOut }) {
  if (!CASE_RUNTIME_ENABLED) return null;
  if (!caseId) return null;
  const prefix = `${AGENT_ARTIFACTS_PREFIX}${caseId}/`;
  const artifact = {
    case_id: caseId,
    question: questionText || null,
    plan: planResult?.plan || null,
    plan_status: planResult?.status || null,
    compiled: {
      sql: planResult?.primaryResult?.sql || payloadOut?.generated_sql || null,
      views_used: planResult?.compiled?.views_used || payloadOut?.views_used || []
    },
    evidence_pack: payloadOut?.evidence_pack || null,
    answer_markdown: payloadOut?.answer_markdown || null,
    created_at: new Date().toISOString()
  };
  const key = `${prefix}agent_result.json`;
  try {
    await writeS3Json(AGENT_ARTIFACTS_BUCKET, key, artifact);
    return { bucket: AGENT_ARTIFACTS_BUCKET, key };
  } catch (_) {
    return null;
  }
}

async function runCrossSystemVerification(caseRecord) {
  if (!VERIFY_ACTION_ENABLED) {
    return { status: 'unavailable', message: 'Verification disabled.' };
  }
  if (!caseRecord) return { status: 'unavailable', message: 'Case not found.' };
  const metricKey = caseRecord.metric_key || caseRecord.question_id || null;
  if (!metricKey) {
    return { status: 'unavailable', message: 'No metric key available for verification.' };
  }
  const metricDef = getMetricDef(metricKey) || {};
  let templateEntries = metricDef.system_compare_query_ids || metricDef.cross_check_query_ids || [];
  if (!Array.isArray(templateEntries)) {
    templateEntries = templateEntries ? [templateEntries] : [];
  }
  let fallbackNote = null;
  if (!templateEntries.length && metricDef.query_id) {
    templateEntries = [{ query_id: metricDef.query_id, value_column: metricDef.value_column }];
    fallbackNote = 'No cross-system templates configured; returning primary SSOT query only.';
  }
  if (!templateEntries.length) {
    return { status: 'unavailable', message: 'No cross-system templates configured for this metric.' };
  }
  const normalizeTemplate = (entry) => {
    if (!entry) return null;
    if (typeof entry === 'string') {
      return { query_id: entry, value_column: metricDef.value_column, label: null };
    }
    if (typeof entry === 'object') {
      return {
        query_id: entry.query_id || entry.template_key || entry.id || null,
        value_column: entry.value_column || metricDef.value_column,
        label: entry.label || null
      };
    }
    return null;
  };
  const comparisons = [];
  const baseParams = (caseRecord && typeof caseRecord === 'object')
    ? (caseRecord.request_params || caseRecord.params || {})
    : {};
  const buildDefaultParams = (queryDef) => {
    const params = {};
    (queryDef?.params || []).forEach((p) => {
      const value = Object.prototype.hasOwnProperty.call(baseParams, p) ? baseParams[p] : '';
      params[p] = value === null || value === undefined ? '' : value;
    });
    return params;
  };
  for (const templateEntry of templateEntries) {
    const normalized = normalizeTemplate(templateEntry);
    if (!normalized || !normalized.query_id) continue;
    const queryDef = REGISTRY[normalized.query_id];
    if (!queryDef) continue;
    try {
      const result = await executeQuery(queryDef, buildDefaultParams(queryDef));
      const value = extractNumericValue(result.columns, result.rows, normalized.value_column);
      comparisons.push({
        template_key: normalized.query_id,
        label: normalized.label || null,
        value_column: normalized.value_column || null,
        query_execution_id: result.query_execution_id,
        value,
        sql: result.sql
      });
    } catch (err) {
      comparisons.push({
        template_key: normalized.query_id,
        label: normalized.label || null,
        value_column: normalized.value_column || null,
        error: err.message || String(err)
      });
    }
  }

  const nativeAdapters = [];
  let nativeStatus = 'skipped';
  let nativeMessage = null;
  if (NATIVE_VERIFY_ENABLED) {
    nativeStatus = 'blocked';
    // Native adapters are not implemented in this lambda yet; keep the Athena-based comparisons
    // but clearly mark what is missing to complete true cross-system verification.
    const missing = ['Salesforce', 'Intacct', 'Gaiia', 'Platt', 'Vetro'];
    nativeAdapters.push(...missing.map((name) => ({
      adapter: name.toLowerCase(),
      status: 'blocked',
      reason: 'native_adapter_not_configured'
    })));
    nativeMessage = `BLOCKED: missing native adapters (${missing.join(', ')}). NEXT STEP: enable the required native adapter(s) (read-only) and provide credentials via Secrets Manager.`;
  }

  return {
    status: NATIVE_VERIFY_ENABLED ? nativeStatus : (comparisons.length ? 'ok' : 'unavailable'),
    metric_key: metricKey,
    comparisons,
    note: fallbackNote,
    native_status: nativeStatus,
    native_adapters: nativeAdapters,
    message: nativeMessage
  };
}

function stripHeaderRow(columns, rows) {
  if (!columns || !rows || rows.length === 0) return rows || [];
  const first = rows[0];
  if (!Array.isArray(first) || first.length !== columns.length) return rows;
  const isHeader = first.every((value, idx) => {
    const col = columns[idx];
    if (value === null || value === undefined) return false;
    return String(value).trim().toLowerCase() === String(col).trim().toLowerCase();
  });
  return isHeader ? rows.slice(1) : rows;
}

function extractRecord(columns, rows) {
  if (!columns || !rows || rows.length === 0) return null;
  const dataRows = stripHeaderRow(columns, rows);
  if (!dataRows.length) return null;
  const first = dataRows[0];
  const record = {};
  columns.forEach((col, idx) => {
    record[col] = Array.isArray(first) ? first[idx] : first[col];
  });
  return record;
}

function formatCurrency(value, decimals = 0) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: decimals });
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString('en-US');
}

function formatVerificationValue(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'number') return formatNumber(value);
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return formatNumber(numeric);
  return String(value);
}

function formatVerificationMarkdown(verification) {
  if (!verification) return null;
  if (verification.status === 'unavailable') {
    return [
      '**Cross-System Verification**',
      verification.message ? `- ${verification.message}` : '- No cross-system templates configured for this metric.'
    ].join('\n');
  }
  const comparisons = Array.isArray(verification.comparisons) ? verification.comparisons : [];
  if (!comparisons.length) {
    return '**Cross-System Verification**\n- No comparison results returned.';
  }
  const lines = ['**Cross-System Verification**'];
  if (verification.note) {
    lines.push(`- ${verification.note}`);
  }
  comparisons.forEach((comparison) => {
    const label = comparison.label || comparison.template_key || 'comparison';
    const columnNote = comparison.value_column ? ` (${comparison.value_column})` : '';
    if (comparison.error) {
      lines.push(`- ${label}${columnNote}: ERROR (${comparison.error})`);
    } else {
      lines.push(`- ${label}${columnNote}: ${formatVerificationValue(comparison.value)}`);
    }
  });
  return lines.join('\n');
}

function stripMarkdown(text) {
  if (!text) return '';
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/[*_>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildContextualQuestion(questionText, context) {
  if (!context || !questionText) return questionText;
  const contextQuestion = context.question ? String(context.question).slice(0, 400) : '';
  const contextAnswerRaw = context.answer_markdown ? String(context.answer_markdown) : '';
  const contextAnswer = stripMarkdown(contextAnswerRaw).slice(0, 600);
  const lines = [];
  if (contextQuestion) lines.push(`Previous question: ${contextQuestion}`);
  if (contextAnswer) lines.push(`Previous answer: ${contextAnswer}`);
  if (!lines.length) return questionText;
  return `Context:\n${lines.join('\n')}\n\nFollow-up: ${questionText}`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectExplainFollowupIntent(questionText) {
  const normalized = normalizeQuestionText(questionText);
  if (!normalized) return false;
  const terms = [
    'where does',
    'where did',
    "what's the source",
    'what is the source',
    'source',
    'sources',
    'provenance',
    'lineage',
    'tell me about',
    'tell me more',
    'what does it mean',
    'what does that mean',
    'what does this mean',
    'what does',
    'explain this',
    'explain that',
    'explain',
    'interpret',
    'clarify',
    'break down',
    'help me understand',
    'why is',
    'why are',
    'why does',
    'what view',
    'what views',
    'which view',
    'which views',
    'what table',
    'which table',
    'what query',
    'show sql',
    'show the sql',
    'generated sql',
    'how did you get',
    'how did you calculate',
    'how is this calculated',
    'methodology',
    'calculation method',
    'evidence pack',
    'show evidence'
  ];
  return terms.some((term) => normalized.includes(term));
}

function detectVerifyFollowupIntent(questionText) {
  const normalized = normalizeQuestionText(questionText);
  if (!normalized) return false;
  if (!detectInvestigationIntent(normalized)) return false;

  // Don't steal normal "new question" routing that happens to include investigation terms.
  const questionTerms = [
    'how many',
    'what is',
    'what are',
    'show',
    'list',
    'give me',
    'which',
    'who',
    'where',
    'when'
  ];
  if (questionTerms.some((term) => normalized.includes(term))) return false;

  return true;
}

function extractFirstNumberFromText(text) {
  if (!text) return null;
  const match = String(text).match(/(-?\d[\d,]*\.?\d*)/);
  if (!match) return null;
  const raw = match[1].replace(/,/g, '');
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function normalizeComparableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).replace(/,/g, '').trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function findColumnForNumber(columns, row, targetNumber) {
  if (!Array.isArray(columns) || !Array.isArray(row) || targetNumber === null || targetNumber === undefined) return null;
  const target = Number(targetNumber);
  if (!Number.isFinite(target)) return null;
  for (let idx = 0; idx < columns.length; idx += 1) {
    const value = normalizeComparableNumber(row[idx]);
    if (value === null) continue;
    if (Math.abs(value - target) < 1e-9) {
      return { column: columns[idx], value: row[idx] };
    }
  }
  return null;
}

function findAliasDerivationFromSql(sql, alias) {
  if (!sql || !alias) return null;
  const escaped = escapeRegExp(alias);
  const asRe = new RegExp(`\\bAS\\s+${escaped}\\b`, 'i');
  const match = asRe.exec(sql);
  if (!match) return null;

  const before = sql.slice(0, match.index);
  const window = before.slice(Math.max(0, before.length - 260));
  const lastNewline = window.lastIndexOf('\n');
  let expression = lastNewline >= 0 ? window.slice(lastNewline + 1) : window;
  expression = expression.trim().replace(/^,/, '').trim();

  const after = sql.slice(match.index, Math.min(sql.length, match.index + 900));
  const fromMatch = /\\bFROM\\s+([\\w.]+)/i.exec(after);
  const fromView = fromMatch ? fromMatch[1] : null;

  const whereMatch = /\\bWHERE\\b([\\s\\S]{0,420})/i.exec(after);
  let whereSnippet = whereMatch ? whereMatch[1] : null;
  if (whereSnippet) {
    const cutoffIdx = whereSnippet.search(/\bGROUP\s+BY\b|\bORDER\s+BY\b|\bLIMIT\b|\)\s*[,)]/i);
    if (cutoffIdx >= 0) {
      whereSnippet = whereSnippet.slice(0, cutoffIdx);
    }
    whereSnippet = whereSnippet.replace(/\s+/g, ' ').trim();
  }

  return { expression: expression || null, fromView, whereSnippet };
}

function formatViewsInline(views) {
  const list = (Array.isArray(views) ? views : []).filter(Boolean);
  if (!list.length) return 'N/A';
  return list.map((v) => `\`${v}\``).join(', ');
}

function buildExplainFollowupMarkdown({
  questionText,
  parentQuestionId,
  metricKey,
  metricDef,
  columns,
  row,
  viewsUsed,
  queryExecutionId,
  sql,
  targetNumber,
  matchedColumn,
  derivation,
  periodValue
}) {
  const lines = [];
  lines.push('**Answer Provenance (follow-up)**');
  if (metricKey) {
    const desc = metricDef?.description ? ` — ${String(metricDef.description).replace(/[.]+$/, '')}` : '';
    lines.push(`- Metric: \`${metricKey}\`${desc}.`);
  }
  if (parentQuestionId) {
    lines.push(`- Deterministic template: \`${parentQuestionId}\`.`);
  }
  if (queryExecutionId) {
    lines.push(`- Athena QueryExecutionId: \`${queryExecutionId}\`.`);
  }
  if (viewsUsed && viewsUsed.length) {
    lines.push(`- Athena sources: ${formatViewsInline(viewsUsed)}.`);
  }
  if (periodValue) {
    lines.push(`- Snapshot period: ${String(periodValue).slice(0, 10)}.`);
  }

  if (targetNumber !== null && targetNumber !== undefined) {
    const formattedTarget = Number(targetNumber).toLocaleString('en-US');
    if (matchedColumn) {
      lines.push(`- The value **${formattedTarget}** is returned in column \`${matchedColumn}\`.`);
      if (derivation?.expression || derivation?.fromView) {
        const expr = derivation.expression ? `\`${derivation.expression}\`` : '`(see SQL)`';
        const from = derivation.fromView ? ` from \`${derivation.fromView}\`` : '';
        lines.push(`- \`${matchedColumn}\` is computed as ${expr}${from}.`);
      } else {
        lines.push(`- \`${matchedColumn}\` derivation is visible in the Evidence SQL for \`${parentQuestionId}\`.`);
      }
    } else {
      lines.push(`- I could not map **${formattedTarget}** to a specific output column automatically. Check the Results table + Evidence SQL.`);
    }
  } else if (Array.isArray(columns) && Array.isArray(row) && columns.length && row.length) {
    lines.push('- Output (first row):');
    columns.forEach((col, idx) => {
      const val = row[idx];
      const display = val === null || val === undefined ? 'N/A' : String(val);
      lines.push(`  - \`${col}\`: ${display}`);
    });
  }

  if (detectInvestigationIntent(questionText)) {
    lines.push('');
    lines.push('_If you meant “verify across systems,” use the **Verify** button so the system runs cross-check templates and returns a reconciliation._');
  } else {
    lines.push('');
    lines.push('_Tip: ask “verify across systems” or click **Verify** to reconcile this metric across templates._');
  }

  if (sql && String(sql).trim()) {
    lines.push('');
    lines.push('SQL + Evidence are available in the Evidence drawer below.');
  }

  return lines.join('\n');
}

async function maybeHandleFollowupExplain({ event, questionText, context }) {
  if (!context || !questionText) return null;
  if (!detectExplainFollowupIntent(questionText)) return null;

  const parentCaseId = context.case_id || context.caseId || context.parent_case_id || context.parentCaseId || null;
  const parentCase = parentCaseId ? await loadCaseRecord(parentCaseId) : null;
  const parentQuestionId = parentCase?.question_id || context.question_id || context.questionId || null;
  const metricKeyFromContext = context.metric_key || context.metricKey || null;
  if (!parentQuestionId && !metricKeyFromContext) return null;

  const queryDef = REGISTRY[parentQuestionId] || null;
  const metricKey =
    parentCase?.metric_key ||
    metricKeyFromContext ||
    resolveMetricKeyForQuestionId(parentQuestionId) ||
    parentQuestionId;
  const metricDef = getMetricDef(metricKey) || null;
  const parentEvidence = parentCase?.evidence_pack || null;
  const sql = parentCase?.generated_sql || queryDef?.sql || null;

  const viewsUsed = Array.from(new Set([
    ...(Array.isArray(parentCase?.views_used) ? parentCase.views_used : []),
    ...(Array.isArray(queryDef?.views_used) ? queryDef.views_used : []),
    ...(Array.isArray(metricDef?.source_views) ? metricDef.source_views : [])
  ]));

  const columns = Array.isArray(parentCase?.columns) ? parentCase.columns : [];
  const rowsPreview = Array.isArray(parentCase?.rows_preview) ? parentCase.rows_preview : [];
  const dataRows = stripHeaderRow(columns, rowsPreview);
  const row = dataRows.length ? dataRows[0] : (rowsPreview.length ? rowsPreview[0] : null);

  const periodIdx = columns.indexOf('period_month');
  const periodValue = periodIdx >= 0 && Array.isArray(row) ? row[periodIdx] : null;

  const targetNumber = extractFirstNumberFromText(questionText);
  const match = targetNumber !== null && Array.isArray(row) ? findColumnForNumber(columns, row, targetNumber) : null;
  const matchedColumn = match ? match.column : null;
  const requestParams = (parentCase && typeof parentCase === 'object')
    ? (parentCase.request_params || parentCase.params || {})
    : {};

  const summarizeColumnToEvidenceKey = (col) => {
    if (!col) return null;
    if (col.startsWith('ssot_')) return 'secondary';
    if (col.startsWith('network_')) return 'network';
    if (col.startsWith('harness_')) return 'harness';
    if (col.startsWith('billing_')) return null;
    return null;
  };

  const evidenceKey = summarizeColumnToEvidenceKey(matchedColumn);
  const evidenceOverride = evidenceKey && parentEvidence && typeof parentEvidence === 'object'
    ? parentEvidence[evidenceKey]
    : null;

  const sqlForExplain = evidenceOverride?.executed_sql || sql;
  const qidForExplain = evidenceOverride?.query_execution_id || parentCase?.query_execution_id || null;
  const viewsForExplain = Array.from(new Set([
    ...(Array.isArray(evidenceOverride?.sources) ? evidenceOverride.sources : []),
    ...viewsUsed
  ]));

  const mapSummaryToSqlAlias = (col) => {
    const mapping = {
      ssot_total_customers: 'total_customers',
      ssot_active_customers: 'active_customers',
      ssot_inactive_customers: 'inactive_customers',
      billing_plat_id_count: 'plat_id_count',
      billing_invoice_month: 'invoice_month',
      network_billed_customers: 'billed_customers',
      network_billed_mrr: 'billed_mrr',
      harness_plat_id_count: 'plat_id_count',
      harness_as_of_date: 'as_of_date'
    };
    return mapping[col] || col;
  };

  const derivationAlias = matchedColumn ? mapSummaryToSqlAlias(matchedColumn) : null;
  const derivation = derivationAlias ? findAliasDerivationFromSql(sqlForExplain, derivationAlias) : null;

  const answerMarkdown = buildExplainFollowupMarkdown({
    questionText,
    parentQuestionId,
    metricKey,
    metricDef,
    columns,
    row,
    viewsUsed: viewsForExplain,
    queryExecutionId: qidForExplain,
    sql: sqlForExplain,
    targetNumber,
    matchedColumn,
    derivation,
    periodValue
  });

  const matchedColLower = String(matchedColumn || '').toLowerCase();
  const wantsMeaning = /what does|what do|mean|tell me about|explain|clarify|interpret/i.test(questionText || '');
  const cityValue = requestParams.city || (columns.includes('city') && Array.isArray(row) ? row[columns.indexOf('city')] : null);
  const meaningLines = [];
  if (wantsMeaning && metricKey === 'customers_in_city' && (matchedColLower.startsWith('ssot_') || /ssot|city totals|active|inactive/i.test(questionText || ''))) {
    const cityLabel = cityValue ? String(cityValue) : 'the requested city';
    meaningLines.push('**What “SSOT city totals” means**');
    meaningLines.push(`- These counts come from \`curated_core.platt_customer_current_ssot\` filtered to \`${cityLabel}\` using \`city\` OR \`gwi_lq_city\`.`);
    meaningLines.push('- “Total” is distinct SSOT identities; “Active/Inactive” uses the SSOT `active` flag (not billed MRR).');
    meaningLines.push('- This is intentionally different from “Billing PLAT ID COUNT”, which counts customers with MRR > 0 from `curated_core.v_monthly_mrr_platt` mapped to a `gwi_system`.');
  }

  const answerMarkdownFinal = [answerMarkdown, meaningLines.length ? meaningLines.join('\n') : null].filter(Boolean).join('\n\n');

  const evidencePack = parentCase?.evidence_pack
    ? { ...parentCase.evidence_pack, parent_case_id: parentCaseId || null }
    : (sql
        ? {
            executed_sql: sql,
            query_execution_id: qidForExplain,
            sources: viewsForExplain,
            row_count: parentCase?.row_count || 0,
            validations: { read_only: true, allowlist: true },
            confidence: 'high',
            parent_case_id: parentCaseId || null
          }
        : null);

  const payloadOut = {
    sql: sqlForExplain,
    generated_sql: sqlForExplain,
    query_execution_id: qidForExplain,
    columns,
    rows: rowsPreview,
    truncated: false,
    max_rows: parentCase?.row_count || null,
    views_used: viewsForExplain,
    metric_key: metricKey,
    request_params: requestParams,
    answer_markdown: answerMarkdownFinal,
    evidence_pack: evidencePack
  };

  const caseId = generateCaseId();
  await writeCaseRecord(buildCaseRecord({
    caseId,
    event,
    questionText,
    questionId: parentQuestionId,
    payloadOut,
    parentCaseId
  }));

  return {
    ok: true,
    cached: false,
    stale: false,
    question_id: parentQuestionId,
    views_used: viewsUsed,
    ...payloadOut,
    last_success_ts: Math.floor(Date.now() / 1000),
    case_id: caseId,
    actions_available: buildCaseActions(payloadOut)
  };
}

function extractCityFromQuestion(text) {
  const raw = String(text || '');
  const match = raw.match(/\bin\s+([A-Za-z][A-Za-z\s'-]+)/i);
  if (!match || !match[1]) return null;
  return cleanCity(match[1]);
}

async function maybeHandleFollowupVerify({ event, questionText, context }) {
  if (!context || !questionText) return null;
  if (!detectVerifyFollowupIntent(questionText)) return null;

  const parentCaseId = context.case_id || context.caseId || context.parent_case_id || context.parentCaseId || null;
  const parentCase = parentCaseId ? await loadCaseRecord(parentCaseId) : null;
  const parentQuestionId = parentCase?.question_id || context.question_id || context.questionId || null;
  if (!parentQuestionId) return null;

  const metricKey = parentCase?.metric_key || context.metric_key || context.metricKey || resolveMetricKeyForQuestionId(parentQuestionId) || parentQuestionId;
  const requestParams = { ...(parentCase?.request_params || {}) };

  if (!requestParams.city) {
    const cityCandidate = extractCityFromQuestion(parentCase?.question_original || context.question || '');
    if (cityCandidate) requestParams.city = cityCandidate;
  }
  if (!requestParams.network && parentCase?.evidence_pack?.system_match?.network) {
    requestParams.network = parentCase.evidence_pack.system_match.network;
  }
  if (!requestParams.gwi_system && parentCase?.evidence_pack?.system_match?.gwi_system) {
    requestParams.gwi_system = parentCase.evidence_pack.system_match.gwi_system;
  }

  const verificationCase = {
    ...(parentCase || {}),
    metric_key: metricKey,
    question_id: parentQuestionId,
    request_params: requestParams
  };

  const verification = await runCrossSystemVerification(verificationCase);
  const verificationMarkdown = formatVerificationMarkdown(verification);
  const baseAnswer = parentCase?.answer_markdown || context.answer_markdown || null;
  const answerMarkdown = [baseAnswer, verificationMarkdown].filter(Boolean).join('\n\n');

  const viewsUsed = Array.from(new Set([
    ...(Array.isArray(parentCase?.views_used) ? parentCase.views_used : []),
    ...(Array.isArray(parentCase?.evidence_pack?.sources) ? parentCase.evidence_pack.sources : [])
  ]));

  const payloadOut = {
    sql: parentCase?.generated_sql || null,
    generated_sql: parentCase?.generated_sql || null,
    query_execution_id: parentCase?.query_execution_id || null,
    columns: Array.isArray(parentCase?.columns) ? parentCase.columns : [],
    rows: Array.isArray(parentCase?.rows_preview) ? parentCase.rows_preview : [],
    truncated: false,
    max_rows: parentCase?.row_count || null,
    views_used: viewsUsed,
    metric_key: metricKey,
    request_params: requestParams,
    verification,
    answer_markdown: answerMarkdown || verificationMarkdown || null,
    evidence_pack: parentCase?.evidence_pack || null
  };

  const caseId = generateCaseId();
  await writeCaseRecord(buildCaseRecord({
    caseId,
    event,
    questionText,
    questionId: parentQuestionId,
    payloadOut,
    parentCaseId
  }));

  return {
    ok: true,
    cached: false,
    stale: false,
    question_id: parentQuestionId,
    views_used: viewsUsed,
    ...payloadOut,
    last_success_ts: Math.floor(Date.now() / 1000),
    case_id: caseId,
    actions_available: buildCaseActions(payloadOut)
  };
}

async function maybeAttachVerification({ payloadOut, questionId, wantsInvestigation }) {
  if (!VERIFY_ACTION_ENABLED) return payloadOut;
  const metricKey = payloadOut?.metric_key || resolveMetricKeyForQuestionId(questionId) || questionId;
  const metricDef = getMetricDef(metricKey) || {};
  const autoVerifyAllowed = metricDef.auto_verify !== false;
  const shouldVerify = Boolean(wantsInvestigation) || (AUTO_VERIFY_ALL && autoVerifyAllowed);
  if (!shouldVerify || !payloadOut) return payloadOut;
  const verification = await runCrossSystemVerification({
    metric_key: metricKey,
    question_id: questionId || metricKey,
    request_params: payloadOut.request_params || null
  });
  const verificationMarkdown = formatVerificationMarkdown(verification);
  const answerMarkdown = [payloadOut.answer_markdown, verificationMarkdown].filter(Boolean).join('\n\n');
  return {
    ...payloadOut,
    metric_key: metricKey,
    verification,
    answer_markdown: answerMarkdown || payloadOut.answer_markdown
  };
}

function formatMonth(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const text = String(value);
  return text.length >= 7 ? text.slice(0, 7) : text;
}

function parseDateValue(value) {
  if (!value) return null;
  const text = String(value).replace('T', ' ').trim();
  const match = text.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
}

function diffDays(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const ms = toDate.getTime() - fromDate.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function classifyGuard({ rowCount, exceptionCount, latestDt, warnPct, failPct, staleDaysThreshold }) {
  const safeRowCount = Number(rowCount || 0);
  const safeExceptions = Number(exceptionCount || 0);
  const ratio = safeRowCount > 0 ? safeExceptions / safeRowCount : 0;
  const warnThreshold = typeof warnPct === 'number' && warnPct > 0 ? warnPct : null;
  const failThreshold = typeof failPct === 'number' && failPct > 0 ? failPct : null;
  const status = {
    guard_status: 'ok',
    guard_ok: true,
    exception_ratio: ratio,
    stale_days: null
  };
  if (safeRowCount <= 0) {
    return { ...status, guard_status: 'fail', guard_ok: false };
  }
  if (latestDt && staleDaysThreshold) {
    const days = diffDays(parseDateValue(latestDt), new Date());
    status.stale_days = days;
    if (days !== null && days > staleDaysThreshold) {
      status.guard_status = 'warn';
      status.guard_ok = false;
    }
  }
  if (failThreshold !== null && ratio >= failThreshold) {
    status.guard_status = 'fail';
    status.guard_ok = false;
  } else if (warnThreshold !== null && ratio >= warnThreshold) {
    status.guard_status = 'warn';
    status.guard_ok = false;
  }
  return status;
}

async function loadGuardStatusFromS3() {
  try {
    const text = await readS3Text(GUARD_STATUS_BUCKET, GUARD_STATUS_KEY);
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

async function saveGuardStatusToS3(payload) {
  await writeS3Json(GUARD_STATUS_BUCKET, GUARD_STATUS_KEY, payload);
}

async function computeGuardStatus({ persist = false } = {}) {
  const nowIso = new Date().toISOString();
  const guardQueries = [
    {
      name: 'MRR & Revenue',
      sql: `SELECT
  CAST(period_month AS varchar) AS latest_dt,
  1 AS ssot_count,
  CASE WHEN total_mrr < 0 THEN 1 ELSE 0 END AS exception_count
FROM curated_core.v_finance_kpis_latest
LIMIT 1;`,
      warnPct: 0.0,
      failPct: 0.01,
      staleDaysThreshold: GUARD_MRR_STALE_DAYS
    },
    {
      name: 'Projects Pipeline',
      sql: `SELECT
  CURRENT_DATE AS latest_dt,
  COUNT(*) AS ssot_count,
  COUNT(CASE WHEN project_id IS NULL THEN 1 END) AS exception_count
FROM curated_core.projects_enriched_live
LIMIT 1;`,
      warnPct: GUARD_EXCEPTION_WARN_PCT,
      failPct: GUARD_EXCEPTION_FAIL_PCT,
      staleDaysThreshold: null
    },
    {
      name: 'Support Tickets',
      sql: `SELECT
  MAX(created_time) AS latest_dt,
  COUNT(*) AS ssot_count,
  COUNT(CASE WHEN customer_account_number IS NULL OR customer_account_number = '' THEN 1 END) AS exception_count
FROM curated_core.v_cci_tickets_clean
LIMIT 1;`,
      warnPct: 0.2,
      failPct: 0.9,
      staleDaysThreshold: null
    }
  ];

  const systems = [];
  for (const guard of guardQueries) {
    try {
      const safeSql = ensureLimit(guard.sql, 10);
      validateReadOnlySql(safeSql);
      validateSqlAllowlist(safeSql);
      const result = await executeFreeformQuery(safeSql, {});
      const row = result.rows && result.rows.length > 1 ? result.rows[1] : [];
      const latestDt = row[0] || null;
      const ssotCount = Number(row[1] || 0);
      const exceptionCount = Number(row[2] || 0);
      const classification = classifyGuard({
        rowCount: ssotCount,
        exceptionCount,
        latestDt,
        warnPct: guard.warnPct,
        failPct: guard.failPct,
        staleDaysThreshold: guard.staleDaysThreshold
      });
      systems.push({
        name: guard.name,
        latest_dt: latestDt || 'Unknown',
        ssot_count: ssotCount,
        exception_count: exceptionCount,
        guard_status: classification.guard_status,
        guard_ok: classification.guard_ok,
        exception_ratio: classification.exception_ratio,
        stale_days: classification.stale_days,
        qid: result.query_execution_id
      });
    } catch (err) {
      systems.push({
        name: guard.name,
        latest_dt: 'Unknown',
        ssot_count: 0,
        exception_count: 0,
        guard_status: 'fail',
        guard_ok: false,
        exception_ratio: 0,
        stale_days: null,
        qid: null,
        error: err?.message || 'Guard query failed'
      });
    }
  }

  const payload = { last_check: nowIso, systems };
  if (persist) {
    await saveGuardStatusToS3(payload);
  }
  return payload;
}

function buildAnswerMarkdown(questionId, columns, rows) {
  if (!questionId) return null;
  if (!columns || !rows || rows.length === 0) {
    if (questionId === 'outages_reported') {
      return '**Outages Reported (deterministic)**\n- No outages returned in current dataset.';
    }
    return '**No data returned**';
  }
  const dataRows = stripHeaderRow(columns, rows);
  if (!dataRows.length) {
    if (questionId === 'outages_reported') {
      return '**Outages Reported (deterministic)**\n- No outages returned in current dataset.';
    }
    return '**No data returned**';
  }
  const first = dataRows[0];
  const record = {};
  columns.forEach((col, idx) => {
    record[col] = Array.isArray(first) ? first[idx] : first[col];
  });

  if (questionId === 'mrr_overview') {
    const period = formatMonth(record.period_month);
    const ytdYear = period && period !== 'N/A' ? period.slice(0, 4) : 'current year';
    return [
      '**Total MRR Overview (deterministic)**',
      `- Latest month (${period}): ${formatCurrency(record.latest_total_mrr)} across ${formatNumber(record.latest_active_accounts)} active accounts.`,
      `- ${ytdYear} YTD: ${formatCurrency(record.ytd_total_mrr)} total across ${formatNumber(record.ytd_months)} months (avg ${formatCurrency(record.ytd_avg_mrr)}).`,
      `- Trailing 12 months: ${formatCurrency(record.ttm_total_mrr)} total across ${formatNumber(record.ttm_months)} months (avg ${formatCurrency(record.ttm_avg_mrr)}).`
    ].join('\n');
  }

  if (questionId === 'platt_billing_mrr_latest') {
    const period = formatMonth(record.period_month);
    return [
      '**Platt Billing MRR (Latest) (deterministic)**',
      `- Latest month (${period}): ${formatCurrency(record.latest_total_mrr)}.`,
      `- Active subscriptions (modeled): ${formatNumber(record.active_subscriptions)}.`,
      `- Active customers: ${formatNumber(record.active_customers)}.`,
      `- Billing customers (MRR > 0): ${formatNumber(record.latest_billing_customers)}.`,
      `- ARPU: ${formatCurrency(record.latest_arpu, 2)}.`,
      `- Trailing 12 months total MRR: ${formatCurrency(record.ttm_total_mrr)}.`,
      `- YTD total MRR: ${formatCurrency(record.ytd_total_mrr)}.`
    ].join('\n');
  }

  if (questionId === 'mrr_trend_12m') {
    const lastRow = dataRows[dataRows.length - 1] || [];
    const periodIdx = columns.indexOf('period_month');
    const totalIdx = columns.indexOf('total_mrr');
    const custIdx = columns.indexOf('customer_count');
    const latestPeriod = periodIdx >= 0 ? formatMonth(lastRow[periodIdx]) : 'latest';
    const latestMrr = totalIdx >= 0 ? formatCurrency(lastRow[totalIdx]) : 'N/A';
    const latestCustomers = custIdx >= 0 ? formatNumber(lastRow[custIdx]) : 'N/A';
    return [
      '**MRR Trend (deterministic)**',
      `- Months returned: ${dataRows.length}.`,
      `- Latest month (${latestPeriod}): ${latestMrr} across ${latestCustomers} customers.`,
      '_See table for full month-by-month trend._'
    ].join('\n');
  }

  if (questionId === 'arpu_overview') {
    const period = formatMonth(record.period_month);
    return [
      '**ARPU Overview (deterministic)**',
      `- Latest month (${period}): ${formatCurrency(record.latest_arpu, 2)}.`,
      `- Trailing 12 months avg ARPU: ${formatCurrency(record.ttm_avg_arpu, 2)}.`
    ].join('\n');
  }

  if (questionId === 'passings_subscribers') {
    const period = formatMonth(record.period_month || record.dt);
    return [
      '**Passings & Subscribers (deterministic)**',
      `- Period: ${period}.`,
      `- Passings: ${formatNumber(record.total_passings)}.`,
      `- Subscriptions: ${formatNumber(record.total_subscriptions)}.`,
      `- Penetration: ${record.penetration_pct ? `${Number(record.penetration_pct).toFixed(2)}%` : 'N/A'}.`,
      `- Avg ARPU: ${formatCurrency(record.avg_arpu, 2)}.`,
      `- Total MRR: ${formatCurrency(record.total_mrr)}.`,
      `- Billed customers: ${formatNumber(record.total_billed_customers)}.`
    ].join('\n');
  }

  if (questionId === 'customer_overview') {
    const period = formatMonth(record.period_month);
    return [
      '**Customer Count Overview (deterministic)**',
      `- Active billing customers (MRR > 0) as of ${period}: ${formatNumber(record.active_billing_customers)}.`,
      `- Active SSOT customers (Platt active flag): ${formatNumber(record.active_customers_ssot)}.`,
      `- Total SSOT customers (non-sensitive): ${formatNumber(record.total_customers_ssot)}.`
    ].join('\n');
  }

  if (questionId === 'customer_identity_overview') {
    const period = formatMonth(record.period_month);
    return [
      '**Customer Identity Overview (deterministic)**',
      `- Billing customers (MRR > 0) as of ${period}: ${formatNumber(record.billing_customers)}.`,
      `- Active service customers (SSOT services): ${formatNumber(record.active_service_customers)}.`,
      `- Active subscriptions (network mix): ${formatNumber(record.active_subscriptions)}.`,
      `- Billed customers (network mix): ${formatNumber(record.billed_customers_network)}.`,
      `- Active SSOT customers (Platt active flag): ${formatNumber(record.active_ssot_customers)}.`,
      `- Total SSOT customers (non-sensitive): ${formatNumber(record.total_ssot_customers)}.`,
      '_Subscriptions count services and can exceed unique customers; billing customers are distinct PLAT IDs with billed MRR._'
    ].join('\n');
  }

  if (questionId === 'owned_customers_multiscope') {
    const billingPeriod = formatMonth(record.billing_period_month);
    const investorPeriod = formatMonth(record.investor_as_of_date);
    const modeledDt = formatMonth(record.modeled_dt);
    const ownedSubs = Number(record.owned_subscriptions);
    const ownedPass = Number(record.owned_passings);
    const ownedPen = (Number.isFinite(ownedSubs) && Number.isFinite(ownedPass) && ownedPass > 0)
      ? `${((ownedSubs / ownedPass) * 100).toFixed(2)}%`
      : 'N/A';
    return [
      '**Owned Networks — Customers (multi-scope, deterministic)**',
      `- Customer-mix subscriptions (Owned FTTP + Owned Customer) as of ${modeledDt}: ${formatNumber(record.owned_subscriptions)} across ${formatNumber(record.owned_passings)} passings (penetration ${ownedPen}).`,
      `- Billing customers (bucket \`owned_fttp\`) as of ${billingPeriod}: ${formatNumber(record.owned_billing_customers_bucket)}.`,
      `- Billed customers (Revenue Mix, PLAT ID COUNT where network_type LIKE '%owned%') as of ${investorPeriod}: ${formatNumber(record.owned_plat_id_count)}.`,
      `- Owned MRR (billed preferred, modeled fallback): ${formatCurrency(record.owned_mrr)}.`,
      '_These are distinct definitions: subscriptions (services) vs billed customer IDs (PLAT IDs). Ask “list owned networks” to see the underlying networks._'
    ].join('\n');
  }

  if (questionId === 'owned_networks_list') {
    return [
      '**Owned Networks List (deterministic)**',
      `- Rows returned: ${dataRows.length}.`,
      '_See table for networks and their source (modeled_network_health vs investor_revenue_mix)._'
    ].join('\n');
  }

  if (questionId === 'workbook_customer_mix_kpis') {
    const modeledDt = formatMonth(record.modeled_dt);
    const period = formatMonth(record.period_month || record.modeled_dt);
    return [
      '**Workbook Customer Mix (modeled SSOT, deterministic)**',
      `- Network Type: ${record.network_type || 'All'}. Customer Type: ${record.customer_type || 'All'}. Access: ${record.access_type || 'All'}.`,
      `- Period: ${period}. As of ${modeledDt}: ${formatNumber(record.subscriptions)} subscriptions across ${formatNumber(record.passings)} passings (penetration ${record.penetration_pct ? `${Number(record.penetration_pct).toFixed(2)}%` : 'N/A'}).`,
      `- Modeled MRR: ${formatCurrency(record.mrr_modeled)} (ARPU ${formatCurrency(record.arpu_modeled, 2)}).`,
      '_Ask “list networks” for the underlying networks contributing to this total._'
    ].join('\n');
  }

  if (questionId === 'workbook_customer_mix_networks_list') {
    const modeledDt = formatMonth(record.dt);
    return [
      '**Workbook Customer Mix — Networks List (modeled SSOT, deterministic)**',
      `- Rows returned: ${dataRows.length}.`,
      `- As of ${modeledDt}.`,
      '_See table for networks and their passings/subscriptions._'
    ].join('\n');
  }

  if (questionId === 'workbook_customer_mix_summary') {
    const modeledDt = formatMonth(record.modeled_dt);
    return [
      '**Workbook Customer Mix — Summary (modeled SSOT, deterministic)**',
      `- Rows returned: ${dataRows.length}.`,
      `- As of ${modeledDt}.`,
      '_This matches the workbook grain: subscriptions/services and passings, grouped by Network Type + Customer Type + Access Type._'
    ].join('\n');
  }

  if (questionId === 'workbook_revenue_mix_kpis') {
    const asOf = formatMonth(record.as_of_date);
    return [
      '**Workbook Revenue Mix (billed, deterministic)**',
      `- Segment: ${record.segment_label || 'All'}.`,
      `- As of ${asOf}: ${formatNumber(record.billed_customers)} billed customers (PLAT IDs) and ${formatCurrency(record.billed_mrr)} billed MRR.`,
      '_Ask “list networks” to see contributing networks._'
    ].join('\n');
  }

  if (questionId === 'workbook_revenue_mix_networks_list') {
    const asOf = formatMonth(record.as_of_date);
    return [
      '**Workbook Revenue Mix — Networks List (billed, deterministic)**',
      `- Rows returned: ${dataRows.length}.`,
      `- As of ${asOf}.`,
      '_See table for networks and their billed customers (PLAT ID COUNT) and billed MRR._'
    ].join('\n');
  }

  if (questionId === 'workbook_revenue_mix_summary') {
    const asOf = formatMonth(record.as_of_date);
    return [
      '**Workbook Revenue Mix — Summary (billed, deterministic)**',
      `- Rows returned: ${dataRows.length}.`,
      `- As of ${asOf}.`,
      '_This matches the workbook grain: billed customer IDs (PLAT ID COUNT) and billed MRR, grouped by Network Type._'
    ].join('\n');
  }

  if (questionId === 'workbook_revenue_mix_totals_excluding_dvfiber') {
    const asOf = formatMonth(record.as_of_date);
    return [
      '**Workbook Revenue Mix — Totals Excluding DVFiber (billed, deterministic)**',
      `- As of ${asOf}: ${formatNumber(record.billed_customers)} billed customers (PLAT IDs) and ${formatCurrency(record.billed_mrr)} billed MRR (ARPU ${formatCurrency(record.arpu_billed, 2)}).`
    ].join('\n');
  }

  if (questionId === 'copper_customers_count') {
    const period = formatMonth(record.period_month);
    return [
      '**Copper Customers (deterministic)**',
      `- Billed copper customers (investor billing snapshot, ${period}): ${formatNumber(record.copper_customer_count)}.`,
      `- Active services (copper): ${formatNumber(record.copper_active_services)}.`,
      `- Subscriptions (copper): ${formatNumber(record.copper_subscriptions)}.`,
      `- Billed MRR (copper): ${formatCurrency(record.copper_mrr_billed)}.`,
      '_Copper classification is derived from network naming in SSOT modeled network health + investor billing mix._'
    ].join('\n');
  }

  if (questionId === 'network_health') {
    return [
      '**Network Mix Detail (deterministic)**',
      `- Rows returned: ${dataRows.length}.`,
      '_See table for full network mix detail._'
    ].join('\n');
  }

  if (questionId === 'network_network_type_summary' || questionId === 'network_customer_type_summary') {
    const label = questionId === 'network_network_type_summary' ? 'Network Type' : 'Customer Type';
    const groupCol = questionId === 'network_network_type_summary' ? 'network_type' : 'customer_type';
    const groupIdx = columns.indexOf(groupCol);
    const subsIdx = columns.indexOf('subscriptions');
    const passIdx = columns.indexOf('passings');
    const topRows = dataRows.slice(0, 3).map((row) => {
      const name = groupIdx >= 0 ? row[groupIdx] : 'Unknown';
      const subs = subsIdx >= 0 ? formatNumber(row[subsIdx]) : 'N/A';
      const pass = passIdx >= 0 ? formatNumber(row[passIdx]) : 'N/A';
      return `- ${name}: ${subs} subs / ${pass} passings`;
    });
    return [
      `**Network Mix by ${label} (deterministic)**`,
      `- Rows returned: ${dataRows.length}.`,
      ...topRows,
      '_See table for full breakdown._'
    ].join('\n');
  }

  if (questionId === 'tickets_summary') {
    const latest = record.latest_ticket_date ? String(record.latest_ticket_date).slice(0, 10) : 'latest';
    return [
      '**Ticket Summary (deterministic)**',
      `- Latest ticket date: ${latest}.`,
      `- Total tickets: ${formatNumber(record.tickets_total)}.`,
      `- Last 30 days: ${formatNumber(record.tickets_last_30d)}.`,
      `- Last 90 days: ${formatNumber(record.tickets_last_90d)}.`,
      `- Open tickets (estimated): ${formatNumber(record.open_tickets_estimate)}.`
    ].join('\n');
  }

  if (questionId === 'outages_summary') {
    const latest = record.latest_ticket_date ? String(record.latest_ticket_date).slice(0, 10) : 'latest';
    return [
      '**Outage Summary (deterministic)**',
      `- Latest ticket date: ${latest}.`,
      `- Total outages: ${formatNumber(record.outages_total)}.`,
      `- Last 30 days: ${formatNumber(record.outages_last_30d)}.`,
      `- Last 90 days: ${formatNumber(record.outages_last_90d)}.`
    ].join('\n');
  }

  if (questionId === 'outages_reported') {
    return [
      '**Outages Reported (deterministic)**',
      `- Rows returned: ${dataRows.length}.`,
      '_See table for outage detail._'
    ].join('\n');
  }

  if (questionId === 'month_end_close') {
    const period = formatMonth(record.period_month);
    return [
      '**Month-End Close Summary (deterministic)**',
      `- Period: ${period}.`,
      `- Total MRR: ${formatCurrency(record.total_mrr)}.`,
      `- Active accounts: ${formatNumber(record.active_accounts)}.`,
      `- Accounts added: ${formatNumber(record.accounts_added)}.`,
      `- Accounts lost: ${formatNumber(record.accounts_lost)}.`,
      `- Net accounts: ${formatNumber(record.net_accounts)}.`
    ].join('\n');
  }

  if (questionId === 'projects_summary') {
    return [
      '**Projects Summary (deterministic)**',
      `- Total projects: ${formatNumber(record.project_count)}.`,
      `- Entities: ${formatNumber(record.entity_count)}.`,
      `- Stages: ${formatNumber(record.stage_count)}.`,
      `- States: ${formatNumber(record.state_count)}.`
    ].join('\n');
  }

  if (questionId === 'projects_pipeline') {
    return [
      '**Projects Pipeline (deterministic)**',
      `- Rows returned: ${dataRows.length}.`,
      '_See table for project-level detail._'
    ].join('\n');
  }

  if (questionId === 'customers_in_city_breakdown') {
    return [
      `**Customers in ${record.city || 'selected city'} (SSOT)**`,
      `- Total customers: ${formatNumber(record.total_customers)}.`,
      `- Active customers: ${formatNumber(record.active_customers)}.`,
      `- Inactive customers: ${formatNumber(record.inactive_customers)}.`,
      '_Active = flagged active in SSOT. If you want billing-only or service-location counts, specify that scope._'
    ].join('\n');
  }

  if (questionId === 'vetro_network_status_dominant') {
    const statusIdx = columns.indexOf('dominant_status');
    const statusCounts = {};
    dataRows.forEach((row) => {
      const status = statusIdx >= 0 ? (row[statusIdx] ?? 'Unknown') : 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    const top = Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => `- ${status}: ${formatNumber(count)} networks`)
      .slice(0, 6);
    return [
      '**Vetro Network Status (Dominant) (deterministic)**',
      `- Networks returned: ${formatNumber(dataRows.length)}.`,
      ...top,
      '_Dominant status = the most common Vetro `network_status` across service locations for each network. See table for per-network detail._'
    ].join('\n');
  }

  if (questionId === 'vetro_networks_in_construction') {
    return [
      '**Vetro Networks in Construction (deterministic)**',
      `- Networks in construction: ${formatNumber(dataRows.length)}.`,
      "_Construction is inferred from Vetro service-location `network_status` by taking the dominant status per network and treating `Planned` / `Design Complete` / `Installed` as in-progress._",
      '_See table for the network list + dominant status._'
    ].join('\n');
  }

  const label = String(questionId)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return [
    `**${label} (deterministic)**`,
    `- Rows returned: ${formatNumber(dataRows.length)}.`,
    '_See table for details._'
  ].join('\n');
}

async function executeCustomerLocationMultiScope(params) {
  const city = params?.city || null;
  let network = params?.network || null;
  let gwiSystem = params?.gwi_system || null;
  let systemCandidates = Array.isArray(params?.system_candidates) ? params.system_candidates : [];

  if (city && !network && !gwiSystem && systemCandidates.length === 0) {
    const systemMatch = resolveSystemMatch(city);
    if (systemMatch?.matches?.length === 1) {
      network = systemMatch.matches[0].network;
      gwiSystem = systemMatch.matches[0].gwi_system;
    } else if (systemMatch?.matches?.length > 1) {
      systemCandidates = systemMatch.matches.map((match) => match.network);
    }
  }

  const tasks = [];
  if (gwiSystem && REGISTRY.platt_billing_customers_by_system_latest) {
    tasks.push({
      key: 'billing',
      views: REGISTRY.platt_billing_customers_by_system_latest.views_used || [],
      promise: executeQuery(REGISTRY.platt_billing_customers_by_system_latest, { gwi_system: gwiSystem })
    });
  }
  if (network && REGISTRY.billing_customers_in_network_latest) {
    tasks.push({
      key: 'networkBilling',
      views: REGISTRY.billing_customers_in_network_latest.views_used || [],
      promise: executeQuery(REGISTRY.billing_customers_in_network_latest, { network })
    });
  }
  const ssotQuery = REGISTRY.customers_in_city_breakdown;
  tasks.push({
    key: 'ssot',
    views: ssotQuery?.views_used || [],
    promise: executeQuery(ssotQuery, { city })
  });
  if (network && REGISTRY.plat_id_count_by_network_latest) {
    tasks.push({
      key: 'harness',
      views: REGISTRY.plat_id_count_by_network_latest.views_used || [],
      promise: executeQuery(REGISTRY.plat_id_count_by_network_latest, { network })
    });
  }

  const results = await Promise.allSettled(tasks.map((task) => task.promise));
  const taskMap = {};
  results.forEach((result, idx) => {
    const task = tasks[idx];
    if (result.status === 'fulfilled') {
      taskMap[task.key] = { result: result.value, views: task.views };
    } else {
      taskMap[task.key] = { result: null, views: task.views, error: result.reason };
    }
  });

  const billingResult = taskMap.billing?.result || null;
  const billingRecord = billingResult ? extractRecord(billingResult.columns, billingResult.rows) : null;
  const billingViews = taskMap.billing?.views || [];

  const networkBillingResult = taskMap.networkBilling?.result || null;
  const networkBillingRecord = networkBillingResult ? extractRecord(networkBillingResult.columns, networkBillingResult.rows) : null;
  const networkBillingViews = taskMap.networkBilling?.views || [];

  const ssotResult = taskMap.ssot?.result || null;
  const ssotRecord = ssotResult ? extractRecord(ssotResult.columns, ssotResult.rows) : null;
  const ssotViews = taskMap.ssot?.views || [];

  const harnessResult = taskMap.harness?.result || null;
  const harnessRecord = harnessResult ? extractRecord(harnessResult.columns, harnessResult.rows) : null;
  const harnessViews = taskMap.harness?.views || [];

  const answerLines = [];
  answerLines.push(`**Customers in ${city || 'selected location'} (multi-scope)**`);
  if (billingRecord) {
    const asOf = billingRecord.invoice_month ? String(billingRecord.invoice_month).slice(0, 10) : 'latest';
    answerLines.push(`- Billing (authoritative) PLAT ID COUNT (${gwiSystem}): ${formatNumber(billingRecord.plat_id_count)} as of ${asOf}.`);
  } else if (gwiSystem) {
    answerLines.push(`- Billing (authoritative) PLAT ID COUNT: unavailable for system "${gwiSystem}".`);
  } else if (systemCandidates.length) {
    answerLines.push(`- Billing (authoritative) PLAT ID COUNT: ambiguous system match (${systemCandidates.join(', ')}).`);
  } else {
    answerLines.push('- Billing (authoritative) PLAT ID COUNT: no system match for this location.');
  }

  if (ssotRecord) {
    answerLines.push(`- SSOT city totals: ${formatNumber(ssotRecord.total_customers)} total, ${formatNumber(ssotRecord.active_customers)} active, ${formatNumber(ssotRecord.inactive_customers)} inactive.`);
    answerLines.push('  (SSOT totals use SSOT city fields + SSOT active flag; they are not a billing-only measure.)');
  } else {
    answerLines.push('- SSOT city totals: unavailable.');
  }

  if (networkBillingRecord) {
    answerLines.push(`- Billing (network-mapped) ${network}: ${formatNumber(networkBillingRecord.billed_customers)} customers, ${formatCurrency(networkBillingRecord.billed_mrr)} billed MRR.`);
    if (networkBillingRecord.modeled_subscriptions !== null && networkBillingRecord.modeled_subscriptions !== undefined) {
      answerLines.push(`  Modeled subs: ${formatNumber(networkBillingRecord.modeled_subscriptions)} (modeled MRR ${formatCurrency(networkBillingRecord.modeled_mrr)}).`);
    }
  }

  // Keep internal policy messaging out of user-facing answers.

  const viewsUsed = Array.from(new Set([...billingViews, ...networkBillingViews, ...ssotViews, ...harnessViews]));
  const primaryResult = billingResult || networkBillingResult || ssotResult;
  const evidencePack = primaryResult
    ? buildEvidencePackFromResult(primaryResult, billingViews.length ? billingViews : ssotViews)
    : {};
  if (networkBillingResult) {
    evidencePack.network = buildEvidencePackFromResult(networkBillingResult, networkBillingViews);
  }
  if (billingResult && ssotResult) {
    evidencePack.secondary = buildEvidencePackFromResult(ssotResult, ssotViews);
  }
  if (harnessResult) {
    evidencePack.harness = buildEvidencePackFromResult(harnessResult, harnessViews);
  }
  evidencePack.system_match = {
    network,
    gwi_system: gwiSystem,
    candidates: systemCandidates
  };
  if (taskMap.billing?.error) {
    evidencePack.billing_error = taskMap.billing.error?.message || String(taskMap.billing.error);
  }
  if (taskMap.networkBilling?.error) {
    evidencePack.network_error = taskMap.networkBilling.error?.message || String(taskMap.networkBilling.error);
  }
  if (taskMap.ssot?.error) {
    evidencePack.ssot_error = taskMap.ssot.error?.message || String(taskMap.ssot.error);
  }
  if (taskMap.harness?.error) {
    evidencePack.harness_error = taskMap.harness.error?.message || String(taskMap.harness.error);
  }

  const freshnessChecks = await getFreshnessEvidence(viewsUsed);
  if (freshnessChecks.length) {
    evidencePack.freshness = freshnessChecks;
  }

  const summaryColumns = [
    'city',
    'gwi_system',
    'billing_invoice_month',
    'billing_plat_id_count',
    'ssot_total_customers',
    'ssot_active_customers',
    'ssot_inactive_customers',
    'network',
    'network_billed_customers',
    'network_billed_mrr',
    'harness_as_of_date',
    'harness_plat_id_count'
  ];

  const summaryRow = [
    city,
    gwiSystem,
    billingRecord?.invoice_month ?? null,
    billingRecord?.plat_id_count ?? null,
    ssotRecord?.total_customers ?? null,
    ssotRecord?.active_customers ?? null,
    ssotRecord?.inactive_customers ?? null,
    network,
    networkBillingRecord?.billed_customers ?? null,
    networkBillingRecord?.billed_mrr ?? null,
    harnessRecord?.as_of_date ?? null,
    harnessRecord?.plat_id_count ?? null
  ];

  return {
    sql: primaryResult?.sql || null,
    generated_sql: primaryResult?.sql || null,
    query_execution_id: primaryResult?.query_execution_id || null,
    columns: summaryColumns,
    rows: [summaryRow],
    truncated: primaryResult?.truncated || false,
    max_rows: primaryResult?.max_rows || null,
    views_used: viewsUsed,
    request_params: {
      city,
      network,
      gwi_system: gwiSystem,
      system_candidates: systemCandidates
    },
    metric_key: 'customers_in_city',
    answer_markdown: answerLines.join('\n'),
    evidence_pack: evidencePack,
    secondary: ssotResult && billingResult
      ? {
          sql: ssotResult.sql,
          query_execution_id: ssotResult.query_execution_id,
          columns: ssotResult.columns,
          rows: ssotResult.rows
        }
      : null
  };
}

async function executeCopperCustomerMultiScope(params = {}) {
  const tasks = [];
  const networkParam = String(params.network || '');
  const networkPrefixParam = String(params.network_prefix || '');
  if (REGISTRY.copper_customers_count) {
    tasks.push({
      key: 'copper',
      views: REGISTRY.copper_customers_count.views_used || [],
      promise: executeQuery(REGISTRY.copper_customers_count, {
        network: networkParam,
        network_prefix: networkPrefixParam
      })
    });
  }
  if (REGISTRY.customer_identity_overview) {
    tasks.push({
      key: 'identity',
      views: REGISTRY.customer_identity_overview.views_used || [],
      promise: executeQuery(REGISTRY.customer_identity_overview, {})
    });
  }

  const results = await Promise.allSettled(tasks.map((task) => task.promise));
  const taskMap = {};
  results.forEach((result, idx) => {
    const task = tasks[idx];
    if (result.status === 'fulfilled') {
      taskMap[task.key] = { result: result.value, views: task.views };
    } else {
      taskMap[task.key] = { result: null, views: task.views, error: result.reason };
    }
  });

  const copperResult = taskMap.copper?.result || null;
  const copperRecord = copperResult ? extractRecord(copperResult.columns, copperResult.rows) : null;
  const copperViews = taskMap.copper?.views || [];

  const identityResult = taskMap.identity?.result || null;
  const identityRecord = identityResult ? extractRecord(identityResult.columns, identityResult.rows) : null;
  const identityViews = taskMap.identity?.views || [];

  const answerLines = [];
  answerLines.push('**Copper Customers (multi-scope)**');
  if (copperRecord) {
    const scopedLabel = networkParam || (networkPrefixParam ? `${networkPrefixParam.replace(/%/g, '').toUpperCase()}*` : null);
    const scopeSuffix = scopedLabel ? ` (network scope: ${scopedLabel})` : '';
    if (copperRecord.copper_customer_count != null) {
      answerLines.push(`- Network mix billed copper customers${scopeSuffix}: ${formatNumber(copperRecord.copper_customer_count)}.`);
    }
    if (copperRecord.copper_active_services != null) {
      answerLines.push(`- Network mix active services (copper)${scopeSuffix}: ${formatNumber(copperRecord.copper_active_services)}.`);
    }
    if (copperRecord.copper_subscriptions != null) {
      answerLines.push(`- Network mix subscriptions (copper)${scopeSuffix}: ${formatNumber(copperRecord.copper_subscriptions)}.`);
    }
    if (copperRecord.copper_mrr_billed != null) {
      answerLines.push(`- Network mix billed MRR (copper)${scopeSuffix}: ${formatCurrency(copperRecord.copper_mrr_billed, 0)}.`);
    }
  } else {
    answerLines.push('- Network mix copper customers: unavailable.');
  }
  if (identityRecord) {
    const period = identityRecord.period_month ? String(identityRecord.period_month).slice(0, 10) : 'latest';
    answerLines.push(`- Billing customers (all types, ${period}): ${formatNumber(identityRecord.billing_customers)}.`);
    answerLines.push(`- Active service customers (all types): ${formatNumber(identityRecord.active_service_customers)}.`);
    answerLines.push(`- Active subscriptions (network mix): ${formatNumber(identityRecord.active_subscriptions)}.`);
  }
  answerLines.push('_Copper classification is sourced from SSOT network mix billing alignment. Billing totals reflect latest billed month._');

  const viewsUsed = Array.from(new Set([...copperViews, ...identityViews]));
  const primaryResult = copperResult || identityResult;
  const evidencePack = primaryResult
    ? buildEvidencePackFromResult(primaryResult, copperViews.length ? copperViews : identityViews)
    : {};
  if (identityResult) {
    evidencePack.identity = buildEvidencePackFromResult(identityResult, identityViews);
  }
  if (taskMap.copper?.error) {
    evidencePack.copper_error = taskMap.copper.error?.message || String(taskMap.copper.error);
  }
  if (taskMap.identity?.error) {
    evidencePack.identity_error = taskMap.identity.error?.message || String(taskMap.identity.error);
  }

  const freshnessChecks = await getFreshnessEvidence(viewsUsed);
  if (freshnessChecks.length) {
    evidencePack.freshness = freshnessChecks;
  }

  const summaryColumns = [
    'copper_billed_customers',
    'copper_active_services',
    'copper_subscriptions',
    'copper_mrr_billed',
    'period_month'
  ];
  const summaryRow = [
    copperRecord?.copper_customer_count ?? null,
    copperRecord?.copper_active_services ?? null,
    copperRecord?.copper_subscriptions ?? null,
    copperRecord?.copper_mrr_billed ?? null,
    copperRecord?.period_month ?? identityRecord?.period_month ?? null
  ];

  return {
    sql: primaryResult?.sql || null,
    generated_sql: primaryResult?.sql || null,
    query_execution_id: primaryResult?.query_execution_id || null,
    columns: summaryColumns,
    rows: [summaryRow],
    truncated: primaryResult?.truncated || false,
    max_rows: primaryResult?.max_rows || null,
    views_used: viewsUsed,
    request_params: {
      network: networkParam,
      network_prefix: networkPrefixParam
    },
    metric_key: 'copper_customers',
    answer_markdown: answerLines.join('\n'),
    evidence_pack: evidencePack
  };
}

function buildGovernedAnswerMarkdown(planResult) {
  if (!planResult) return null;
  if (planResult.status === 'invalid_plan') {
    const errors = Array.isArray(planResult.errors) && planResult.errors.length
      ? planResult.errors.join('; ')
      : 'Planner validation failed.';
    return `**Planner validation failed**\n- ${errors}\n\nTry clarifying the metric, timeframe, or scope.`;
  }
  if (planResult.status === 'clarify' && planResult.clarifying_question) {
    return `**Clarifying question:** ${planResult.clarifying_question}`;
  }
  if (planResult.status === 'unavailable') {
    return buildUnavailableMarkdownFromLadder({
      status: 'unavailable',
      freshness: planResult.freshness ? [planResult.freshness].flat() : [],
      sources: planResult.compiled?.views_used || []
    });
  }
  if (planResult.status === 'inconclusive') {
    return buildInconclusiveMarkdownFromLadder({
      status: 'inconclusive',
      primary_value: planResult.primary_value,
      cross_checks: planResult.cross_checks || [],
      confidence: planResult.confidence || 'low'
    });
  }
  const queryId = planResult.compiled?.query_id || null;
  if (queryId) {
    return buildAnswerMarkdown(queryId, planResult.primaryResult?.columns, planResult.primaryResult?.rows);
  }
  if (planResult.primary_value !== null && planResult.primary_value !== undefined) {
    return `**Answer:** ${planResult.primary_value}`;
  }
  return '**No data returned**';
}

function formatDeltaPct(deltaPct) {
  if (deltaPct === null || deltaPct === undefined || Number.isNaN(deltaPct)) return 'N/A';
  const pct = Number(deltaPct) * 100;
  if (Number.isNaN(pct)) return 'N/A';
  return `${pct.toFixed(2)}%`;
}

function buildUnavailableMarkdownFromLadder(ladder) {
  const freshness = Array.isArray(ladder?.freshness) ? ladder.freshness : [];
  const empty = freshness.filter((f) => f && f.status === 'empty');
  const errored = freshness.filter((f) => f && f.status === 'error');
  if (!empty.length && !errored.length) {
    return '**Unavailable (source empty/stale)**';
  }
  const lines = ['**Unavailable (source empty/stale)**'];
  if (empty.length) {
    lines.push('', 'Empty sources:');
    empty.slice(0, 8).forEach((f) => {
      const latest = f.latest_partition ? String(f.latest_partition).slice(0, 19) : 'N/A';
      lines.push(`- \`${f.view || 'unknown'}\`: row_count=${f.row_count ?? 'N/A'}, latest=${latest}`);
    });
  }
  if (errored.length) {
    lines.push('', 'Freshness check errors:');
    errored.slice(0, 5).forEach((f) => {
      lines.push(`- \`${f.view || 'unknown'}\`: ${f.error || 'error'}`);
    });
  }
  lines.push('', '_Use **Show Evidence** for QIDs and SQL._');
  return lines.join('\n');
}

function buildInconclusiveMarkdownFromLadder(ladder) {
  const primary = ladder?.primary_value;
  const crossChecks = Array.isArray(ladder?.cross_checks) ? ladder.cross_checks : [];
  const mismatches = crossChecks.filter((c) => c && c.status === 'mismatch');
  const lines = ['**INCONCLUSIVE** — cross-check results diverged beyond tolerance.'];
  if (primary !== null && primary !== undefined) {
    lines.push(`- Primary value: ${formatVerificationValue(primary)}.`);
  }
  if (mismatches.length) {
    lines.push('- Mismatched cross-checks:');
    mismatches.slice(0, 8).forEach((c) => {
      const label = c.label || c.template_key || 'cross-check';
      const valueText = c.error ? `ERROR (${c.error})` : formatVerificationValue(c.value);
      const deltaText = c.delta_pct !== null && c.delta_pct !== undefined ? ` (delta ${formatDeltaPct(c.delta_pct)})` : '';
      lines.push(`- ${label}: ${valueText}${deltaText}`);
    });
  } else if (crossChecks.length) {
    lines.push('- Cross-checks were executed but did not produce a comparable numeric value. Review evidence.');
  } else {
    lines.push('- No cross-check templates are configured for this metric. Add cross-check templates to the metric registry.');
  }
  lines.push('', '_Use **Verify** to run the reconciliation workflow across all configured systems._');
  return lines.join('\n');
}

function buildEvidencePackFromPlan(planResult) {
  if (!planResult) return null;
  const primary = planResult.primaryResult || {};
  return {
    status: planResult.status || null,
    plan: planResult.plan || null,
    plan_errors: planResult.errors || null,
    executed_sql: primary.sql || null,
    query_execution_id: primary.query_execution_id || null,
    sources: planResult.compiled?.views_used || [],
    row_count: planResult.row_count || 0,
    primary_value: planResult.primary_value ?? null,
    freshness: planResult.freshness || null,
    cross_checks: planResult.cross_checks || [],
    sanity_check: planResult.sanity_check || null,
    driver_queries: planResult.driver_queries || [],
    confidence: planResult.confidence || 'medium',
    assumptions: planResult.plan?.assumptions || [],
    clarifying_question: planResult.clarifying_question || null,
    validations: {
      read_only: true,
      allowlist: true,
      plan_schema: QUERY_PLAN_SCHEMA ? true : false
    }
  };
}

function buildEvidencePackFromResult(result, viewsUsed) {
  return {
    status: 'ok',
    executed_sql: result.sql,
    query_execution_id: result.query_execution_id,
    sources: viewsUsed || [],
    row_count: computeRowCount(result.rows),
    validations: {
      read_only: true,
      allowlist: true
    },
    confidence: 'medium'
  };
}

async function getFreshnessEvidence(viewsUsed) {
  if (!viewsUsed || viewsUsed.length === 0) return [];
  const uniqueViews = Array.from(new Set((Array.isArray(viewsUsed) ? viewsUsed : []).filter(Boolean)));
  const tasks = uniqueViews.map(async (view) => {
    try {
      const freshness = await runFreshnessCheckCached(view);
      return { view, ...freshness };
    } catch (err) {
      return { view, status: 'error', latest_partition: null, row_count: null, error: err.message || String(err) };
    }
  });
  return (await Promise.all(tasks)).filter(Boolean);
}

function classifyIRR(irrPct) {
  if (irrPct == null || Number.isNaN(irrPct)) return 'unknown';
  if (irrPct <= 0) return 'red';
  if (irrPct < 15) return 'yellow';
  return 'green';
}

function classifyMOIC(moic) {
  if (moic == null || Number.isNaN(moic)) return 'unknown';
  if (moic <= 1.0) return 'red';
  if (moic < 2.0) return 'yellow';
  return 'green';
}

function classifyNPV(npv, initialInvestment) {
  if (npv == null || Number.isNaN(npv)) return 'unknown';
  const bandWidth = Math.abs(initialInvestment || 0) * 0.05;
  if (npv < -bandWidth) return 'red';
  if (Math.abs(npv) <= bandWidth) return 'yellow';
  return 'green';
}

function buildEomonthDates(startDate, months) {
  const dates = [];
  const base = new Date(startDate);
  for (let i = 0; i < months; i += 1) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + i + 1, 0);
    dates.push(d);
  }
  return dates;
}

function computeXirr(cashflows, dates) {
  if (!cashflows.length || cashflows.length !== dates.length) {
    return { rate: null, status: 'invalid_input', reason: 'Cashflows and dates length mismatch' };
  }
  const minCF = Math.min(...cashflows);
  const maxCF = Math.max(...cashflows);
  if (!(minCF < 0 && maxCF > 0)) {
    return { rate: null, status: 'no_sign_change', reason: 'No sign change in cashflows' };
  }

  const day0 = dates[0].getTime();
  const yearFrac = dates.map((d) => (d.getTime() - day0) / (365 * 24 * 60 * 60 * 1000));
  const xnpv = (rate) => {
    let total = 0;
    for (let i = 0; i < cashflows.length; i += 1) {
      total += cashflows[i] / Math.pow(1 + rate, yearFrac[i]);
    }
    return total;
  };

  let low = -0.95;
  let high = 3.0;
  let fLow = xnpv(low);
  let fHigh = xnpv(high);
  if (fLow * fHigh > 0) {
    return { rate: null, status: 'no_root_in_range', reason: 'No XIRR root in range [-95%, +300%]' };
  }

  let rate = null;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const fMid = xnpv(mid);
    if (Math.abs(fMid) < 1e-6) {
      rate = mid;
      break;
    }
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
    rate = mid;
  }

  return { rate, status: 'converged', reason: null };
}

function runDeveloperTemplateModel(assumptions) {
  const {
    passings,
    build_months,
    subscription_months,
    subscription_rate,
    capex_per_passing,
    install_cost_per_subscriber,
    arpu_start,
    circuit,
    circuit_type,
    min_non_circuit_cogs,
    cogs_pct_revenue,
    opex_per_sub,
    opex_per_passing,
    min_monthly_opex,
    ebitda_multiple,
    discount_rate_pct,
    analysis_months,
    model_profile,
    start_date
  } = assumptions;

  const months = analysis_months || 120;
  const subscriptionDelay = assumptions.subscription_start_delay_months != null
    ? assumptions.subscription_start_delay_months
    : 5;
  const passingsStartDelay = assumptions.passings_start_delay_months != null
    ? assumptions.passings_start_delay_months
    : 1;
  const blueprintShare = assumptions.blueprint_share ?? 0.5;
  const contributionShare = assumptions.contribution_share ?? 0.5;
  const distributionStartMonth = assumptions.distribution_start_month ?? 27;

  const normalizedProfile = normalizeModelProfileKey(model_profile) || 'developer_template_2_9_26';
  const circuitDefaults = {
    1: { nrc: 0, mrc: 1300, threshold: 100 },
    2: { nrc: 0, mrc: 2400, threshold: 200 },
    5: { nrc: 0, mrc: 3500, threshold: 500 },
    10: { nrc: 0, mrc: 5000, threshold: 1000 }
  };
  const circuitConfig = circuitDefaults[circuit_type] || circuitDefaults[1];
  const effectiveCircuitNrc = assumptions.circuit_nrc ?? circuitConfig.nrc;
  const effectiveCircuitMrc = assumptions.circuit_mrc ?? circuitConfig.mrc;
  const effectiveCircuitThreshold = assumptions.circuit_sub_threshold ?? circuitConfig.threshold;

  const totalPassings = passings || 0;
  const totalSubscribersTarget = totalPassings * (subscription_rate ?? 0);
  const subscriptionMonths = subscription_months || build_months || 36;
  const passingsPerMonth = build_months ? (totalPassings / build_months) : 0;
  const subsPerMonth = subscriptionMonths ? (totalSubscribersTarget / subscriptionMonths) : 0;
  const distributionThreshold = totalSubscribersTarget * (arpu_start || 0);

  const epsilon = 1e-6;
  let passingsEnd = 0;
  let subscribersEnd = 0;
  let totalCircuitsPrev = 0;
  let ebCashPrev = 0;
  let cumulativeContribution = 0;

  const monthly = [];
  const cashOutflows = [];
  const cashInflows = [];

  for (let i = 0; i < months; i += 1) {
    const monthNumber = i + 1;
    const remainingPassings = totalPassings - passingsEnd;
    const passingsAdded = (i < passingsStartDelay || remainingPassings <= epsilon)
      ? 0
      : Math.min(passingsPerMonth, remainingPassings);
    passingsEnd = Math.min(totalPassings, passingsEnd + passingsAdded);

    let subscribersAdded = 0;
    const remainingSubscribers = totalSubscribersTarget - subscribersEnd;
    if (i >= subscriptionDelay && remainingSubscribers > epsilon) {
      subscribersAdded = Math.min(subsPerMonth, remainingSubscribers);
    }
    subscribersEnd = Math.min(totalSubscribersTarget, subscribersEnd + subscribersAdded);

    const revenue = subscribersEnd * (arpu_start || 0);

    let totalCircuits = 0;
    let circuitCostNrc = 0;
    let circuitCostMrc = 0;
    if (circuit) {
      const firstCircuit = passingsEnd > 0 ? 1 : 0;
      const additionalCircuits = subscribersEnd >= effectiveCircuitThreshold
        ? Math.floor(subscribersEnd / effectiveCircuitThreshold)
        : 0;
      totalCircuits = firstCircuit + additionalCircuits;
      const circuitAdditions = totalCircuits - totalCircuitsPrev;
      circuitCostNrc = circuitAdditions * effectiveCircuitNrc;
      circuitCostMrc = totalCircuits * effectiveCircuitMrc;
    }

    const otherCogs = revenue === 0
      ? 0
      : Math.max(min_non_circuit_cogs || 0, revenue * (cogs_pct_revenue || 0));
    const grossProfit = revenue - circuitCostNrc - circuitCostMrc - otherCogs;

    let opex = 0;
    if (i === 0) {
      opex = passingsAdded > 1 ? 5000 : 0;
    } else {
      const opexVariable = (passingsEnd * (opex_per_passing || 0)) + (subscribersEnd * (opex_per_sub || 0));
      opex = Math.max(opexVariable, min_monthly_opex || 0);
    }

    const ebitda = grossProfit - opex;

    const capexPerPassing = passingsAdded * (capex_per_passing || 0);
    const capexPerSubscriber = subscribersAdded * (install_cost_per_subscriber || 0);
    const capexBook = capexPerPassing + capexPerSubscriber;
    const projectCapex = -capexBook;
    const projectFcf = projectCapex + ebitda;

    const bbCash = i === 0 ? 0 : ebCashPrev;
    const contribution = (bbCash + projectFcf) < 0 ? -(bbCash + projectFcf) : 0;
    let distribution = 0;
    if (monthNumber >= distributionStartMonth && projectFcf > 0) {
      const tentative = bbCash + projectFcf + contribution;
      if (tentative > distributionThreshold) {
        distribution = tentative - distributionThreshold;
      }
    }
    const ebCash = bbCash + projectFcf + contribution - distribution;

    const tier1 = -contribution;
    if (tier1 < 0) {
      cumulativeContribution += tier1 * contributionShare;
    }
    const cashOut = monthNumber === 1 ? cumulativeContribution : (cumulativeContribution - (monthly[i - 1]?.cumulative_contribution ?? 0));
    const cashIn = projectFcf > 0 ? projectFcf * blueprintShare : 0;

    monthly.push({
      month_number: monthNumber,
      passings_added: passingsAdded,
      passings: passingsEnd,
      subscribers_added: subscribersAdded,
      subscribers: subscribersEnd,
      revenue,
      circuit_count: totalCircuits,
      circuit_cost_nrc: circuitCostNrc,
      circuit_cost_mrc: circuitCostMrc,
      other_cogs: otherCogs,
      gross_profit: grossProfit,
      opex,
      ebitda,
      capex_book: capexBook,
      project_fcf: projectFcf,
      bb_cash: bbCash,
      contribution,
      distribution,
      eb_cash: ebCash,
      cumulative_contribution: cumulativeContribution,
      cash_out: cashOut,
      cash_in: cashIn,
      fcf: cashIn
    });

    cashOutflows.push(cashOut);
    cashInflows.push(cashIn);
    ebCashPrev = ebCash;
    totalCircuitsPrev = totalCircuits;
  }

  const terminalEbitda = monthly.slice(-12).reduce((sum, m) => sum + (m.ebitda || 0), 0);
  const terminalValueEbitda = terminalEbitda > 0 ? terminalEbitda * (ebitda_multiple || 0) : 0;
  const saleProceeds = terminalValueEbitda * blueprintShare;
  const endingCashShare = (monthly[monthly.length - 1]?.eb_cash || 0) * blueprintShare;
  if (monthly.length) {
    monthly[monthly.length - 1].fcf = (monthly[monthly.length - 1].fcf || 0) + saleProceeds;
  }

  const cashflows = monthly.map((m, idx) => {
    if (idx === 0) return (m.cash_out + m.cash_in - 0.01);
    if (idx === monthly.length - 1) return m.cash_out + saleProceeds + endingCashShare;
    return m.cash_out + m.cash_in;
  });

  const startDate = start_date ? new Date(start_date) : new Date('2025-01-31');
  const dates = buildEomonthDates(startDate, months);
  const irrResult = computeXirr(cashflows, dates);
  const irrAnnualPct = irrResult.rate != null ? Number((irrResult.rate * 100).toFixed(2)) : null;

  const cashInvested = -cashOutflows.reduce((sum, v) => sum + v, 0);
  const cashReturned = cashInflows.reduce((sum, v) => sum + v, 0) + saleProceeds;
  const moic = cashInvested > 0 ? Number((cashReturned / cashInvested).toFixed(2)) : null;

  const discountRate = (discount_rate_pct || 10) / 100;
  const npv = computeXirr(cashflows, dates).rate == null
    ? null
    : cashflows.reduce((sum, cf, idx) => {
      const t = (dates[idx].getTime() - dates[0].getTime()) / (365 * 24 * 60 * 60 * 1000);
      return sum + cf / Math.pow(1 + discountRate, t);
    }, 0);

  const peakSubscribers = Math.max(...monthly.map((m) => m.subscribers || 0));
  const peakEbitda = Math.max(...monthly.map((m) => m.ebitda || 0));
  const totalCapexBook = monthly.reduce((sum, m) => sum + (m.capex_book || 0), 0);
  const peakExternalCash = Math.max(...monthly.map((m) => -(m.cumulative_contribution || 0)));

  return {
    monthly,
    metrics: {
      total_capex_book: Math.round(totalCapexBook),
      actual_cash_invested: Math.round(cashInvested),
      peak_external_cash: Math.round(peakExternalCash),
      npv: npv != null ? Math.round(npv) : null,
      irr_monthly_decimal: null,
      irr_annual_pct: irrAnnualPct,
      irr_status: irrResult.status,
      irr_reason: irrResult.reason,
      moic,
      moic_status: moic != null ? 'defined' : 'not_defined',
      peak_subscribers: Math.round(peakSubscribers),
      peak_monthly_ebitda: Math.round(peakEbitda),
      terminal_value: Math.round(terminalValueEbitda),
      terminal_value_ebitda: Math.round(terminalValueEbitda),
      terminal_value_method: 'ebitda',
      model_profile: normalizedProfile,
      cash_returned: Math.round(cashReturned)
    },
    metric_explanations: []
  };
}

function runFinancialModel(assumptions) {
  const months = assumptions.analysis_months || 120;
  const monthly = [];

  const {
    passings,
    build_months,
    total_capex,
    arpu_start = 63,
    penetration_start_pct = 0.10,
    penetration_target_pct = 0.40,
    ramp_months = 36,
    capex_per_passing = 1200,
    opex_per_sub = 25,
    discount_rate_pct = 10,
    subscription_months,
    subscription_rate,
    subscription_start_delay_months,
    install_cost_per_subscriber = 0,
    opex_per_passing = 0,
    min_monthly_opex = 0,
    cogs_pct_revenue = 0,
    min_non_circuit_cogs = 0,
    circuit = false,
    circuit_type = 1,
    circuit_nrc,
    circuit_mrc,
    circuit_sub_threshold,
    ebitda_multiple = 15,
    startup_opex = 0,
    model_profile,
    terminal_value_method,
    terminal_value_weight,
    per_subscriber_terminal_value
  } = assumptions;

  const normalizeRate = (value, fallback) => {
    if (value === null || value === undefined) return fallback;
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return num > 1 ? num / 100 : num;
  };

  const normalizedProfile = normalizeModelProfileKey(model_profile);
  const profileKey = normalizedProfile || 'standard';
  const isDeveloperTemplate = DEVELOPER_TEMPLATE_PROFILE_ALIASES.has(profileKey);
  if (isDeveloperTemplate) {
    return runDeveloperTemplateModel({ ...assumptions, model_profile: profileKey });
  }
  const effectiveSubscriptionDelay = subscription_start_delay_months != null
    ? subscription_start_delay_months
    : (isDeveloperTemplate ? 0 : 6);

  const effectiveSubscriptionRate = normalizeRate(subscription_rate, penetration_target_pct ?? 0.4);
  const effectiveSubscriptionMonths = subscription_months || ramp_months || 36;

  const circuitDefaults = {
    1: { nrc: 0, mrc: 1300, threshold: 100 },
    2: { nrc: 0, mrc: 2400, threshold: 200 },
    5: { nrc: 0, mrc: 3500, threshold: 500 },
    10: { nrc: 0, mrc: 5000, threshold: 1000 }
  };
  const circuitConfig = circuitDefaults[circuit_type] || circuitDefaults[1];
  const effectiveCircuitNrc = circuit_nrc ?? circuitConfig.nrc;
  const effectiveCircuitMrc = circuit_mrc ?? circuitConfig.mrc;
  const effectiveCircuitThreshold = circuit_sub_threshold ?? circuitConfig.threshold;

  const total_capex_book = total_capex || (
    (passings || 0) * (capex_per_passing || 0) +
    (passings || 0) * effectiveSubscriptionRate * (install_cost_per_subscriber || 0)
  );
  const monthly_rate = discount_rate_pct / 100 / 12;

  if (total_capex_book <= 0 || !passings) {
    return {
      monthly: [],
      metrics: {
        total_capex_book: 0,
        actual_cash_invested: 0,
        peak_external_cash: 0,
        npv: null,
        irr: null,
        irr_status: 'not_defined_no_investment',
        moic: null,
        moic_status: 'not_defined_no_investment',
        peak_subscribers: 0,
        peak_monthly_ebitda: 0,
        terminal_value: 0
      },
      metric_explanations: []
    };
  }

  const monthly_capex_schedule = total_capex_book / (build_months || 1);
  let cumulative_external_cash = 0;
  let peak_external_cash = 0;
  let passings_end = 0;
  let subscribers_end = 0;
  let totalCircuitsPrev = 0;

  const passings_add_per_month = build_months ? (passings / build_months) : 0;
  const totalSubscribersTarget = passings * effectiveSubscriptionRate;
  const subscribers_add_per_month = effectiveSubscriptionMonths ? (totalSubscribersTarget / effectiveSubscriptionMonths) : 0;

  for (let month = 1; month <= months; month += 1) {
    const passings_added = month <= build_months ? passings_add_per_month : 0;
    passings_end = Math.min(passings, passings_end + passings_added);

    let subscribers_added = 0;
    if (month > effectiveSubscriptionDelay && subscribers_end < totalSubscribersTarget) {
      subscribers_added = Math.min(subscribers_add_per_month, totalSubscribersTarget - subscribers_end);
    }
    subscribers_end = Math.min(totalSubscribersTarget, subscribers_end + subscribers_added);

    const penetration = passings_end > 0 ? subscribers_end / passings_end : 0;
    const revenue = subscribers_end * arpu_start;

    let totalCircuits = 0;
    let circuit_cost_nrc = 0;
    let circuit_cost_mrc = 0;

    if (circuit) {
      const firstCircuit = subscribers_end > 0 ? 1 : 0;
      const additionalCircuits = subscribers_end >= effectiveCircuitThreshold
        ? Math.floor(subscribers_end / effectiveCircuitThreshold)
        : 0;
      totalCircuits = firstCircuit + additionalCircuits;
      const circuitAdditions = totalCircuits - totalCircuitsPrev;
      circuit_cost_nrc = circuitAdditions * effectiveCircuitNrc;
      circuit_cost_mrc = totalCircuits * effectiveCircuitMrc;
    }

    const other_cogs = revenue > 0
      ? Math.max(min_non_circuit_cogs || 0, revenue * (cogs_pct_revenue || 0))
      : 0;

    const gross_profit = revenue - circuit_cost_nrc - circuit_cost_mrc - other_cogs;
    const opex_variable = (passings_end * (opex_per_passing || 0)) + (subscribers_end * (opex_per_sub || 0));
    const opex_base = Math.max(min_monthly_opex || 0, opex_variable);
    const opex = (month === 1 ? startup_opex : 0) + opex_base;
    const ebitda = gross_profit - opex;

    const useDetailCapex = (capex_per_passing || install_cost_per_subscriber) && passings;
    const capex_book = useDetailCapex
      ? (passings_added * (capex_per_passing || 0)) + (subscribers_added * (install_cost_per_subscriber || 0))
      : (month <= build_months ? monthly_capex_schedule : 0);

    let external_cash_this_month = 0;
    if (ebitda < 0) {
      external_cash_this_month = capex_book - ebitda;
    } else {
      external_cash_this_month = Math.max(0, capex_book - ebitda);
    }

    cumulative_external_cash += external_cash_this_month;
    peak_external_cash = Math.max(peak_external_cash, cumulative_external_cash);

    const fcf = ebitda - capex_book;
    const discountFactor = Math.pow(1 + monthly_rate, -month);
    const pv = fcf * discountFactor;

    const date = new Date();
    date.setMonth(date.getMonth() + month);

    monthly.push({
      date: date.toISOString().split('T')[0],
      month_number: month,
      passings_added: passings_added.toFixed(2),
      passings: passings_end.toFixed(2),
      subscribers_added: subscribers_added.toFixed(2),
      subscribers: subscribers_end.toFixed(2),
      penetration_pct: (penetration * 100).toFixed(2),
      arpu: arpu_start.toFixed(2),
      revenue: revenue.toFixed(2),
      circuit_count: totalCircuits,
      circuit_cost_nrc: circuit_cost_nrc.toFixed(2),
      circuit_cost_mrc: circuit_cost_mrc.toFixed(2),
      other_cogs: other_cogs.toFixed(2),
      gross_profit: gross_profit.toFixed(2),
      opex: opex.toFixed(2),
      ebitda: ebitda.toFixed(2),
      capex_book: capex_book.toFixed(2),
      external_cash_this_month: external_cash_this_month.toFixed(2),
      cumulative_external_cash: cumulative_external_cash.toFixed(2),
      fcf: fcf.toFixed(2),
      pv: pv.toFixed(2)
    });

    totalCircuitsPrev = totalCircuits;
  }

  const actual_cash_invested = peak_external_cash;

  const terminalEbitda = monthly.slice(-12).reduce((sum, m) => sum + parseFloat(m.ebitda), 0);
  const terminalValueEbitda = terminalEbitda > 0 ? terminalEbitda * (ebitda_multiple || 0) : 0;
  const terminalSubscriberValue = per_subscriber_terminal_value != null
    ? per_subscriber_terminal_value
    : (isDeveloperTemplate ? 10000 : 0);
  const terminalValueSubscribers = terminalSubscriberValue && subscribers_end
    ? subscribers_end * terminalSubscriberValue
    : 0;
  const terminalMethod = String(terminal_value_method || (isDeveloperTemplate ? 'blended' : 'ebitda')).toLowerCase();
  const terminalWeight = terminal_value_weight != null ? terminal_value_weight : 0.5;
  let terminal_value = terminalValueEbitda;
  if (terminalMethod === 'subscriber') {
    terminal_value = terminalValueSubscribers;
  } else if (terminalMethod === 'blended') {
    terminal_value = (terminalValueEbitda * terminalWeight) + (terminalValueSubscribers * (1 - terminalWeight));
  }
  if (monthly.length) {
    const last = monthly[monthly.length - 1];
    last.terminal_value = terminal_value.toFixed(2);
    last.terminal_value_ebitda = terminalValueEbitda.toFixed(2);
    last.terminal_value_subscriber = terminalValueSubscribers.toFixed(2);
    const fcfWithTerminal = parseFloat(last.fcf) + terminal_value;
    last.fcf_with_terminal = fcfWithTerminal.toFixed(2);
    const pvWithTerminal = fcfWithTerminal * Math.pow(1 + monthly_rate, -months);
    last.pv_with_terminal = pvWithTerminal.toFixed(2);
  }

  const npv = monthly.reduce((sum, m) => sum + parseFloat(m.pv), -actual_cash_invested) +
    (terminal_value * Math.pow(1 + monthly_rate, -months));

  let irr_monthly_decimal = null;
  let irrStatus = 'converged';
  let irrReason = null;
  let irrDebug = null;
  const cashflows = [-actual_cash_invested, ...monthly.map((m, idx) => {
    const base = parseFloat(m.fcf);
    if (idx === monthly.length - 1) return base + terminal_value;
    return base;
  })];
  const minCF = Math.min(...cashflows);
  const maxCF = Math.max(...cashflows);
  const hasSignChange = minCF < 0 && maxCF > 0;

  if (actual_cash_invested <= 0) {
    irrStatus = 'no_investment';
    irrReason = 'Actual cash invested is zero or negative';
  } else if (!hasSignChange) {
    irrStatus = 'no_sign_change';
    irrReason = 'No sign change in cashflow sequence - IRR does not exist';
  } else {
    const testNPV = (rate) => {
      let npvVal = -actual_cash_invested;
      monthly.forEach((m, idx) => {
        const fcfVal = parseFloat(m.fcf) + (idx === monthly.length - 1 ? terminal_value : 0);
        npvVal += fcfVal / Math.pow(1 + rate, idx + 1);
      });
      return npvVal;
    };

    const npvAtNeg95 = testNPV(-0.95);
    const npvAtPos300 = testNPV(3.0);

    if (npvAtNeg95 * npvAtPos300 > 0) {
      irrStatus = 'no_root_in_range';
      irrReason = 'No IRR solution found in range [-95%, +300%] monthly';
      irrDebug = { npv_at_neg95: npvAtNeg95.toFixed(2), npv_at_pos300: npvAtPos300.toFixed(2) };
    } else {
      let rate = 0.10;
      let irrConverged = false;
      let iterations = 0;
      let lastNPV = 0;
      let lastDerivative = 0;

      for (let i = 0; i < 50; i += 1) {
        iterations = i + 1;
        let npvAtRate = -actual_cash_invested;
        let derivative = 0;

        monthly.forEach((m, idx) => {
          const factor = Math.pow(1 + rate, -(idx + 1));
          const fcfVal = parseFloat(m.fcf) + (idx === monthly.length - 1 ? terminal_value : 0);
          npvAtRate += fcfVal * factor;
          derivative -= (idx + 1) * fcfVal * factor / (1 + rate);
        });

        lastNPV = npvAtRate;
        lastDerivative = derivative;

        if (Math.abs(npvAtRate) < 0.001) {
          irr_monthly_decimal = rate;
          irrConverged = true;
          break;
        }

        if (Math.abs(derivative) < 1e-10) {
          irrStatus = 'derivative_too_small';
          irrReason = 'Newton-Raphson derivative too small to continue';
          break;
        }

        const step = npvAtRate / derivative;
        rate = rate - step;
        if (rate < -0.95) rate = -0.95;
        if (rate > 3.0) rate = 3.0;

        if (Math.abs(step) < 1e-8) {
          irr_monthly_decimal = rate;
          irrConverged = true;
          break;
        }
      }

      if (!irrConverged && irrStatus === 'converged') {
        let low = -0.95;
        let high = 3.0;
        for (let i = 0; i < 100; i += 1) {
          iterations += 1;
          const mid = (low + high) / 2;
          const npvMid = testNPV(mid);
          if (Math.abs(npvMid) < 0.001) {
            irr_monthly_decimal = mid;
            irrConverged = true;
            break;
          }
          const npvLow = testNPV(low);
          if (npvLow * npvMid < 0) {
            high = mid;
          } else {
            low = mid;
          }
          if (Math.abs(high - low) < 1e-7) {
            irr_monthly_decimal = mid;
            irrConverged = true;
            break;
          }
        }
      }

      if (!irrConverged && irrStatus === 'converged') {
        irrStatus = 'did_not_converge';
        irrReason = `Solver failed to converge after ${iterations} iterations`;
        irrDebug = {
          iterations,
          last_rate_monthly: rate.toFixed(6),
          npv_at_last_rate: lastNPV.toFixed(2),
          derivative_at_last_rate: lastDerivative.toFixed(2),
          min_cashflow: minCF.toFixed(2),
          max_cashflow: maxCF.toFixed(2),
          has_sign_change: hasSignChange
        };
      }
    }
  }

  const distributed_sum_pos_fcf = monthly.reduce((sum, m, idx) => {
    const fcfVal = parseFloat(m.fcf) + (idx === monthly.length - 1 ? terminal_value : 0);
    return sum + Math.max(0, fcfVal);
  }, 0);
  const paid_in = actual_cash_invested;
  let moic = null;
  let moicStatus = 'defined';
  let moicReason = null;

  if (paid_in <= 0) {
    moicStatus = 'not_defined';
    moicReason = 'No external investment required';
  } else if (distributed_sum_pos_fcf <= 0) {
    moicStatus = 'not_defined';
    moicReason = 'No positive cashflows over modeled horizon';
  } else {
    moic = distributed_sum_pos_fcf / paid_in;
  }

  const fcfValues = monthly.map((m) => parseFloat(m.fcf));
  const min_fcf = Math.min(...fcfValues);
  const max_fcf = Math.max(...fcfValues);
  const count_pos_fcf_months = fcfValues.filter((f) => f > 0).length;
  const count_neg_fcf_months = fcfValues.filter((f) => f < 0).length;

  const peakSubscribers = Math.max(...monthly.map((m) => parseFloat(m.subscribers)));
  const peakEbitda = Math.max(...monthly.map((m) => parseFloat(m.ebitda)));

  const irr_annual_pct = irr_monthly_decimal !== null
    ? ((Math.pow(1 + irr_monthly_decimal, 12) - 1) * 100)
    : null;

  const metrics = {
    total_capex_book: Math.round(total_capex_book),
    actual_cash_invested: Math.round(actual_cash_invested),
    peak_external_cash: Math.round(peak_external_cash),
    npv: Math.round(npv),
    npv_color: classifyNPV(npv, actual_cash_invested),
    irr_monthly_decimal: irr_monthly_decimal !== null ? parseFloat(irr_monthly_decimal.toFixed(6)) : null,
    irr_annual_pct: irr_annual_pct !== null ? parseFloat(irr_annual_pct.toFixed(2)) : null,
    irr_status: irrStatus,
    irr_reason: irrReason,
    irr_debug: irrDebug,
    moic: moic !== null ? parseFloat(moic.toFixed(2)) : null,
    moic_status: moicStatus,
    moic_reason: moicReason,
    peak_subscribers: Math.round(peakSubscribers),
    peak_monthly_ebitda: Math.round(peakEbitda),
    min_fcf: Math.round(min_fcf),
    max_fcf: Math.round(max_fcf),
    count_pos_fcf_months,
    count_neg_fcf_months,
    terminal_value: Math.round(terminal_value),
    terminal_ebitda: Math.round(terminalEbitda),
    terminal_value_ebitda: Math.round(terminalValueEbitda),
    terminal_value_subscriber: Math.round(terminalValueSubscribers),
    terminal_value_method: terminalMethod,
    terminal_value_weight: terminalMethod === 'blended' ? terminalWeight : null,
    model_profile: profileKey,
    subscription_start_delay_months: effectiveSubscriptionDelay
  };

  const metric_explanations = [];
  if (irrStatus !== 'converged') {
    metric_explanations.push(`IRR not computed: ${irrReason || irrStatus}`);
  }
  if (moicStatus !== 'defined') {
    metric_explanations.push(`MOIC not computed: ${moicReason || moicStatus}`);
  }

  return { monthly, metrics, metric_explanations };
}

async function loadScenariosRegistry(projectId) {
  const key = `raw/projects_pipeline/model_outputs/${projectId}/scenarios.json`;
  try {
    const content = await readS3Text('gwi-raw-us-east-2-pc', key);
    return JSON.parse(content);
  } catch (err) {
    if (err?.code === 'NoSuchKey' || err?.code === 'NotFound') {
      return { project_id: projectId, scenarios: [] };
    }
    throw err;
  }
}

async function saveScenariosRegistry(projectId, registry) {
  const key = `raw/projects_pipeline/model_outputs/${projectId}/scenarios.json`;
  await writeS3Json('gwi-raw-us-east-2-pc', key, registry);
  return key;
}

function upsertScenario(registry, scenario) {
  const existingIndex = registry.scenarios.findIndex((s) => s.scenario_id === scenario.scenario_id);
  if (existingIndex >= 0) {
    registry.scenarios[existingIndex] = {
      ...registry.scenarios[existingIndex],
      ...scenario,
      updated_at: new Date().toISOString()
    };
  } else {
    registry.scenarios.push({
      ...scenario,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  return registry;
}

function formatMondayValue(field, value) {
  if (value === null || value === undefined || value === '') return null;
  const asString = String(value);
  const dateFields = new Set(['contract_date', 'start_date', 'end_date', 'due_date']);
  const statusFields = new Set(['stage', 'priority', 'circuit']);
  const dropdownFields = new Set(['module_type']);
  const booleanFields = new Set(['sync_to_aws']);

  if (dateFields.has(field)) {
    return { date: asString };
  }
  if (statusFields.has(field)) {
    if (field === 'circuit' && typeof value === 'boolean') {
      return { checked: String(value) };
    }
    return { label: asString };
  }
  if (dropdownFields.has(field)) {
    return { labels: [asString] };
  }
  if (booleanFields.has(field)) {
    return { checked: String(Boolean(value)) };
  }
  return asString;
}

function normalizeStageValue(value) {
  if (!value) return value;
  const normalized = String(value).trim().toLowerCase();
  const map = {
    'term sheet / nda': 'Term Sheet',
    'term sheet': 'Term Sheet',
    'project discussion': 'Project Discussion',
    'contract discussion': 'Contract Discussion',
    'final docs': 'Final Docs',
    'final documents': 'Final Docs',
    'final documents negotiation': 'Final Docs',
    'signed': 'Signed'
  };
  return map[normalized] || value;
}

function buildMondayUpdatesFromProject(project, mapping, mode = 'editable') {
  if (!mapping?.field_map || !project) return {};
  const fieldMap = mapping.field_map || {};
  const editableFields = new Set(mapping.editable_fields_monday_to_aws || []);
  const forceFields = new Set(['project_id', 'module_type', 'sync_to_aws']);
  const columnsByTitle = mapping.columns_by_title || {};

  const resolveColumnId = (field) => {
    const direct = fieldMap[field];
    if (direct) return direct;
    const title = MONDAY_FIELD_TITLES[field];
    if (!title) return null;
    return columnsByTitle[title.toLowerCase()] || null;
  };

  const updates = {};
  Object.keys({ ...fieldMap, ...MONDAY_FIELD_TITLES }).forEach((field) => {
    const columnId = resolveColumnId(field);
    if (!columnId) return;
    const isEditable = editableFields.has(field);
    const isForced = forceFields.has(field);
    if (mode === 'editable' && !isEditable && !isForced) return;

    let value = project[field];
    if ((value === undefined || value === null || value === '') && field === 'module_type') {
      value = mapping?.sync_filter?.module_type_value || 'Project Pipeline';
    }
    if ((value === undefined || value === null || value === '') && field === 'sync_to_aws') {
      value = true;
    }
    if (field === 'stage') {
      value = normalizeStageValue(value);
    }
    if (value === undefined || value === null || value === '') return;
    const formatted = formatMondayValue(field, value);
    if (formatted === null) return;
    updates[columnId] = formatted;
  });

  return updates;
}

function withMondayColumns(mapping, mondayConfig) {
  if (!mapping) return mapping;
  if (mapping.columns_by_title) return mapping;
  return { ...mapping, columns_by_title: mondayConfig?.columns_by_title || {} };
}

async function findMondayItemByProjectId(boardId, projectId, mapping, token) {
  if (!boardId || !projectId || !mapping?.field_map?.project_id) return null;
  const columnId = mapping.field_map.project_id;
  const query = `query { items_page_by_column_values(board_id: ${boardId}, columns: [{column_id: "${columnId}", column_values: ["${escapeGraphQLString(projectId)}"]}], limit: 1) { items { id name } } }`;
  const data = await mondayGraphQL({ query, token });
  const item = data?.data?.items_page_by_column_values?.items?.[0];
  return item || null;
}

async function getMondayBoardColumns(boardId, token) {
  if (!boardId) return [];
  const query = `query { boards(ids: [${boardId}]) { columns { id title type settings_str } } }`;
  const data = await mondayGraphQL({ query, token });
  return data?.data?.boards?.[0]?.columns || [];
}

function parseMondaySettings(settingsStr) {
  if (!settingsStr) return null;
  try {
    return JSON.parse(settingsStr);
  } catch (_) {
    return null;
  }
}

async function getSubitemsBoardId(parentBoardId, token) {
  if (!parentBoardId) return null;
  const columns = await getMondayBoardColumns(parentBoardId, token);
  const subitemsCol = columns.find((col) => col.type === 'subtasks');
  const settings = parseMondaySettings(subitemsCol?.settings_str);
  const boardId = settings?.boardIds?.[0];
  return boardId ? String(boardId) : null;
}

function buildColumnIdMapByTitle(columns) {
  const map = {};
  (columns || []).forEach((col) => {
    if (col?.title && col?.id) {
      map[col.title.trim().toLowerCase()] = col.id;
    }
  });
  return map;
}

function buildColumnValueMapByTitle(columnValues) {
  const map = {};
  (columnValues || []).forEach((cv) => {
    const title = cv?.column?.title;
    if (title) {
      map[title.trim().toLowerCase()] = cv;
    }
  });
  return map;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(String(value).replace(/,/g, ''));
  return Number.isNaN(num) ? null : num;
}

function normalizePercent(value) {
  const num = parseNumber(value);
  if (num === null) return null;
  return num > 1 ? num / 100 : num;
}

const BASELINE_REQUIRED_INPUTS = [
  'passings',
  'build_months',
  'arpu_start',
  'subscription_rate',
  'subscription_months',
  'capex_per_passing',
  'opex_per_sub'
];
const BASELINE_DEFAULT_ASSUMPTIONS = {
  passings: 1000,
  build_months: 24,
  arpu_start: 63,
  subscription_rate: 0.4,
  subscription_months: 36,
  capex_per_passing: 1200,
  install_cost_per_subscriber: 0,
  opex_per_sub: 25
};
const BASELINE_PROFILE_DEFAULT_ASSUMPTIONS = {
  standard: {},
  developer_template_2_9_26: {
    subscription_rate: 0.4,
    subscription_months: 36,
    capex_per_passing: 1200,
    install_cost_per_subscriber: 0,
    opex_per_sub: 25,
    ebitda_multiple: 15
  },
  horton: {
    subscription_rate: 0.4,
    subscription_months: 36,
    capex_per_passing: 1200,
    install_cost_per_subscriber: 0,
    opex_per_sub: 25,
    ebitda_multiple: 15
  },
  acme: {
    subscription_rate: 0.4,
    subscription_months: 36,
    capex_per_passing: 1200,
    install_cost_per_subscriber: 0,
    opex_per_sub: 25,
    ebitda_multiple: 15
  }
};
const DEVELOPER_TEMPLATE_PROFILE_ALIASES = new Set([
  'developer_template_2_9_26',
  'developer_template',
  'exec_dashboard',
  'horton',
  'acme'
]);
const BASELINE_DEFAULT_TITLES = {
  passings: 'Passings',
  build_months: 'Months to Completion',
  arpu_start: 'ARPU',
  subscription_rate: 'Subscription Rate',
  subscription_months: 'Subscription Months',
  capex_per_passing: 'Capex per Passing',
  install_cost_per_subscriber: 'Install Cost per Subscriber',
  opex_per_sub: 'opex_per_sub'
};

function normalizeModelProfileKey(profile) {
  const normalized = String(profile || '').trim().toLowerCase();
  if (!normalized) return 'standard';
  if (DEVELOPER_TEMPLATE_PROFILE_ALIASES.has(normalized)) return normalized;
  if (normalized.includes('horton')) return 'horton';
  if (normalized.includes('acme')) return 'acme';
  if (normalized.includes('developer_template') || normalized.includes('exec_dashboard')) {
    return 'developer_template_2_9_26';
  }
  return normalized;
}

function getBaselineDefaultsForProfile(profile) {
  const key = normalizeModelProfileKey(profile);
  const profileDefaults = BASELINE_PROFILE_DEFAULT_ASSUMPTIONS[key] || {};
  return { ...BASELINE_DEFAULT_ASSUMPTIONS, ...profileDefaults };
}

function computeBaselineInputsFromColumnMap(colMap) {
  const getText = (title) => colMap[title.toLowerCase()]?.text ?? null;

  const passings = parseNumber(getText('Passings'));
  const subscribers = parseNumber(getText('Subscribers'));
  const arpuStart = parseNumber(getText('ARPU'));
  const buildMonths = parseNumber(getText('Months to Completion'));
  const investment = parseNumber(getText('Investment'));
  const constructionCost = parseNumber(getText('Construction Cost'));
  const installCost = parseNumber(getText('Install Cost'));
  const constructionPlusInstall = parseNumber(getText('Construction + Install Cost'));
  const totalCostPerPassing = parseNumber(getText('Total Cost per Passing'));
  const constructionCostPerPassing = parseNumber(getText('Construction Cost per Passing'));
  const capexPerPassingInput = parseNumber(getText('Capex per Passing'));
  const installCostPerSubscriber = parseNumber(getText('Install Cost per Subscriber'));
  const opexPerSub = parseNumber(getText('opex_per_sub'));
  const opexPerPassing = parseNumber(getText('Monthly Opex per Passing'));
  const minMonthlyOpex = parseNumber(getText('Min Monthly Opex'));
  const cogsPctRevenue = normalizePercent(getText('Monthly Avg - COGS % of Revenue'));
  const minNonCircuitCogs = parseNumber(getText('Monthly Minimum - Non Circuit COGS'));
  const circuitRaw = getText('Circuit (Yes or No)') ?? getText('Circuit');
  const circuitType = parseNumber(getText('Circuit Type'));
  const ebitdaMultiple = parseNumber(getText('EBITDA Multiple Method'));
  const discountRatePct = parseNumber(getText('discount_rate_pct'));
  const penetrationStartPct = normalizePercent(getText('penetration_start_pct'));
  let penetrationTargetPct = normalizePercent(getText('penetration_target_pct'));
  const rampMonths = parseNumber(getText('ramp_months'));
  const subscriptionMonths = parseNumber(getText('Subscription Months'));
  const subscriptionRate = normalizePercent(getText('Subscription Rate'));

  let totalCapex = investment || constructionPlusInstall;
  if (!totalCapex && constructionCost !== null && installCost !== null) {
    totalCapex = constructionCost + installCost;
  }

  let capexPerPassing = capexPerPassingInput || constructionCostPerPassing || totalCostPerPassing || null;
  if (!capexPerPassing && totalCapex && passings) {
    capexPerPassing = totalCapex / passings;
  }
  if (!totalCapex && capexPerPassing && passings) {
    totalCapex = capexPerPassing * passings;
  }

  if ((penetrationTargetPct === null || penetrationTargetPct === undefined) && subscribers !== null && passings) {
    penetrationTargetPct = subscribers / passings;
  }

  return {
    inputs: {
      passings: passings || null,
      build_months: buildMonths || null,
      total_capex: totalCapex || null,
      arpu_start: arpuStart || null,
      penetration_start_pct: penetrationStartPct ?? null,
      penetration_target_pct: penetrationTargetPct ?? null,
      ramp_months: rampMonths || null,
      subscription_months: subscriptionMonths || null,
      subscription_rate: subscriptionRate ?? null,
      capex_per_passing: capexPerPassing || null,
      install_cost_per_subscriber: installCostPerSubscriber || null,
      opex_per_sub: opexPerSub || null,
      opex_per_passing: opexPerPassing || null,
      min_monthly_opex: minMonthlyOpex || null,
      cogs_pct_revenue: cogsPctRevenue ?? null,
      min_non_circuit_cogs: minNonCircuitCogs || null,
      circuit: circuitRaw || null,
      circuit_type: circuitType || null,
      ebitda_multiple: ebitdaMultiple || null,
      discount_rate_pct: discountRatePct || null,
      analysis_months: 120
    },
    derived: {
      passings,
      subscribers,
      arpuStart,
      buildMonths,
      totalCapex,
      capexPerPassing,
      penetrationTargetPct,
      constructionCost,
      installCost
    }
  };
}

function applyBaselineDefaults(inputs, derived, options = {}) {
  const applyAssumptions = options.applyAssumptions !== false;
  const normalized = { ...inputs };
  if (!normalized.passings && derived?.passings) normalized.passings = derived.passings;
  if (!normalized.build_months && derived?.buildMonths) normalized.build_months = derived.buildMonths;
  if (!normalized.total_capex && derived?.totalCapex) normalized.total_capex = derived.totalCapex;
  if (!normalized.arpu_start && derived?.arpuStart) normalized.arpu_start = derived.arpuStart;
  if ((normalized.arpu_start === null || normalized.arpu_start === undefined) && applyAssumptions) {
    normalized.arpu_start = 63;
  }
  if ((normalized.penetration_start_pct === null || normalized.penetration_start_pct === undefined) && applyAssumptions) {
    normalized.penetration_start_pct = 0.1;
  }
  if ((normalized.penetration_target_pct === null || normalized.penetration_target_pct === undefined) && applyAssumptions) {
    normalized.penetration_target_pct = derived?.penetrationTargetPct ?? 0.4;
  }
  if ((normalized.subscription_rate === null || normalized.subscription_rate === undefined) && applyAssumptions) {
    normalized.subscription_rate = normalized.penetration_target_pct ?? 0.4;
  }
  if (normalized.subscription_rate !== null && normalized.subscription_rate !== undefined && normalized.subscription_rate > 1) {
    normalized.subscription_rate = normalized.subscription_rate / 100;
  }
  if ((normalized.ramp_months === null || normalized.ramp_months === undefined) && applyAssumptions) {
    normalized.ramp_months = 36;
  }
  if ((normalized.subscription_months === null || normalized.subscription_months === undefined) && applyAssumptions) {
    normalized.subscription_months = normalized.ramp_months || 36;
  }
  if (normalized.capex_per_passing === null || normalized.capex_per_passing === undefined) {
    if (normalized.total_capex && normalized.passings) {
      normalized.capex_per_passing = normalized.total_capex / normalized.passings;
    } else if (applyAssumptions) {
      normalized.capex_per_passing = 1200;
    }
  }
  if ((normalized.install_cost_per_subscriber === null || normalized.install_cost_per_subscriber === undefined) && applyAssumptions) {
    normalized.install_cost_per_subscriber = 0;
  }
  if ((normalized.opex_per_sub === null || normalized.opex_per_sub === undefined) && applyAssumptions) {
    normalized.opex_per_sub = 25;
  }
  if ((normalized.opex_per_passing === null || normalized.opex_per_passing === undefined) && applyAssumptions) {
    normalized.opex_per_passing = 0;
  }
  if ((normalized.min_monthly_opex === null || normalized.min_monthly_opex === undefined) && applyAssumptions) {
    normalized.min_monthly_opex = 0;
  }
  if ((normalized.cogs_pct_revenue === null || normalized.cogs_pct_revenue === undefined) && applyAssumptions) {
    normalized.cogs_pct_revenue = 0;
  }
  if (normalized.cogs_pct_revenue !== null && normalized.cogs_pct_revenue !== undefined && normalized.cogs_pct_revenue > 1) {
    normalized.cogs_pct_revenue = normalized.cogs_pct_revenue / 100;
  }
  if ((normalized.min_non_circuit_cogs === null || normalized.min_non_circuit_cogs === undefined) && applyAssumptions) {
    normalized.min_non_circuit_cogs = 0;
  }
  if ((normalized.circuit === null || normalized.circuit === undefined || normalized.circuit === '') && applyAssumptions) {
    normalized.circuit = false;
  }
  if (typeof normalized.circuit === 'string') {
    normalized.circuit = ['yes', 'true', '1', 'y'].includes(normalized.circuit.trim().toLowerCase());
  }
  if ((normalized.circuit_type === null || normalized.circuit_type === undefined) && applyAssumptions) {
    normalized.circuit_type = 1;
  }
  if ((normalized.ebitda_multiple === null || normalized.ebitda_multiple === undefined) && applyAssumptions) {
    normalized.ebitda_multiple = 15;
  }
  if ((normalized.discount_rate_pct === null || normalized.discount_rate_pct === undefined) && applyAssumptions) {
    normalized.discount_rate_pct = 10;
  }
  if (!normalized.analysis_months) normalized.analysis_months = 120;

  if (!normalized.total_capex && normalized.passings && normalized.capex_per_passing) {
    const subscriberTarget = normalized.subscription_rate ? normalized.passings * normalized.subscription_rate : 0;
    const capexFromPassing = normalized.passings * normalized.capex_per_passing;
    const capexFromInstall = normalized.install_cost_per_subscriber ? subscriberTarget * normalized.install_cost_per_subscriber : 0;
    const derivedTotal = capexFromPassing + capexFromInstall;
    if (derivedTotal) normalized.total_capex = derivedTotal;
  }

  return normalized;
}

function listMissingBaselineInputs(inputs) {
  const missing = [];
  const hasPositive = (value) => value !== null && value !== undefined && Number(value) > 0;

  if (!hasPositive(inputs.passings)) missing.push('passings');
  if (!hasPositive(inputs.build_months)) missing.push('build_months');
  if (!hasPositive(inputs.arpu_start)) missing.push('arpu_start');
  if (!hasPositive(inputs.capex_per_passing) && !hasPositive(inputs.total_capex)) {
    missing.push('capex_per_passing');
  }
  if (!hasPositive(inputs.opex_per_sub)) missing.push('opex_per_sub');

  const hasSubscriptionRate = hasPositive(inputs.subscription_rate) || hasPositive(inputs.penetration_target_pct);
  if (!hasSubscriptionRate) missing.push('subscription_rate');

  const hasSubscriptionMonths = hasPositive(inputs.subscription_months) || hasPositive(inputs.ramp_months);
  if (!hasSubscriptionMonths) missing.push('subscription_months');

  return missing;
}

function applyExplicitDefaults(inputs, defaults) {
  const updated = { ...inputs };
  const defaultsUsed = {};
  Object.entries(defaults || {}).forEach(([key, value]) => {
    const current = updated[key];
    if (current === null || current === undefined || current === '' || current <= 0) {
      updated[key] = value;
      const title = BASELINE_DEFAULT_TITLES[key] || key;
      defaultsUsed[title] = value;
    }
  });
  return { inputs: updated, defaultsUsed };
}

function buildSuggestedDefaults(rawInputs, derived, defaults = BASELINE_DEFAULT_ASSUMPTIONS) {
  const suggested = applyBaselineDefaults({ ...rawInputs }, { ...derived }, { applyAssumptions: true });
  const suggestions = {};
  Object.entries(defaults || {}).forEach(([key, value]) => {
    const current = rawInputs?.[key];
    if (current === null || current === undefined || current === '' || current <= 0) {
      suggestions[key] = suggested[key] ?? value;
    }
  });
  return suggestions;
}

async function fetchLegacyDefaults(projectId) {
  if (!projectId) return null;
  const sql = `SELECT passings, months_to_completion, investment, construction_plus_install_cost, arpu, construction_cost, install_cost, total_cost_per_passing, construction_cost_per_passing FROM curated_core.projects_enriched WHERE project_id = ${escapeSqlValue(projectId)} LIMIT 1`;
  const { row } = await querySingleRow(sql);
  return row || null;
}

function applyLegacyDefaultsToInputs(inputs, derived, legacyRow) {
  if (!legacyRow) return { inputs, derived, defaultsUsed: {} };
  const defaultsUsed = {};
  const legacyPassings = parseNumber(legacyRow.passings);
  const legacyBuildMonths = parseNumber(legacyRow.months_to_completion);
  const legacyInvestment = parseNumber(legacyRow.investment);
  const legacyCapex = parseNumber(legacyRow.construction_plus_install_cost);
  const legacyArpu = parseNumber(legacyRow.arpu);
  const legacyConstruction = parseNumber(legacyRow.construction_cost);
  const legacyInstall = parseNumber(legacyRow.install_cost);
  const legacyTotalCostPerPassing = parseNumber(legacyRow.total_cost_per_passing);
  const legacyConstructionCostPerPassing = parseNumber(legacyRow.construction_cost_per_passing);

  if ((!inputs.passings || inputs.passings <= 0) && legacyPassings) {
    inputs.passings = legacyPassings;
    derived.passings = legacyPassings;
    defaultsUsed['Passings'] = legacyPassings;
  }
  if ((!inputs.build_months || inputs.build_months <= 0) && legacyBuildMonths) {
    inputs.build_months = legacyBuildMonths;
    derived.buildMonths = legacyBuildMonths;
    defaultsUsed['Months to Completion'] = legacyBuildMonths;
  }
  if ((!inputs.arpu_start || inputs.arpu_start <= 0) && legacyArpu) {
    inputs.arpu_start = legacyArpu;
    derived.arpuStart = legacyArpu;
    defaultsUsed['ARPU'] = legacyArpu;
  }

  let totalCapex = inputs.total_capex;
  if ((!totalCapex || totalCapex <= 0)) {
    if (legacyInvestment) {
      totalCapex = legacyInvestment;
      defaultsUsed['Investment'] = legacyInvestment;
    } else if (legacyCapex) {
      totalCapex = legacyCapex;
      defaultsUsed['Construction + Install Cost'] = legacyCapex;
    } else if (legacyConstruction && legacyInstall) {
      totalCapex = legacyConstruction + legacyInstall;
      defaultsUsed['Construction + Install Cost'] = totalCapex;
    }
    if (totalCapex) {
      inputs.total_capex = totalCapex;
      derived.totalCapex = totalCapex;
    }
  }

  if (!derived.constructionCost && legacyConstruction) {
    derived.constructionCost = legacyConstruction;
    defaultsUsed['Construction Cost'] = legacyConstruction;
  }
  if (!derived.installCost && legacyInstall) {
    derived.installCost = legacyInstall;
    defaultsUsed['Install Cost'] = legacyInstall;
  }
  if ((!inputs.capex_per_passing || inputs.capex_per_passing <= 0) && legacyConstructionCostPerPassing) {
    inputs.capex_per_passing = legacyConstructionCostPerPassing;
    derived.capexPerPassing = legacyConstructionCostPerPassing;
    defaultsUsed['Construction Cost per Passing'] = legacyConstructionCostPerPassing;
  } else if ((!inputs.capex_per_passing || inputs.capex_per_passing <= 0) && legacyTotalCostPerPassing) {
    inputs.capex_per_passing = legacyTotalCostPerPassing;
    derived.capexPerPassing = legacyTotalCostPerPassing;
    defaultsUsed['Total Cost per Passing'] = legacyTotalCostPerPassing;
  }

  if ((!inputs.total_capex || inputs.total_capex <= 0) && inputs.capex_per_passing && inputs.passings) {
    inputs.total_capex = inputs.capex_per_passing * inputs.passings;
    derived.totalCapex = inputs.total_capex;
  }

  return { inputs, derived, defaultsUsed };
}

const CALCULATED_COLUMN_TITLES = [
  'Subscribers',
  'Take Rate',
  'Revenue',
  'Cash Flow',
  'NPV',
  'IRR',
  'MOIC',
  'COC Return',
  'Construction Cost',
  'Construction Cost per Passing',
  'Install Cost',
  'Install Cost per Subscriber',
  'Construction + Install Cost',
  'Total Cost per Passing',
  'Funnel Value',
  'Funnel Multiple'
];

const MIRROR_OUTPUT_TITLES = [
  'Subscribers',
  'Take Rate',
  'Revenue',
  'Cash Flow',
  'NPV',
  'IRR',
  'MOIC',
  'COC Return',
  'Construction Cost',
  'Construction Cost per Passing',
  'Install Cost',
  'Install Cost per Subscriber',
  'Construction + Install Cost',
  'Total Cost per Passing',
  'Funnel Value',
  'Funnel Multiple',
  'Investment',
  'ARPU',
  'Months to Completion'
];

const DATA_QUALITY_COLUMN_TITLE = 'Data Quality';
const DEFAULT_TITLE_TO_FIELD = {
  'Passings': 'passings',
  'Months to Completion': 'months_to_completion',
  'Investment': 'investment',
  'Construction + Install Cost': 'construction_plus_install_cost',
  'ARPU': 'arpu',
  'Construction Cost': 'construction_cost',
  'Install Cost': 'install_cost',
  'Total Cost per Passing': 'total_cost_per_passing',
  'Construction Cost per Passing': 'construction_cost_per_passing'
};

function extractCalculatedOutputs(colMap, titles = CALCULATED_COLUMN_TITLES) {
  const outputs = {};
  titles.forEach((title) => {
    const cv = colMap[title.toLowerCase()];
    if (!cv) return;
    const num = parseNumber(cv.text);
    if (num === null) return;
    outputs[title] = num;
  });
  return outputs;
}

function applyDefaultsToMapped(mapped, defaultsByTitle) {
  if (!mapped || !defaultsByTitle) return;
  Object.entries(defaultsByTitle).forEach(([title, value]) => {
    const field = DEFAULT_TITLE_TO_FIELD[title];
    if (!field) return;
    mapped[field] = value;
  });
}

async function ensureDataQualityColumn(boardId, token) {
  const columns = await getMondayBoardColumns(boardId, token);
  const existing = (columns || []).find((col) => String(col?.title || '').trim().toLowerCase() === DATA_QUALITY_COLUMN_TITLE.toLowerCase());
  if (existing) return existing.id;
  const mutation = `mutation { create_column(board_id: ${boardId}, title: \"${DATA_QUALITY_COLUMN_TITLE}\", column_type: status) { id } }`;
  const data = await mondayGraphQL({ query: mutation, token });
  return data?.data?.create_column?.id || null;
}

async function setDataQualityStatus({ boardId, itemId, token, status }) {
  if (!boardId || !itemId || !token || !status) return { ok: false, skipped: true };
  const columnId = await ensureDataQualityColumn(boardId, token);
  if (!columnId) return { ok: false, skipped: true };
  const value = JSON.stringify({ label: status });
  const mutation = `mutation { change_column_value(board_id: ${boardId}, item_id: ${itemId}, column_id: \"${columnId}\", value: ${JSON.stringify(value)}, create_labels_if_missing: true) { id } }`;
  await mondayGraphQL({ query: mutation, token });
  return { ok: true, status };
}

function matchesScenarioName(name, target) {
  if (!name || !target) return false;
  return String(name).trim().toLowerCase() === String(target).trim().toLowerCase();
}

function parseBooleanText(value) {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim().toLowerCase();
  return ['true', 'yes', '1', 'checked', 'y', 'v', '✓', 'checked'].includes(normalized);
}

function shouldProcessItem(colMap, mapping, useSyncFilter = true) {
  if (!useSyncFilter) return true;
  const syncFilter = mapping?.sync_filter;
  if (!syncFilter) return true;
  const getText = (title) => colMap[title.toLowerCase()]?.text ?? null;
  if (syncFilter.module_type_value) {
    const moduleType = getText('Module Type');
    if (!moduleType || moduleType !== syncFilter.module_type_value) return false;
  }
  if (syncFilter.sync_to_aws_required) {
    const syncValue = getText('Sync to AWS');
    if (!parseBooleanText(syncValue)) return false;
  }
  return true;
}

async function fetchBoardItems(boardId, token, limit) {
  const items = [];
  let cursor = null;
  const pageSize = 100;
  while (true) {
    const cursorArg = cursor ? `, cursor: \"${cursor}\"` : '';
    const query = `query { boards(ids: [${boardId}]) { items_page(limit: ${pageSize}${cursorArg}) { cursor items { id name column_values { id text value column { id title type } } subitems { id name } } } } }`;
    const data = await mondayGraphQL({ query, token });
    const page = data?.data?.boards?.[0]?.items_page;
    const pageItems = page?.items || [];
    items.push(...pageItems);
    if (limit && items.length >= limit) return items.slice(0, limit);
    cursor = page?.cursor;
    if (!cursor) break;
  }
  return items;
}

async function fetchBoardItemsPage(boardId, token, cursor) {
  const pageSize = 100;
  const cursorArg = cursor ? `, cursor: \"${cursor}\"` : '';
  const query = `query { boards(ids: [${boardId}]) { items_page(limit: ${pageSize}${cursorArg}) { cursor items { id name column_values { id text value column { id title type } } subitems { id name } } } } }`;
  const data = await mondayGraphQL({ query, token });
  const page = data?.data?.boards?.[0]?.items_page;
  return { items: page?.items || [], cursor: page?.cursor || null };
}

async function fetchMondayItemById(itemId, token) {
  if (!itemId) return null;
  const query = `query { items(ids: [${itemId}]) { id name column_values { id text value column { id title type } } subitems { id name } } }`;
  const data = await mondayGraphQL({ query, token });
  return data?.data?.items?.[0] || null;
}

function computeDerivedOutputs(inputs, modelMetrics, context = {}) {
  const passings = inputs.passings || 0;
  const subscriptionRate = inputs.subscription_rate ?? inputs.penetration_target_pct ?? 0.4;
  const subscribers = passings && subscriptionRate ? Math.round(passings * subscriptionRate) : null;
  const takeRate = passings && subscribers ? (subscribers / passings) * 100 : null;
  const revenue = subscribers && inputs.arpu_start ? subscribers * inputs.arpu_start : null;
  const cashFlow = modelMetrics?.peak_monthly_ebitda ?? null;
  const totalCapex = inputs.total_capex ?? null;
  const costPerPassing = passings && totalCapex ? totalCapex / passings : null;
  const constructionCost = context.constructionCost ?? null;
  const installCost = context.installCost ?? null;
  const constructionCostPerPassing = passings && constructionCost ? constructionCost / passings : costPerPassing;
  const installCostPerSubscriber = inputs.install_cost_per_subscriber ?? (subscribers && installCost ? installCost / subscribers : null);

  return {
    'Subscribers': subscribers,
    'Take Rate': takeRate,
    'Revenue': revenue,
    'Cash Flow': cashFlow,
    'NPV': modelMetrics?.npv ?? null,
    'IRR': modelMetrics?.irr_annual_pct ?? null,
    'MOIC': modelMetrics?.moic ?? null,
    'Subscription Rate': subscriptionRate ?? null,
    'Subscription Months': inputs.subscription_months ?? null,
    'Capex per Passing': inputs.capex_per_passing ?? costPerPassing,
    'Construction + Install Cost': totalCapex,
    'Construction Cost per Passing': constructionCostPerPassing,
    'Install Cost per Subscriber': installCostPerSubscriber,
    'Total Cost per Passing': costPerPassing
  };
}

function buildColumnValuesFromTitleMap(titleMap, valuesByTitle) {
  const updates = {};
  Object.entries(valuesByTitle || {}).forEach(([title, value]) => {
    const id = titleMap[title.toLowerCase()];
    if (!id || value === null || value === undefined || value === '') return;
    updates[id] = String(value);
  });
  return updates;
}

async function updateParentCalculatedFields({ boardId, itemId, token, valuesByTitle }) {
  const columns = await getMondayBoardColumns(boardId, token);
  const titleMap = buildColumnIdMapByTitle(columns);
  const columnValues = buildColumnValuesFromTitleMap(titleMap, valuesByTitle);
  if (!Object.keys(columnValues).length) return { ok: false, skipped: true };
  const mutation = `mutation { change_multiple_column_values(board_id: ${boardId}, item_id: ${itemId}, column_values: ${JSON.stringify(JSON.stringify(columnValues))}, create_labels_if_missing: true) { id } }`;
  try {
    await mondayGraphQL({ query: mutation, token });
    return { ok: true, updated_fields: Object.keys(columnValues).length };
  } catch (err) {
    const msg = String(err?.message || '');
    if (!msg.includes('itemLinkMaxLocksExceeded')) {
      throw err;
    }
    // Fallback: update one column at a time to avoid lock errors.
    let updated = 0;
    for (const [columnId, value] of Object.entries(columnValues)) {
      const valuePayload = JSON.stringify(String(value));
      const single = `mutation { change_column_value(board_id: ${boardId}, item_id: ${itemId}, column_id: \"${columnId}\", value: ${JSON.stringify(valuePayload)}) { id } }`;
      try {
        await mondayGraphQL({ query: single, token });
        updated += 1;
      } catch (_) {
        // Ignore per-column failures so we can progress.
      }
    }
    return { ok: updated > 0, updated_fields: updated, fallback: true };
  }
}

async function createScenarioSubitemWithValues({
  boardId,
  parentItemId,
  token,
  scenarioName,
  inputs,
  outputs,
  subitemId: existingSubitemId
}) {
  let subitemId = existingSubitemId || null;
  if (!subitemId) {
    const createQuery = `mutation { create_subitem(parent_item_id: ${parentItemId}, item_name: \"${String(scenarioName).replace(/\"/g, '\\\\\"')}\") { id name } }`;
    const createData = await mondayGraphQL({ query: createQuery, token });
    subitemId = createData?.data?.create_subitem?.id;
    if (!subitemId) {
      return { ok: false, error: 'Failed to create subitem' };
    }
  }

  const subitemsBoardId = await getSubitemsBoardId(boardId, token);
  if (!subitemsBoardId) {
    return { ok: true, subitem_id: subitemId, warning: 'Subitems board not found' };
  }
  const subitemColumns = await getMondayBoardColumns(subitemsBoardId, token);
  const colMap = buildColumnIdMapByTitle(subitemColumns);

  const columnValues = {};
  const titleAliases = {
    'irr': ['irr %'],
    'irr %': ['irr'],
    'arpu': ['arpu start'],
    'arpu start': ['arpu'],
    'months to completion': ['build months'],
    'build months': ['months to completion'],
    'investment': ['total capex', 'construction + install cost'],
    'total capex': ['investment', 'construction + install cost'],
    'construction + install cost': ['total capex', 'investment']
  };
  const resolveColumnId = (title) => {
    const key = title.toLowerCase();
    if (colMap[key]) return colMap[key];
    const aliases = titleAliases[key] || [];
    for (const alias of aliases) {
      const id = colMap[alias.toLowerCase()];
      if (id) return id;
    }
    return null;
  };
  const setNumber = (title, value) => {
    const id = resolveColumnId(title);
    if (!id || value === null || value === undefined || value === '') return;
    columnValues[id] = String(value);
  };

  Object.entries(outputs || {}).forEach(([title, value]) => setNumber(title, value));

  if (inputs) {
    const toPct = (val) => {
      if (val === null || val === undefined || val === '') return null;
      const num = Number(val);
      if (Number.isNaN(num)) return null;
      return num <= 1 ? num * 100 : num;
    };
    setNumber('Passings', inputs.passings);
    setNumber('Build Months', inputs.build_months);
    setNumber('Total Capex', inputs.total_capex);
    setNumber('ARPU Start', inputs.arpu_start);
    setNumber('Penetration Start %', toPct(inputs.penetration_start_pct));
    setNumber('Penetration Target %', toPct(inputs.penetration_target_pct));
    setNumber('Ramp Months', inputs.ramp_months);
    setNumber('Capex per Passing', inputs.capex_per_passing);
    setNumber('Opex per Sub', inputs.opex_per_sub);
    setNumber('Discount Rate %', toPct(inputs.discount_rate_pct));
    setNumber('Analysis Months', inputs.analysis_months);
  }

  if (Object.keys(columnValues).length) {
    const updateQuery = `mutation { change_multiple_column_values(item_id: ${subitemId}, board_id: ${subitemsBoardId}, column_values: ${JSON.stringify(JSON.stringify(columnValues))}, create_labels_if_missing: true) { id } }`;
    try {
      await mondayGraphQL({ query: updateQuery, token });
    } catch (err) {
      const msg = String(err?.message || '');
      if (!msg.includes('itemLinkMaxLocksExceeded')) {
        throw err;
      }
      for (const [columnId, value] of Object.entries(columnValues)) {
        const valuePayload = JSON.stringify(String(value));
        const single = `mutation { change_column_value(board_id: ${subitemsBoardId}, item_id: ${subitemId}, column_id: \"${columnId}\", value: ${JSON.stringify(valuePayload)}) { id } }`;
        try {
          await mondayGraphQL({ query: single, token });
        } catch (_) {
          // ignore per-column failure
        }
      }
    }
  }

  return { ok: true, subitem_id: subitemId, created: !existingSubitemId };
}

async function upsertMondayProject({ project, mapping, token, boardId }) {
  if (!project || !mapping) return { ok: false, error: 'Missing project or mapping' };
  const projectId = project.project_id;
  if (!projectId) return { ok: false, error: 'project_id required' };

  const existing = await findMondayItemByProjectId(boardId, projectId, mapping, token);
  const mode = existing ? 'editable' : 'full';
  const updates = buildMondayUpdatesFromProject(project, mapping, mode);

  let itemId = existing?.id || null;
  let created = false;

  if (!itemId) {
    const itemName = escapeGraphQLString(project.project_name || projectId);
    const columnValues = JSON.stringify(JSON.stringify(updates));
    const createMutation = `mutation { create_item(board_id: ${boardId}, item_name: "${itemName}", column_values: ${columnValues}, create_labels_if_missing: true) { id name } }`;
    const createData = await mondayGraphQL({ query: createMutation, token });
    itemId = createData?.data?.create_item?.id || null;
    created = true;
  } else if (Object.keys(updates).length) {
    const mutation = `mutation { change_multiple_column_values(board_id: ${boardId}, item_id: ${itemId}, column_values: ${JSON.stringify(JSON.stringify(updates))}, create_labels_if_missing: true) { id } }`;
    await mondayGraphQL({ query: mutation, token });
  }

  return { ok: true, item_id: itemId, created, updated_fields: Object.keys(updates).length };
}

async function querySingleRow(sql) {
  const qid = await startQuery(sql);
  await waitForQuery(qid);
  const result = await getQueryResults(qid);
  const columns = result.columns || [];
  const rows = result.rows || [];
  if (rows.length < 2) return { qid, row: null };
  const dataRow = rows[1];
  const rowObj = {};
  columns.forEach((col, idx) => {
    rowObj[col] = dataRow[idx];
  });
  return { qid, row: rowObj };
}

async function writeBackToMonday({ boardId, itemId, projectRow, mapping, token }) {
  if (!projectRow || !mapping) return { ok: false };
  const fieldMap = mapping.field_map || {};
  const editableFields = new Set(mapping.editable_fields_monday_to_aws || []);
  const columnsByTitle = mapping.columns_by_title || {};

  const fieldTitles = {
    subscription_rate: 'Subscription Rate',
    subscription_months: 'Subscription Months',
    capex_per_passing: 'Capex per Passing',
    install_cost_per_subscriber: 'Install Cost per Subscriber',
    opex_per_passing: 'Monthly Opex per Passing',
    min_monthly_opex: 'Min Monthly Opex',
    cogs_pct_revenue: 'Monthly Avg - COGS % of Revenue',
    min_non_circuit_cogs: 'Monthly Minimum - Non Circuit COGS',
    circuit: 'Circuit (Yes or No)',
    circuit_type: 'Circuit Type',
    ebitda_multiple: 'EBITDA Multiple Method'
  };

  const resolveColumnId = (field) => {
    const direct = fieldMap[field];
    if (direct) return direct;
    const title = fieldTitles[field];
    if (!title) return null;
    return columnsByTitle[title.toLowerCase()] || null;
  };

  const updates = {};
  Object.keys({ ...fieldMap, ...fieldTitles }).forEach((field) => {
    const columnId = resolveColumnId(field);
    if (!columnId) return;
    if (editableFields.has(field)) return;
    const value = projectRow[field];
    const formatted = formatMondayValue(field, value);
    if (formatted === null) return;
    updates[columnId] = formatted;
  });


  if (Object.keys(updates).length === 0) return { ok: false };

  const mutation = `mutation { change_multiple_column_values(board_id: ${boardId}, item_id: ${itemId}, column_values: ${JSON.stringify(JSON.stringify(updates))}, create_labels_if_missing: true) { id } }`;
  await mondayGraphQL({ query: mutation, token });
  return { ok: true, updated_fields: Object.keys(updates).length };
}

async function getCache(cacheKey) {
  if (!CACHE_TABLE) return null;
  const res = await ddb.get({ TableName: CACHE_TABLE, Key: { cache_key: cacheKey } }).promise();
  return res.Item || null;
}

async function putCache(cacheKey, payload, ttlSeconds) {
  if (!CACHE_TABLE) return;
  const now = Math.floor(Date.now() / 1000);
  const item = {
    cache_key: cacheKey,
    last_success_ts: now,
    expires_at: now + ttlSeconds,
    result: payload
  };
  try {
    const size = Buffer.byteLength(JSON.stringify(item), 'utf8');
    if (size > 350000) return; // avoid DynamoDB 400KB item limit
    await ddb.put({ TableName: CACHE_TABLE, Item: item }).promise();
  } catch (_) {
    // swallow cache errors
  }
}

async function startQuery(queryString) {
  const res = await athena.startQueryExecution({
    QueryString: queryString,
    WorkGroup: ATHENA_WORKGROUP,
    QueryExecutionContext: { Database: ATHENA_DATABASE },
    ResultConfiguration: { OutputLocation: ATHENA_OUTPUT }
  }).promise();
  return res.QueryExecutionId;
}

async function waitForQuery(queryExecutionId, timeoutSeconds = MAX_QUERY_SECONDS) {
  const start = Date.now();
  while (true) {
    const res = await athena.getQueryExecution({ QueryExecutionId: queryExecutionId }).promise();
    const state = res.QueryExecution.Status.State;
    if (state === 'SUCCEEDED') return res;
    if (state === 'FAILED' || state === 'CANCELLED') {
      const reason = res.QueryExecution.Status.StateChangeReason || 'Query failed';
      throw new Error(reason);
    }
    const elapsed = (Date.now() - start) / 1000;
    if (elapsed > timeoutSeconds) throw new Error('Query timeout');
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function getQueryResults(queryExecutionId, maxRows = null) {
  const rows = [];
  let nextToken = null;
  let columns = [];
  let truncated = false;
  do {
    const res = await athena.getQueryResults({
      QueryExecutionId: queryExecutionId,
      NextToken: nextToken
    }).promise();
    if (!columns.length && res.ResultSet.ResultSetMetadata) {
      columns = res.ResultSet.ResultSetMetadata.ColumnInfo.map((c) => c.Name);
    }
    const resultRows = res.ResultSet.Rows || [];
    for (const row of resultRows) {
      const values = row.Data.map((d) => (d.VarCharValue !== undefined ? d.VarCharValue : null));
      rows.push(values);
      if (maxRows && rows.length >= maxRows) {
        truncated = true;
        nextToken = null;
        break;
      }
    }
    if (truncated) break;
    nextToken = res.NextToken;
  } while (nextToken);

  return { columns, rows, truncated, max_rows: maxRows || null };
}

async function executeQuery(queryDef, params, timeoutSeconds = MAX_QUERY_SECONDS) {
  const sql = applyParams(queryDef.sql, params, queryDef.params || []);
  const qid = await startQuery(sql);
  await waitForQuery(qid, timeoutSeconds);
  const maxRows = resolveMaxRows(queryDef);
  const result = await getQueryResults(qid, maxRows + 1);
  return { sql, query_execution_id: qid, ...result };
}

async function executeFreeformQuery(sql, params, timeoutSeconds = MAX_QUERY_SECONDS) {
  const rendered = applyParams(sql, params, Object.keys(params || {}));
  const qid = await startQuery(rendered);
  await waitForQuery(qid, timeoutSeconds);
  const result = await getQueryResults(qid, MAX_RESULT_ROWS + 1);
  return { sql: rendered, query_execution_id: qid, ...result };
}

exports.handler = async (event) => {
  if (!event?.path && (event?.source === 'aws.events' || event?.guard_refresh)) {
    const guardStatus = await computeGuardStatus({ persist: true });
    return { ok: true, guard_status: guardStatus, timestamp: new Date().toISOString() };
  }

  const isInternalReproRun = event?.internal_action === 'revenue_repro_run';
  const path = event.path || (isInternalReproRun ? '/engine/revenue-repro-pack' : '/');
  const method = event.httpMethod || (isInternalReproRun ? 'POST' : 'GET');
  const rawBody = event.body || '';

  if (method === 'OPTIONS') {
    return response(200, { ok: true });
  }

  const bypassAuth = isInternalReproRun || path.endsWith('/monday/webhook');
  if (!bypassAuth) {
    const requiresAdmin = ADMIN_ONLY_PATHS.some((suffix) => path.endsWith(suffix));
    const authError = enforceAuth(event, { requireAdmin: requiresAdmin });
    if (authError) return authError;
  }

  let payload = {};
  if (isInternalReproRun) {
    payload = event.payload || {};
  } else if (method === 'POST') {
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (_) {
      return response(400, { ok: false, error: 'Invalid JSON body' });
    }
  }

  if (path.endsWith('/health') && method === 'GET') {
    const params = event.queryStringParameters || {};
    const includeGuards = String(params.guards || params.guard || '').toLowerCase() === '1';
    if (!includeGuards) {
      return response(200, { ok: true, timestamp: new Date().toISOString() });
    }
    let guardStatus = await loadGuardStatusFromS3();
    let stale = false;
    if (guardStatus?.last_check) {
      const last = new Date(guardStatus.last_check);
      const ageMinutes = (Date.now() - last.getTime()) / 60000;
      stale = ageMinutes > GUARD_STALE_MINUTES;
    } else {
      stale = true;
    }
    if (!guardStatus || stale) {
      try {
        guardStatus = await computeGuardStatus({ persist: true });
      } catch (err) {
        if (!guardStatus) {
          return response(500, { ok: false, error: err?.message || 'Guard refresh failed' });
        }
        return response(200, {
          ok: true,
          timestamp: new Date().toISOString(),
          guard_status: guardStatus,
          guard_status_error: err?.message || 'Guard refresh failed'
        });
      }
    }
    return response(200, { ok: true, timestamp: new Date().toISOString(), guard_status: guardStatus });
  }

  if (path.endsWith('/registry') && method === 'GET') {
    const registry = Object.entries(REGISTRY).map(([id, def]) => ({
      question_id: id,
      views_used: def.views_used || [],
      params: def.params || []
    }));
    return response(200, { ok: true, registry });
  }

  if (path.endsWith('/engine/revenue-repro-status') && method === 'POST') {
    const runLogKey = payload.run_log_key || null;
    const runId = payload.run_id || null;
    const reportName = payload.report_name || payload.reportName || null;
    const bucket = 'gwi-raw-us-east-2-pc';
    const inferredLogKey = runId && reportName
      ? `raw/revenue_repro/run_logs/${reportName}/${runId}/run_log.json`
      : null;
    const key = runLogKey || inferredLogKey;

    if (!key) {
      return response(400, { ok: false, error: 'run_log_key or run_id + report_name required' });
    }

    try {
      const logText = await readS3Text(bucket, key);
      let runLog = JSON.parse(logText);
      let status = runLog.status || 'pending';
      const runAt = runLog.run_at ? new Date(runLog.run_at) : null;
      const ageMinutes = runAt && !Number.isNaN(runAt.getTime())
        ? (Date.now() - runAt.getTime()) / 60000
        : null;
      const retryCount = Number.isFinite(runLog.retry_count) ? runLog.retry_count : 0;

      if (status === 'queued' && ageMinutes !== null && ageMinutes > 2 && retryCount < 2) {
        const updatedLog = {
          ...runLog,
          status: 'running',
          retry_count: retryCount + 1,
          retry_at: new Date().toISOString()
        };
        await writeS3Json(bucket, key, updatedLog);
        runLog = updatedLog;
        status = updatedLog.status;
        try {
          await lambda.invoke({
            FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
            InvocationType: 'Event',
            Payload: JSON.stringify({
              internal_action: 'revenue_repro_run',
              payload: {
                report_name: runLog.report_name || reportName,
                start_date: runLog.window_alignment?.invoice_window?.start,
                end_date: runLog.window_alignment?.invoice_window?.end,
                include_id_count_checks: runLog.include_id_count_checks !== false,
                collapse_invoice_duplicates: runLog.collapse_invoice_duplicates === true,
                include_invoice_detail: runLog.include_invoice_detail === true,
                run_id: runLog.run_id || runId,
                run_at: runLog.run_at,
                async: false
              }
            })
          }).promise();
        } catch (err) {
          const failedRetry = {
            ...updatedLog,
            status: 'queued',
            retry_error: err.message || String(err)
          };
          await writeS3Json(bucket, key, failedRetry);
          runLog = failedRetry;
          status = failedRetry.status;
        }
      }

      if (status === 'complete' && runLog.result_key) {
        try {
          const resultText = await readS3Text(bucket, runLog.result_key);
          const result = JSON.parse(resultText);
          return response(200, { ok: true, status, run_id: runLog.run_id || runId, result, run_log: runLog });
        } catch (err) {
          return response(200, { ok: true, status, run_id: runLog.run_id || runId, result: null, run_log: runLog });
        }
      }
      return response(200, { ok: true, status, run_id: runLog.run_id || runId, run_log: runLog });
    } catch (err) {
      if (err?.code === 'NoSuchKey' || err?.statusCode === 404) {
        return response(200, { ok: true, status: 'pending', run_id: runId });
      }
      return response(500, { ok: false, error: err.message || 'Failed to load run log' });
    }
  }

  if (path.endsWith('/admin/users')) {
    const allowlistError = enforceAdminToolAllowlist(event);
    if (allowlistError) return allowlistError;
    const group = (method === 'GET'
      ? (event.queryStringParameters?.group || event.queryStringParameters?.GroupName)
      : (payload.group || payload.group_name)) || 'mac-admin';

    if (method === 'GET') {
      try {
        const users = await listAdminUsers(group);
        return response(200, { ok: true, success: true, group, users });
      } catch (err) {
        return response(500, { ok: false, success: false, error: err.message || 'Failed to list users' });
      }
    }

    if (method === 'POST') {
      const action = String(payload.action || 'add').toLowerCase();
      const email = payload.email ? validateTargetEmail(payload.email) : null;
      try {
        if (action === 'list') {
          const users = await listAdminUsers(group);
          return response(200, { ok: true, success: true, group, users });
        }
        if (!email) {
          return response(400, { ok: false, success: false, error: 'email required' });
        }

        if (action === 'add') {
          const created = await ensureUserExists(email, payload.temp_password || null);
          await cognitoIdp.adminAddUserToGroup({
            UserPoolId: COGNITO_USER_POOL_ID,
            Username: email,
            GroupName: group
          }).promise();
          await sendAdminNotification(email, 'add');
          return response(200, { ok: true, success: true, action, email, created, group });
        }

        if (action === 'resend') {
          await cognitoIdp.adminCreateUser({
            UserPoolId: COGNITO_USER_POOL_ID,
            Username: email,
            MessageAction: 'RESEND',
            DesiredDeliveryMediums: ['EMAIL']
          }).promise();
          await sendAdminNotification(email, 'resend');
          return response(200, { ok: true, success: true, action, email, group });
        }

        if (action === 'remove') {
          await cognitoIdp.adminRemoveUserFromGroup({
            UserPoolId: COGNITO_USER_POOL_ID,
            Username: email,
            GroupName: group
          }).promise();
          if (payload.disable === true) {
            await cognitoIdp.adminDisableUser({ UserPoolId: COGNITO_USER_POOL_ID, Username: email }).promise();
          }
          return response(200, { ok: true, success: true, action, email, group, disabled: payload.disable === true });
        }

        if (action === 'disable') {
          await cognitoIdp.adminDisableUser({ UserPoolId: COGNITO_USER_POOL_ID, Username: email }).promise();
          return response(200, { ok: true, success: true, action, email });
        }

        if (action === 'enable') {
          await cognitoIdp.adminEnableUser({ UserPoolId: COGNITO_USER_POOL_ID, Username: email }).promise();
          return response(200, { ok: true, success: true, action, email });
        }

        return response(400, { ok: false, success: false, error: 'Invalid action' });
      } catch (err) {
        return response(500, { ok: false, success: false, error: err.message || 'Admin action failed' });
      }
    }

    return response(405, { ok: false, error: 'Method Not Allowed' });
  }

  if (path.endsWith('/engine/scenarios') && method === 'POST') {
    const action = payload.action || 'get';
    const projectId = payload.project_id || payload.projectId || null;
    if (!projectId) {
      return response(400, { ok: false, success: false, error: 'project_id required' });
    }
    try {
      const registry = await loadScenariosRegistry(projectId);
      if (action === 'get') {
        return response(200, { ok: true, success: true, registry });
      }
      if (action === 'upsert') {
        if (!payload.scenario || !payload.scenario.scenario_id) {
          return response(400, { ok: false, success: false, error: 'scenario with scenario_id required' });
        }
        const updated = upsertScenario(registry, payload.scenario);
        const key = await saveScenariosRegistry(projectId, updated);
        return response(200, { ok: true, success: true, registry: updated, s3_key: key });
      }
      return response(400, { ok: false, success: false, error: 'Invalid action. Use get or upsert.' });
    } catch (err) {
      return response(500, { ok: false, success: false, error: err.message || 'Scenario registry failed' });
    }
  }

  if (path.endsWith('/engine/outputs') && method === 'POST') {
    const action = payload.action || 'list';
    const projectId = payload.project_id || payload.projectId || null;
    if (!projectId) {
      return response(400, { ok: false, success: false, error: 'project_id required' });
    }
    const bucket = 'gwi-raw-us-east-2-pc';
    if (action === 'list') {
      try {
        const prefix = `raw/projects_pipeline/model_outputs/${projectId}/`;
        const objects = await listS3Objects(bucket, prefix, 1000);
        const runs = {};

        objects.forEach((obj) => {
          if (!obj.Key) return;
          const parts = obj.Key.replace(prefix, '').split('/');
          if (parts.length >= 3) {
            const scenario_id = parts[0];
            const run_id = parts[1];
            const file_name = parts[parts.length - 1];
            const runKey = `${scenario_id}/${run_id}`;
            if (!runs[runKey]) {
              runs[runKey] = {
                scenario_id,
                run_id,
                scenario_name: null,
                files: [],
                created: obj.LastModified,
                metrics: null
              };
            }
            runs[runKey].files.push({
              key: obj.Key,
              file_name,
              file_type: file_name.replace('.csv', '').replace('.json', ''),
              last_modified: obj.LastModified,
              size_bytes: obj.Size
            });
          }
        });

        for (const runKey of Object.keys(runs)) {
          const run = runs[runKey];
          const inputsFile = run.files.find((f) => f.file_name === 'inputs.json');
          if (inputsFile) {
            try {
              const content = await readS3Text(bucket, inputsFile.key);
              const inputsData = JSON.parse(content);
              if (inputsData.scenario_name && inputsData.scenario_name.trim().length > 0) {
                run.scenario_name = inputsData.scenario_name;
              }
            } catch (err) {
              // ignore
            }
          }
          const metricsFile = run.files.find((f) => f.file_name === 'summary_metrics.csv');
          if (metricsFile) {
            try {
              const content = await readS3Text(bucket, metricsFile.key);
              const lines = content.split('\n');
              const metrics = {};
              for (let i = 1; i < lines.length; i += 1) {
                const [metric, value] = lines[i].split(',');
                if (metric && value !== undefined) {
                  metrics[metric] = value;
                }
              }
              run.metrics = metrics;
            } catch (err) {
              // ignore
            }
          }
        }

        const runsList = Object.values(runs).sort((a, b) => new Date(b.created) - new Date(a.created));
        return response(200, { ok: true, success: true, runs: runsList });
      } catch (err) {
        return response(500, { ok: false, success: false, error: err.message || 'Failed to list outputs' });
      }
    }

    if (action === 'download') {
      if (!payload.key) {
        return response(400, { ok: false, success: false, error: 'key required for download' });
      }
      try {
        const url = await s3.getSignedUrlPromise('getObject', {
          Bucket: bucket,
          Key: payload.key,
          Expires: 900
        });
        return response(200, { ok: true, success: true, key: payload.key, download_url: url, expires_in_seconds: 900 });
      } catch (err) {
        return response(500, { ok: false, success: false, error: err.message || 'Failed to generate download URL' });
      }
    }

    if (action === 'content') {
      if (!payload.key) {
        return response(400, { ok: false, success: false, error: 'key required for content' });
      }
      try {
        const content = await readS3Text(bucket, payload.key);
        return response(200, { ok: true, success: true, content });
      } catch (err) {
        return response(500, { ok: false, success: false, error: err.message || 'Failed to load content' });
      }
    }

    return response(400, { ok: false, success: false, error: 'Invalid action. Use list, download, or content.' });
  }

  if (path.endsWith('/engine/revenue-repro-pack') && method === 'POST') {
    const reportName = payload.report_name || payload.reportName || null;
    const startDate = payload.start_date || payload.startDate || null;
    const endDate = payload.end_date || payload.endDate || null;
    const includeDiagnostics = payload.include_id_count_checks !== false;
    const collapseInvoiceDuplicates = payload.collapse_invoice_duplicates === true;
    const includeInvoiceDetail = payload.include_invoice_detail === true;
    const asyncMode = !isInternalReproRun && payload.async !== false;

    if (!reportName || !startDate || !endDate) {
      return response(400, { ok: false, success: false, error: 'report_name, start_date, and end_date are required' });
    }

    const run_id = payload.run_id || `run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const run_at = payload.run_at || new Date().toISOString();
    const runKeyPrefix = `raw/revenue_repro/${reportName}/${run_id}`;
    const logKeyPrefix = `raw/revenue_repro/run_logs/${reportName}/${run_id}`;

    const startMonth = new Date(startDate);
    const endMonth = new Date(endDate);
    const startMonthKey = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
    const endMonthKey = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1);
    const months = [];
    const cursor = new Date(startMonthKey);
    while (cursor <= endMonthKey) {
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      months.push(`${yyyy}-${mm}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (!months.length) {
      return response(400, { ok: false, success: false, error: 'No months in requested window' });
    }

    const monthDates = months.map((month) => `${month}-01`);
    const pivotRevenueByDate = monthDates.map((monthDate) => (
      `SUM(CASE WHEN period_month = DATE '${monthDate}' THEN revenue_total ELSE 0 END) AS "${monthDate}"`
    )).join(',\n');
    const pivotRevenueByMonth = months.map((month) => (
      `SUM(CASE WHEN period_month = DATE '${month}-01' THEN revenue_total ELSE 0 END) AS "${month}"`
    )).join(',\n');
    const pivotCountByMonth = months.map((month) => (
      `COUNT(DISTINCT CASE WHEN period_month = DATE '${month}-01' AND revenue_total > 0 THEN customer_id END) AS "${month}"`
    )).join(',\n');

    const companyNameExpr = buildCaseFromMap(
      'TRY_CAST(meta.gwi_company_id AS INTEGER)',
      REVENUE_REPORT_LABEL_MAP.company_map,
      "COALESCE(meta.system_id, 'Unmapped')"
    );
    const customerTypeExpr = buildCaseFromMap(
      'TRY_CAST(meta.gwi_customer_type AS INTEGER)',
      REVENUE_REPORT_LABEL_MAP.customer_type_map,
      "'Unknown'"
    );

    const revenueReportSQL = `WITH revenue AS (
  SELECT customer_id, system_id, period_month, revenue_total
  FROM curated_core.v_monthly_revenue_platt_long
  WHERE period_month BETWEEN DATE '${monthDates[0]}' AND DATE '${monthDates[monthDates.length - 1]}'
),
meta AS (
  SELECT
    CAST(id AS varchar) AS customer_id,
    CAST(COALESCE(NULLIF(guarantor, ''), id) AS varchar) AS guarantor_id,
    name AS customer_name,
    active AS customer_active,
    gwi_system AS system_id,
    custbillday AS bill_day,
    gwi_company_id,
    gwi_customer_type
  FROM curated_core.platt_customer_current_ssot
  WHERE COALESCE(LOWER(sensitive_p), 'n') <> 'y'
)
SELECT
  meta.customer_id,
  meta.guarantor_id,
  meta.customer_name,
  meta.customer_active,
  ${companyNameExpr} AS company_name,
  COALESCE(meta.system_id, revenue.system_id) AS system_id,
  meta.bill_day,
  ${customerTypeExpr} AS customer_type,
  ${pivotRevenueByDate}
FROM meta
LEFT JOIN revenue
  ON CAST(revenue.customer_id AS varchar) = meta.customer_id
GROUP BY 1,2,3,4,5,6,7,8
ORDER BY meta.customer_name, meta.customer_id, meta.guarantor_id, COALESCE(meta.system_id, revenue.system_id);`;

    const revenueBySystemSQL = `WITH revenue AS (
  SELECT COALESCE(system_id, 'Unmapped') AS system_id, period_month, revenue_total
  FROM curated_core.v_monthly_revenue_platt_long
  WHERE period_month BETWEEN DATE '${monthDates[0]}' AND DATE '${monthDates[monthDates.length - 1]}'
)
SELECT system_id,\n${pivotRevenueByMonth}
FROM revenue
GROUP BY system_id
ORDER BY system_id;`;

    const countPivotSQL = `WITH base AS (
  SELECT customer_id, COALESCE(system_id, 'Unmapped') AS system_id, period_month, revenue_total
  FROM curated_core.v_monthly_revenue_platt_long
  WHERE period_month BETWEEN DATE '${monthDates[0]}' AND DATE '${monthDates[monthDates.length - 1]}'
)
SELECT system_id,\n${pivotCountByMonth}
FROM base
GROUP BY system_id
ORDER BY system_id;`;

    const invoiceDetailSQL = collapseInvoiceDuplicates
      ? `SELECT customer_id, system, invoice_id, invoice_date, product, SUM(total) AS total
FROM curated_core.invoice_line_item_repro_v1
WHERE invoice_date >= DATE '${startDate}'
  AND invoice_date <= DATE '${endDate}'
GROUP BY customer_id, system, invoice_id, invoice_date, product
ORDER BY invoice_date, customer_id, system, invoice_id, product
LIMIT 200000;`
      : `SELECT customer_id, system, invoice_id, invoice_date, product, total
FROM curated_core.invoice_line_item_repro_v1
WHERE invoice_date >= DATE '${startDate}'
  AND invoice_date <= DATE '${endDate}'
ORDER BY invoice_date, customer_id, system, invoice_id, product
LIMIT 200000;`;

    const reproQuerySeconds = Number(process.env.REPRO_QUERY_SECONDS || MAX_QUERY_SECONDS);
    const runLog = {
      run_id,
      run_at,
      report_name: reportName,
      status: asyncMode ? 'queued' : 'running',
      include_id_count_checks: includeDiagnostics,
      collapse_invoice_duplicates: collapseInvoiceDuplicates,
      include_invoice_detail: includeInvoiceDetail,
      async: asyncMode,
      repro_query_seconds: reproQuerySeconds,
      window_alignment: {
        invoice_window: { start: startDate, end: endDate },
        revenue_window: { start_month: `${months[0]}-01`, end_month: `${months[months.length - 1]}-01`, months }
      },
      steps: []
    };

    if (asyncMode) {
      await writeS3Json('gwi-raw-us-east-2-pc', `${logKeyPrefix}/run_log.json`, runLog);
      await lambda.invoke({
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: JSON.stringify({
          internal_action: 'revenue_repro_run',
          payload: {
            report_name: reportName,
            start_date: startDate,
            end_date: endDate,
            include_id_count_checks: includeDiagnostics,
            collapse_invoice_duplicates: collapseInvoiceDuplicates,
            include_invoice_detail: includeInvoiceDetail,
            run_id,
            run_at,
            async: false
          }
        })
      }).promise();
      return response(202, {
        ok: true,
        success: true,
        status: 'queued',
        run_id,
        run_log_key: `${logKeyPrefix}/run_log.json`,
        result_key: `${runKeyPrefix}/result.json`
      });
    }

    try {
      const queryPromises = [
        executeFreeformQuery(revenueReportSQL, {}, reproQuerySeconds),
        executeFreeformQuery(revenueBySystemSQL, {}, reproQuerySeconds),
        executeFreeformQuery(countPivotSQL, {}, reproQuerySeconds)
      ];
      if (includeInvoiceDetail) {
        queryPromises.push(executeFreeformQuery(invoiceDetailSQL, {}, reproQuerySeconds));
      }
      const queryResults = await Promise.all(queryPromises);
      const revenueReport = queryResults[0];
      const revenueSystem = queryResults[1];
      const countPivot = queryResults[2];
      const invoiceDetail = includeInvoiceDetail ? queryResults[3] : null;

      const revenueReportRows = stripHeaderRow(revenueReport.columns, revenueReport.rows);
      const revenueSystemRows = stripHeaderRow(revenueSystem.columns, revenueSystem.rows);
      const countPivotRows = stripHeaderRow(countPivot.columns, countPivot.rows);
      const invoiceDetailRows = includeInvoiceDetail
        ? stripHeaderRow(invoiceDetail.columns, invoiceDetail.rows)
        : [];

      const revenueReportColumns = Array.isArray(revenueReport.columns) ? revenueReport.columns : [];
      const revenueMetaColumns = revenueReportColumns.slice(0, 8);
      const revenueMonthColumns = revenueReportColumns.slice(8);
      const monthMeta = revenueMonthColumns.map((col) => {
        const raw = String(col || '');
        const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return null;
        return { year: Number(match[1]), month: Number(match[2]) - 1 };
      });
      const ytdYear = endMonthKey.getFullYear();
      const ytdCutoffMonth = endMonthKey.getMonth();
      const formattedRevenueColumns = [
        ...revenueMetaColumns,
        ...revenueMonthColumns,
        null,
        null,
        ...revenueMetaColumns,
        ...revenueMonthColumns,
        null,
        null,
        null
      ];
      const separatorRow = formattedRevenueColumns.map((col) => (col === null ? null : '-------'));
      const formattedRevenueRows = revenueReportRows.map((row) => {
        const metaValues = revenueMetaColumns.map((_, idx) => row[idx] ?? null);
        const monthValues = revenueMonthColumns.map((_, idx) => row[revenueMetaColumns.length + idx] ?? null);
        const countValues = monthValues.map((val) => (Number(val || 0) > 0 ? 1 : 0));
        const ytdTotal = monthValues.reduce((sum, val, idx) => {
          const meta = monthMeta[idx];
          if (!meta) return sum;
          if (meta.year === ytdYear && meta.month < ytdCutoffMonth) {
            return sum + Number(val || 0);
          }
          return sum;
        }, 0);
        return [
          ...metaValues,
          ...monthValues,
          null,
          null,
          ...metaValues,
          ...countValues,
          null,
          null,
          ytdTotal || 0
        ];
      });
      const revenueReportSheet = [
        formattedRevenueColumns,
        separatorRow,
        ...formattedRevenueRows
      ];
      const revenueReportCsv = rowsToCSV(formattedRevenueColumns, [separatorRow, ...formattedRevenueRows]);
      const revenueSystemCsv = rowsToCSV(revenueSystem.columns, revenueSystemRows);
      const countPivotCsv = rowsToCSV(countPivot.columns, countPivotRows);
      const invoiceDetailCsv = includeInvoiceDetail
        ? rowsToCSV(invoiceDetail.columns, invoiceDetailRows)
        : null;

      await s3.putObject({
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: `${runKeyPrefix}/revenue_report.csv`,
        Body: revenueReportCsv,
        ContentType: 'text/csv'
      }).promise();
      await s3.putObject({
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: `${runKeyPrefix}/revenue_by_system.csv`,
        Body: revenueSystemCsv,
        ContentType: 'text/csv'
      }).promise();
      await s3.putObject({
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: `${runKeyPrefix}/customer_counts.csv`,
        Body: countPivotCsv,
        ContentType: 'text/csv'
      }).promise();
      if (includeInvoiceDetail) {
        await s3.putObject({
          Bucket: 'gwi-raw-us-east-2-pc',
          Key: `${runKeyPrefix}/${collapseInvoiceDuplicates ? 'invoice_detail_collapsed.csv' : 'invoice_detail.csv'}`,
          Body: invoiceDetailCsv,
          ContentType: 'text/csv'
        }).promise();
      }

      const pivotHeader = ['Row Labels', ...months.map((m) => `Sum of ${m}`)];
      const emptyRow = Array(pivotHeader.length).fill(null);
      const revenuePivotSheet = [
        [...emptyRow],
        [...emptyRow],
        pivotHeader,
        ['---------', ...months.map(() => 0)],
        ...revenueSystemRows.map((row) => [row[0] || 'Unmapped', ...row.slice(1)])
      ];
      const countPivotSheet = [
        [...emptyRow],
        [...emptyRow],
        pivotHeader,
        ['---------', ...months.map(() => 0)],
        ...countPivotRows.map((row) => [row[0] || 'Unmapped', ...row.slice(1)])
      ];
      const monthEndDates = months.map((month) => {
        const [year, mm] = month.split('-').map(Number);
        const end = new Date(Date.UTC(year, mm, 0));
        return end.toISOString().slice(0, 10);
      });
      const analysisHeader = [null, ...monthEndDates];
      const analysisSheet = [
        ['Revenue by System ID', ...Array(monthEndDates.length).fill(null)],
        [...Array(monthEndDates.length + 1).fill(null)],
        analysisHeader,
        ...revenueSystemRows.map((row) => [row[0] || 'Unmapped', ...row.slice(1)])
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(analysisSheet), 'Analysis');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(revenuePivotSheet), 'Revenue Pivot');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(countPivotSheet), 'Count Pivot');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(revenueReportSheet), 'RevenueReport');

      const workbookBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const workbookKey = `${runKeyPrefix}/RevenueReport.xlsx`;
      await s3.putObject({
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: workbookKey,
        Body: workbookBuffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }).promise();

      const diagnostics = {};
      if (includeDiagnostics) {
        const customerSpine = await executeFreeformQuery(
          'SELECT COUNT(*) AS rows_total, COUNT(DISTINCT customer_id) AS distinct_plat_ids FROM curated_core.dim_customer_platt_v1_1 LIMIT 1;',
          {},
          reproQuerySeconds
        );
        const ssotSnapshot = await executeFreeformQuery(
          "SELECT COUNT(*) AS rows_total, COUNT(DISTINCT username) AS distinct_plat_ids FROM curated_core.platt_customer_current_ssot WHERE LOWER(COALESCE(sensitive_p, '')) <> 'y' LIMIT 1;",
          {},
          reproQuerySeconds
        );
        const invoicedCustomers = await executeFreeformQuery(
          `SELECT COUNT(DISTINCT customer_id) AS distinct_invoiced_customers FROM curated_core.invoice_line_item_repro_v1 WHERE invoice_date >= DATE '${startDate}' AND invoice_date <= DATE '${endDate}';`,
          {},
          reproQuerySeconds
        );
        diagnostics.customer_spine = {
          rows_total: Number(customerSpine.rows?.[1]?.[0] || customerSpine.rows?.[0]?.[0] || 0),
          distinct_plat_ids: Number(customerSpine.rows?.[1]?.[1] || customerSpine.rows?.[0]?.[1] || 0),
          execution_id: customerSpine.query_execution_id
        };
        diagnostics.ssot_snapshot = {
          rows_total: Number(ssotSnapshot.rows?.[1]?.[0] || ssotSnapshot.rows?.[0]?.[0] || 0),
          distinct_plat_ids: Number(ssotSnapshot.rows?.[1]?.[1] || ssotSnapshot.rows?.[0]?.[1] || 0),
          execution_id: ssotSnapshot.query_execution_id
        };
        diagnostics.distinct_invoiced_customers = {
          count: Number(invoicedCustomers.rows?.[1]?.[0] || invoicedCustomers.rows?.[0]?.[0] || 0),
          execution_id: invoicedCustomers.query_execution_id
        };
      }

      const resultPayload = {
        ok: true,
        success: true,
        run_id,
        run_at,
        report_name: reportName,
        window_alignment: runLog.window_alignment,
        revenue_report: {
          row_count: revenueReportRows.length,
          columns: revenueReport.columns,
          evidence: { athena_query_execution_id: revenueReport.query_execution_id, generated_sql: revenueReport.sql },
          s3_artifacts: { csv: `${runKeyPrefix}/revenue_report.csv` }
        },
        revenue_by_system: {
          row_count: revenueSystemRows.length,
          columns: revenueSystem.columns,
          evidence: { athena_query_execution_id: revenueSystem.query_execution_id, generated_sql: revenueSystem.sql },
          s3_artifacts: { csv: `${runKeyPrefix}/revenue_by_system.csv` }
        },
        count_pivot: {
          row_count: countPivotRows.length,
          columns: countPivot.columns,
          evidence: { athena_query_execution_id: countPivot.query_execution_id, generated_sql: countPivot.sql },
          s3_artifacts: { csv: `${runKeyPrefix}/customer_counts.csv` }
        },
        invoice_detail: includeInvoiceDetail
          ? {
              row_count: invoiceDetailRows.length,
              columns: invoiceDetail.columns,
              preview: invoiceDetailRows.slice(0, 10).map((row) => {
                const values = Array.isArray(row) ? row : Object.values(row || {});
                return {
                  customer_id: values[0],
                  system: values[1],
                  invoice_id: values[2],
                  invoice_date: values[3],
                  product: values[4],
                  total: values[5]
                };
              }),
              mode: collapseInvoiceDuplicates ? 'collapsed' : 'default',
              evidence: { athena_query_execution_id: invoiceDetail.query_execution_id, generated_sql: invoiceDetail.sql },
              s3_artifacts: { csv: `${runKeyPrefix}/${collapseInvoiceDuplicates ? 'invoice_detail_collapsed.csv' : 'invoice_detail.csv'}` }
            }
          : {
              skipped: true,
              reason: 'invoice_detail_not_requested',
              mode: collapseInvoiceDuplicates ? 'collapsed' : 'default'
            },
        workbook: {
          sheets: ['Analysis', 'Revenue Pivot', 'Count Pivot', 'RevenueReport'],
          s3_artifacts: { xlsx: workbookKey }
        },
        diagnostics
      };

      const resultKey = `${runKeyPrefix}/result.json`;
      await writeS3Json('gwi-raw-us-east-2-pc', resultKey, resultPayload);
      await writeS3Json('gwi-raw-us-east-2-pc', `${logKeyPrefix}/run_log.json`, {
        ...runLog,
        status: 'complete',
        completed_at: new Date().toISOString(),
        result_key: resultKey
      });

      if (isInternalReproRun) {
        return { ok: true, status: 'complete', run_id };
      }

      return response(200, resultPayload);
    } catch (err) {
      await writeS3Json('gwi-raw-us-east-2-pc', `${logKeyPrefix}/run_log.json`, {
        ...runLog,
        status: 'failed',
        error: err.message || String(err),
        failed_at: new Date().toISOString()
      });
      return response(500, { ok: false, success: false, error: err.message || 'Revenue repro failed' });
    }
  }

  if (path.endsWith('/artifacts/download') && method === 'POST') {
    const key = payload.key || payload.s3_key || null;
    if (!key) {
      return response(400, { ok: false, success: false, error: 'key required' });
    }
    try {
      const url = await s3.getSignedUrlPromise('getObject', {
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: key,
        Expires: 900
      });
      return response(200, { ok: true, success: true, download_url: url });
    } catch (err) {
      return response(500, { ok: false, success: false, error: err.message || 'Failed to sign URL' });
    }
  }

  if (path.endsWith('/cases/action') && method === 'POST') {
    const caseId = payload.case_id || payload.caseId;
    const action = String(payload.action || '').toUpperCase();
    if (!caseId || !action) {
      return response(400, { ok: false, error: 'case_id and action required' });
    }
    if (!CASE_RUNTIME_ENABLED) {
      return response(403, { ok: false, error: 'Case runtime disabled' });
    }
    const actionValidation = validateWithSchema(ACTION_INTENT_VALIDATOR, {
      action,
      case_id: caseId,
      question: payload.question || null,
      report_spec: payload.report_spec || payload.reportSpec || null
    });
    if (!actionValidation.valid) {
      return response(400, { ok: false, error: `action intent invalid: ${actionValidation.errors.join('; ')}` });
    }

    const caseRecord = await loadCaseRecord(caseId);
    if (!caseRecord) {
      return response(404, { ok: false, error: 'Case not found' });
    }

    if (action === 'SHOW_EVIDENCE') {
      return response(200, { ok: true, case_id: caseId, evidence_pack: caseRecord.evidence_pack || null });
    }

    if (action === 'EXPORT_CSV') {
      if (!REPORT_EXPORT_ENABLED) {
        return response(403, { ok: false, error: 'Report export disabled' });
      }
      if (!caseRecord.generated_sql) {
        return response(400, { ok: false, error: 'No SQL available for export' });
      }
      const safeSql = ensureLimit(caseRecord.generated_sql, MAX_RESULT_ROWS_HARD);
      validateReadOnlySql(safeSql);
      validateSqlAllowlist(safeSql);
      const exportResult = await executeFreeformQuery(safeSql, {});
      const exportRows = stripHeaderRow(exportResult.columns, exportResult.rows);
      const exportCsv = rowsToCSV(exportResult.columns, exportRows);
      const key = `raw/mac_ai_console/case_exports/${caseId}/export_${Date.now()}.csv`;
      await s3.putObject({
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: key,
        Body: exportCsv,
        ContentType: 'text/csv'
      }).promise();
      const url = await s3.getSignedUrlPromise('getObject', {
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: key,
        Expires: 900
      });
      await appendCaseArtifact(caseId, {
        type: 'export_csv',
        bucket: 'gwi-raw-us-east-2-pc',
        key,
        created_at: new Date().toISOString()
      });
      return response(200, { ok: true, success: true, case_id: caseId, s3_key: key, download_url: url });
    }

    if (action === 'EXPORT_XLSX') {
      if (!REPORT_EXPORT_ENABLED) {
        return response(403, { ok: false, error: 'Report export disabled' });
      }
      if (!caseRecord.generated_sql) {
        return response(400, { ok: false, error: 'No SQL available for export' });
      }
      const safeSql = ensureLimit(caseRecord.generated_sql, MAX_RESULT_ROWS_HARD);
      validateReadOnlySql(safeSql);
      validateSqlAllowlist(safeSql);
      const exportResult = await executeFreeformQuery(safeSql, {});
      const exportRows = stripHeaderRow(exportResult.columns, exportResult.rows);
      const workbook = rowsToWorkbook(exportResult.columns, exportRows, 'Export');
      const key = `raw/mac_ai_console/case_exports/${caseId}/export_${Date.now()}.xlsx`;
      await s3.putObject({
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: key,
        Body: workbook,
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }).promise();
      const url = await s3.getSignedUrlPromise('getObject', {
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: key,
        Expires: 900
      });
      await appendCaseArtifact(caseId, {
        type: 'export_xlsx',
        bucket: 'gwi-raw-us-east-2-pc',
        key,
        created_at: new Date().toISOString()
      });
      return response(200, { ok: true, success: true, case_id: caseId, s3_key: key, download_url: url });
    }

    if (action === 'BUILD_REPORT') {
      if (!REPORT_EXPORT_ENABLED) {
        return response(403, { ok: false, error: 'Report export disabled' });
      }
      const reportSpec = payload.report_spec || payload.reportSpec || null;
      const reportName = sanitizeReportName(payload.report_name || reportSpec?.name || `report_${caseId}`);
      let sql = caseRecord.generated_sql;
      let viewsUsed = caseRecord.views_used || [];
      let queryResult = null;

      if (reportSpec) {
        const compiled = compileReportSpec(reportSpec);
        sql = compiled.sql;
        viewsUsed = compiled.views_used || [];
        if (compiled.queryDef) {
          queryResult = await executeQuery(compiled.queryDef, compiled.params || {});
        } else {
          queryResult = await executeFreeformQuery(sql, {});
        }
      } else {
        if (!sql) {
          return response(400, { ok: false, error: 'No SQL available for report generation' });
        }
        const safeSql = ensureLimit(sql, MAX_RESULT_ROWS_HARD);
        validateReadOnlySql(safeSql);
        validateSqlAllowlist(safeSql);
        queryResult = await executeFreeformQuery(safeSql, {});
        sql = safeSql;
      }

      const rows = stripHeaderRow(queryResult.columns, queryResult.rows);
      const format = String(reportSpec?.format || 'csv').toLowerCase();
      const keyBase = `${REPORTS_PREFIX}${caseId}/${reportName}_${Date.now()}`;
      let key = `${keyBase}.csv`;
      let contentType = 'text/csv';
      let body = rowsToCSV(queryResult.columns, rows);
      if (format === 'xlsx') {
        key = `${keyBase}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        body = rowsToWorkbook(queryResult.columns, rows, reportName);
      }

      await s3.putObject({
        Bucket: REPORTS_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType
      }).promise();
      const url = await s3.getSignedUrlPromise('getObject', {
        Bucket: REPORTS_BUCKET,
        Key: key,
        Expires: 900
      });
      await appendCaseArtifact(caseId, {
        type: format === 'xlsx' ? 'report_xlsx' : 'report_csv',
        bucket: REPORTS_BUCKET,
        key,
        report_name: reportName,
        created_at: new Date().toISOString()
      });
      return response(200, {
        ok: true,
        success: true,
        case_id: caseId,
        report_name: reportName,
        s3_key: key,
        download_url: url,
        views_used: viewsUsed,
        generated_sql: sql
      });
    }

    if (action === 'VERIFY_ACROSS_SYSTEMS') {
      if (!VERIFY_ACTION_ENABLED) {
        return response(403, { ok: false, error: 'Verification disabled' });
      }
      const verification = await runCrossSystemVerification(caseRecord);
      const normalizedVerification = verification || {
        status: 'unavailable',
        message: 'Verification unavailable.'
      };
      return response(200, {
        ok: true,
        case_id: caseId,
        verification: normalizedVerification,
        ...normalizedVerification
      });
    }

    if (action === 'DRILL_DOWN') {
      return response(200, {
        ok: true,
        case_id: caseId,
        status: 'unsupported',
        message: 'Drill-down requests require a report_spec. Use BUILD_REPORT with filters.'
      });
    }

    return response(400, { ok: false, error: `Unsupported action: ${action}` });
  }

  if (path.endsWith('/engine/run') && method === 'POST') {
    const bucket = 'gwi-raw-us-east-2-pc';
    const projectId = payload.project_id || payload.projectId;
    const scenario = payload.scenario;
    if (!projectId) {
      return response(400, { ok: false, success: false, error: 'project_id required' });
    }
    if (!scenario || !scenario.inputs) {
      return response(400, { ok: false, success: false, error: 'scenario with inputs required' });
    }

    const { scenario_id: rawScenarioId, scenario_name: rawScenarioName, inputs, is_test = false } = scenario;
    const scenario_id = rawScenarioId || `scenario_${Date.now()}`;
    const projectQuery = `SELECT * FROM curated_core.projects_enriched WHERE project_id = ${escapeSqlValue(projectId)} LIMIT 1`;
    const { row: projectRow } = await querySingleRow(projectQuery);
    const projectName = projectRow?.project_name || projectId || 'Project';

    let scenarioName = rawScenarioName && rawScenarioName.trim().length > 0 && rawScenarioName.trim() !== 'Unnamed Scenario'
      ? rawScenarioName.trim()
      : `${projectName} — Scenario`;

    const registry = await loadScenariosRegistry(projectId);
    const updatedRegistry = upsertScenario(registry, {
      scenario_id,
      scenario_name: scenarioName,
      is_test,
      inputs
    });
    await saveScenariosRegistry(projectId, updatedRegistry);

    const modelResults = runFinancialModel(inputs);

    const runId = `run_${Date.now()}`;
    const outputPrefix = `raw/projects_pipeline/model_outputs/${projectId}/${scenario_id}/${runId}/`;
    const outputs = {
      inputs_key: `${outputPrefix}inputs.json`,
      summary_metrics_key: `${outputPrefix}summary_metrics.csv`,
      economics_monthly_key: `${outputPrefix}economics_monthly.csv`
    };

    const inputsPayload = {
      project_id: projectId,
      scenario_id,
      scenario_name: scenarioName,
      run_id: runId,
      created_at: new Date().toISOString(),
      inputs,
      metrics: modelResults.metrics
    };

    try {
      await s3.putObject({
        Bucket: bucket,
        Key: outputs.inputs_key,
        Body: JSON.stringify(inputsPayload, null, 2),
        ContentType: 'application/json'
      }).promise();

      await s3.putObject({
        Bucket: bucket,
        Key: outputs.summary_metrics_key,
        Body: generateMetricsCSV(modelResults.metrics),
        ContentType: 'text/csv; charset=utf-8'
      }).promise();

      await s3.putObject({
        Bucket: bucket,
        Key: outputs.economics_monthly_key,
        Body: generateMonthlyCSV(modelResults.monthly),
        ContentType: 'text/csv; charset=utf-8'
      }).promise();
    } catch (err) {
      return response(500, { ok: false, success: false, error: err.message || 'Failed to write model outputs' });
    }

    return response(200, {
      ok: true,
      success: true,
      project_id: projectId,
      scenario_id,
      scenario_name: scenarioName,
      run_id: runId,
      outputs,
      metrics: modelResults.metrics,
      metric_explanations: modelResults.metric_explanations || [],
      is_test: is_test
    });
  }

  if (path.endsWith('/engine/portfolio') && method === 'POST') {
    const bucket = 'gwi-raw-us-east-2-pc';
    const { projects, discount_rate_pct = 10, analysis_months = 120 } = payload;
    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      return response(400, { ok: false, success: false, error: 'projects array required' });
    }
    try {
      const projectData = [];
      for (const proj of projects) {
        const { project_id, scenario_id, run_id, start_month_offset = 0 } = proj;
        if (!project_id || !scenario_id || !run_id) {
          return response(400, { ok: false, success: false, error: 'project_id, scenario_id, run_id required' });
        }
        const monthlyKey = `raw/projects_pipeline/model_outputs/${project_id}/${scenario_id}/${run_id}/economics_monthly.csv`;
        const csvContent = await readS3Text(bucket, monthlyKey);
        const lines = csvContent.split('\n');
        const headers = lines[0].split(',');
        const monthly = [];
        for (let i = 1; i < lines.length; i += 1) {
          if (!lines[i].trim()) continue;
          const values = lines[i].split(',');
          const row = {};
          headers.forEach((h, idx) => {
            row[h.trim()] = values[idx];
          });
          monthly.push(row);
        }
        projectData.push({ project_id, scenario_id, run_id, start_month_offset, monthly });
      }

      const portfolioMonthly = [];
      const monthly_rate = discount_rate_pct / 100 / 12;
      let cumulative_external_cash = 0;
      let peak_external_cash = 0;
      let total_capex_book_sum = 0;

      for (let t = 1; t <= analysis_months; t += 1) {
        let portfolio_capex_book = 0;
        let portfolio_ebitda = 0;
        let portfolio_revenue = 0;
        let portfolio_opex = 0;
        let portfolio_subscribers = 0;

        for (const proj of projectData) {
          const adjusted_month = t - proj.start_month_offset;
          if (adjusted_month < 1 || adjusted_month > proj.monthly.length) continue;
          const projRow = proj.monthly[adjusted_month - 1];
          portfolio_capex_book += Number(projRow.capex_book) || 0;
          portfolio_ebitda += Number(projRow.ebitda) || 0;
          portfolio_revenue += Number(projRow.revenue) || 0;
          portfolio_opex += Number(projRow.opex) || 0;
          portfolio_subscribers += Number(projRow.subscribers) || 0;
        }

        let external_cash_this_month = 0;
        if (portfolio_ebitda < 0) {
          external_cash_this_month = portfolio_capex_book - portfolio_ebitda;
        } else {
          external_cash_this_month = Math.max(0, portfolio_capex_book - portfolio_ebitda);
        }

        cumulative_external_cash += external_cash_this_month;
        peak_external_cash = Math.max(peak_external_cash, cumulative_external_cash);
        total_capex_book_sum += portfolio_capex_book;

        const fcf = portfolio_ebitda - portfolio_capex_book;
        const discountFactor = Math.pow(1 + monthly_rate, -t);
        const pv = fcf * discountFactor;

        portfolioMonthly.push({
          month: t,
          subscribers: portfolio_subscribers,
          revenue: portfolio_revenue.toFixed(2),
          opex: portfolio_opex.toFixed(2),
          ebitda: portfolio_ebitda.toFixed(2),
          capex_book: portfolio_capex_book.toFixed(2),
          external_cash_this_month: external_cash_this_month.toFixed(2),
          cumulative_external_cash: cumulative_external_cash.toFixed(2),
          fcf: fcf.toFixed(2),
          pv: pv.toFixed(2)
        });
      }

      const actual_cash_invested = peak_external_cash;
      const npv = portfolioMonthly.reduce((sum, m) => sum + parseFloat(m.pv), -actual_cash_invested);
      let irr = null;
      let irrStatus = 'OK';

      const hasPositiveFCF = portfolioMonthly.some(m => parseFloat(m.fcf) > 0);
      if (actual_cash_invested <= 0) {
        irrStatus = 'NO_INVESTMENT';
      } else if (!hasPositiveFCF) {
        irrStatus = 'NO_POSITIVE_CASHFLOWS';
      } else {
        const testNPV = (rate) => {
          let npvVal = -actual_cash_invested;
          portfolioMonthly.forEach((m, idx) => {
            npvVal += parseFloat(m.fcf) / Math.pow(1 + rate, idx + 1);
          });
          return npvVal;
        };
        const npvAtNeg90 = testNPV(-0.9);
        const npvAtPos200 = testNPV(2.0);
        if (npvAtNeg90 * npvAtPos200 > 0) {
          irrStatus = 'NO_SIGN_CHANGE';
        } else {
          let low = -0.9;
          let high = 2.0;
          for (let i = 0; i < 50; i += 1) {
            const mid = (low + high) / 2;
            const npvMid = testNPV(mid);
            if (Math.abs(npvMid) < 0.01) {
              irr = mid;
              break;
            }
            const npvLow = testNPV(low);
            if (npvLow * npvMid < 0) {
              high = mid;
            } else {
              low = mid;
            }
          }
        }
      }

      return response(200, {
        ok: true,
        success: true,
        portfolio_monthly: portfolioMonthly,
        summary: {
          actual_cash_invested: Math.round(actual_cash_invested),
          peak_external_cash: Math.round(peak_external_cash),
          total_capex_book: Math.round(total_capex_book_sum),
          npv: Math.round(npv),
          irr_monthly_decimal: irr,
          irr_status: irrStatus
        }
      });
    } catch (err) {
      return response(500, { ok: false, success: false, error: err.message || 'Portfolio model failed' });
    }
  }

  if (path.endsWith('/monday/webhook') && method === 'POST') {
    if (payload.challenge) {
      return response(200, { challenge: payload.challenge });
    }

    try {
      const eventPayload = payload.event || payload;
      const mondayConfig = await getMondayConfig();
      if (!mondayConfig?.token) {
        return response(500, { ok: false, error: 'Monday token not configured' });
      }
      const mondayMapping = withMondayColumns(MONDAY_MAPPING, mondayConfig);
      if (!mondayMapping?.field_map) {
        return response(500, { ok: false, error: 'Monday mapping not configured' });
      }

      const webhookSecret = mondayConfig.webhook_secret;
      if (webhookSecret) {
        const signature = getHeaderValue(event.headers, 'x-monday-signature');
        if (!signature || !rawBody) {
          return response(401, { ok: false, error: 'Missing Monday signature' });
        }
        const validSignature = verifyMondaySignature(signature, rawBody, webhookSecret);
        if (!validSignature) {
          return response(401, { ok: false, error: 'Invalid Monday signature' });
        }
      }

      const boardId = eventPayload.boardId || eventPayload.board_id || mondayConfig.pipeline_board_id;
      const itemId = eventPayload.pulseId || eventPayload.itemId || eventPayload.item_id || eventPayload.pulse_id;

      if (!boardId || !itemId) {
        return response(400, { ok: false, error: 'Missing boardId or itemId in webhook payload' });
      }

      const item = await fetchMondayItem(boardId, itemId, mondayConfig.token);
      if (!item) {
        return response(404, { ok: false, error: 'Monday item not found' });
      }

      const mapped = mapMondayItem(item, mondayMapping) || {};
      const projectId = mapped.project_id || `monday-${itemId}`;
      const timestamp = new Date().toISOString();
      const datePart = timestamp.slice(0, 10);
      const safeTs = timestamp.replace(/[:.]/g, '').replace('Z', '000Z');

      const stagingKey = `raw/projects_pipeline/monday_staging/monday_update_${safeTs}.json`;
      await writeS3Json('gwi-raw-us-east-2-pc', stagingKey, payload);

      const filterCheck = passesSyncFilter(mapped, mondayMapping);
      if (!filterCheck.ok) {
        return response(200, {
          ok: true,
          skipped: true,
          reason: filterCheck.reason,
          project_id: projectId,
          staging_key: stagingKey
        });
      }

      let calcResult = null;
      let missingInputs = [];
      let dataQualityStatus = null;
      try {
        const colMap = buildColumnValueMapByTitle(item.column_values || []);
        let { inputs: rawInputs, derived } = computeBaselineInputsFromColumnMap(colMap);
        let inputs = applyBaselineDefaults(rawInputs, derived);
        missingInputs = listMissingBaselineInputs(inputs);

        if (missingInputs.length && projectId) {
          const legacyRow = await fetchLegacyDefaults(projectId);
          if (legacyRow) {
            const legacyApplied = applyLegacyDefaultsToInputs(inputs, derived, legacyRow);
            inputs = legacyApplied.inputs;
            derived = legacyApplied.derived;
            if (Object.keys(legacyApplied.defaultsUsed || {}).length) {
              await updateParentCalculatedFields({
                boardId,
                itemId,
                token: mondayConfig.token,
                valuesByTitle: legacyApplied.defaultsUsed
              });
              applyDefaultsToMapped(mapped, legacyApplied.defaultsUsed);
            }
            missingInputs = listMissingBaselineInputs(inputs);
          }
        }

        if (missingInputs.length) {
          dataQualityStatus = 'Missing Inputs';
        } else {
          dataQualityStatus = 'Ready';
          const modelResults = runFinancialModel(inputs);
          const outputsDerived = computeDerivedOutputs(inputs, modelResults.metrics, {
            constructionCost: derived.constructionCost,
            installCost: derived.installCost
          });
          await updateParentCalculatedFields({
            boardId,
            itemId,
            token: mondayConfig.token,
            valuesByTitle: outputsDerived
          });

          mapped.subscribers = outputsDerived['Subscribers'] ?? mapped.subscribers;
          mapped.take_rate = outputsDerived['Take Rate'] ?? mapped.take_rate;
          mapped.revenue = outputsDerived['Revenue'] ?? mapped.revenue;
          mapped.cash_flow = outputsDerived['Cash Flow'] ?? mapped.cash_flow;
          mapped.irr = outputsDerived['IRR'] ?? mapped.irr;
          mapped.moic = outputsDerived['MOIC'] ?? mapped.moic;
          mapped.npv = outputsDerived['NPV'] ?? mapped.npv;
          mapped.subscription_rate = outputsDerived['Subscription Rate'] ?? mapped.subscription_rate;
          mapped.subscription_months = outputsDerived['Subscription Months'] ?? mapped.subscription_months;
          mapped.capex_per_passing = outputsDerived['Capex per Passing'] ?? mapped.capex_per_passing;
          mapped.construction_plus_install_cost = outputsDerived['Construction + Install Cost'] ?? mapped.construction_plus_install_cost;
          mapped.construction_cost_per_passing = outputsDerived['Construction Cost per Passing'] ?? mapped.construction_cost_per_passing;
          mapped.install_cost_per_subscriber = outputsDerived['Install Cost per Subscriber'] ?? mapped.install_cost_per_subscriber;
          mapped.total_cost_per_passing = outputsDerived['Total Cost per Passing'] ?? mapped.total_cost_per_passing;

          calcResult = {
            inputs,
            metrics: modelResults.metrics
          };
        }
      } catch (err) {
        calcResult = { error: err.message || 'Calculation failed' };
      }

      if (dataQualityStatus) {
        try {
          await setDataQualityStatus({
            boardId,
            itemId,
            token: mondayConfig.token,
            status: dataQualityStatus
          });
        } catch (_) {
          // Non-blocking: data quality badge should not stop sync.
        }
      }

      const updateRecord = {
        project_id: projectId,
        state: mapped.state || null,
        stage: mapped.stage || null,
        priority: mapped.priority || null,
        owner: mapped.owner || null,
        notes: mapped.notes || null,
        updated_by: eventPayload.userId || eventPayload.user_id || null,
        updated_ts: timestamp,
        dt: datePart
      };

      const updateKey = `curated_core/project_updates/project_update_${safeTs}.json`;
      await writeS3Json('gwi-raw-us-east-2-pc', updateKey, updateRecord);

      if (mondayMapping?.field_map) {
        const fieldKeys = MONDAY_INPUT_FIELDS && MONDAY_INPUT_FIELDS.length > 0
          ? MONDAY_INPUT_FIELDS
          : Object.keys(mondayMapping.field_map);
        const header = [...fieldKeys, 'updated_by', 'updated_ts'].join(',');
        const row = fieldKeys.map((k) => `"${String(mapped[k] ?? '').replace(/"/g, '""')}"`).join(',');
        const updatedBy = `"${String(updateRecord.updated_by ?? '').replace(/"/g, '""')}"`;
        const updatedTs = `"${String(updateRecord.updated_ts ?? '').replace(/"/g, '""')}"`;
        const csvBody = `${header}\n${row},${updatedBy},${updatedTs}\n`;
        const inputKey = `raw/projects_pipeline/monday_input/projects_input__${safeTs}.csv`;
        await s3
          .putObject({
            Bucket: 'gwi-raw-us-east-2-pc',
            Key: inputKey,
            Body: csvBody,
            ContentType: 'text/csv; charset=utf-8'
          })
          .promise();
      }

      // Write back locked fields from curated_core.projects_enriched
      const sql = `SELECT * FROM curated_core.projects_enriched WHERE project_id = ${escapeSqlValue(projectId)} LIMIT 1`;
      const { row: projectRow } = await querySingleRow(sql);
      const writeback = await writeBackToMonday({
        boardId,
        itemId,
        projectRow,
        mapping: mondayMapping,
        token: mondayConfig.token
      });

      return response(200, {
        ok: true,
        project_id: projectId,
        staging_key: stagingKey,
        update_key: updateKey,
        writeback,
        calc: calcResult,
        missing_inputs: missingInputs
      });
    } catch (err) {
      return response(500, { ok: false, error: err.message || 'Monday webhook failed' });
    }
  }

  if (path.endsWith('/monday/scenario-subitem') && method === 'POST') {
    try {
      const mondayConfig = await getMondayConfig();
      if (!mondayConfig?.token) {
        return response(500, { ok: false, success: false, error: 'Monday token not configured' });
      }
      const mondayMapping = withMondayColumns(MONDAY_MAPPING, mondayConfig);
      let parentItemId = payload.monday_item_id || payload.parent_item_id;
      const boardId = payload.monday_board_id || mondayConfig.pipeline_board_id || mondayMapping?.board_id;
      const projectId = payload.project_id || payload.projectId || null;
      const scenarioName = payload.scenario_name || payload.scenarioName || payload.scenario?.scenario_name;
      if (!parentItemId && projectId && boardId) {
        const existing = await findMondayItemByProjectId(boardId, projectId, mondayMapping, mondayConfig.token);
        parentItemId = existing?.id || null;
      }
      if (!parentItemId || !scenarioName) {
        return response(400, { ok: false, success: false, error: 'monday_item_id or project_id and scenario_name required' });
      }

      const createQuery = `mutation { create_subitem(parent_item_id: ${parentItemId}, item_name: \"${String(scenarioName).replace(/\"/g, '\\\\\"')}\") { id name } }`;
      const createData = await mondayGraphQL({ query: createQuery, token: mondayConfig.token });
      const subitemId = createData?.data?.create_subitem?.id;
      if (!subitemId) {
        return response(500, { ok: false, success: false, error: 'Failed to create subitem' });
      }

      if (boardId) {
        let targetBoardId = String(boardId);
        let columnValues = {};
        try {
          const subitemsBoardId = await getSubitemsBoardId(boardId, mondayConfig.token);
          if (subitemsBoardId) {
            targetBoardId = String(subitemsBoardId);
            const subitemColumns = await getMondayBoardColumns(subitemsBoardId, mondayConfig.token);
            const colMap = buildColumnIdMapByTitle(subitemColumns);
            const setNumber = (title, value) => {
              const id = colMap[title.toLowerCase()];
              if (!id) return;
              columnValues[id] = String(value ?? 0);
            };
            setNumber('NPV', payload.npv);
            setNumber('IRR %', payload.irr_pct);
            setNumber('MOIC', payload.moic);
            setNumber('Cash Invested', payload.cash_invested);
            setNumber('Peak Subs', payload.peak_subs);
            setNumber('Peak EBITDA', payload.peak_ebitda);

            const inputs = payload.inputs || payload.scenario_inputs || {};
            const toPct = (val) => {
              if (val === null || val === undefined || val === '') return null;
              const num = Number(val);
              if (Number.isNaN(num)) return null;
              return num <= 1 ? num * 100 : num;
            };
            const setInput = (title, value) => {
              if (value === null || value === undefined || value === '') return;
              setNumber(title, value);
            };
            setInput('Passings', inputs.passings);
            setInput('Build Months', inputs.build_months);
            setInput('Total Capex', inputs.total_capex);
            setInput('ARPU Start', inputs.arpu_start);
            setInput('Penetration Start %', toPct(inputs.penetration_start_pct));
            setInput('Penetration Target %', toPct(inputs.penetration_target_pct));
            setInput('Ramp Months', inputs.ramp_months);
            setInput('Capex per Passing', inputs.capex_per_passing);
            setInput('Opex per Sub', inputs.opex_per_sub);
            setInput('Discount Rate %', toPct(inputs.discount_rate_pct));
            setInput('Analysis Months', inputs.analysis_months);

            const dateId = colMap['date'];
            if (dateId) {
              columnValues[dateId] = { date: new Date().toISOString().split('T')[0] };
            }
          }
        } catch (_) {
          // fall back to legacy column ids if lookup fails
        }

        if (!Object.keys(columnValues).length) {
          columnValues = {
            numbers1: String(payload.npv || 0),
            numbers2: String(payload.irr_pct || 0),
            numbers3: String(payload.moic || 0),
            numbers4: String(payload.cash_invested || 0),
            numbers5: String(payload.peak_subs || 0),
            numbers6: String(payload.peak_ebitda || 0),
            date1: { date: new Date().toISOString().split('T')[0] }
          };
        }

        const updateQuery = `mutation { change_multiple_column_values(item_id: ${subitemId}, board_id: ${targetBoardId}, column_values: ${JSON.stringify(JSON.stringify(columnValues))}) { id } }`;
        try {
          await mondayGraphQL({ query: updateQuery, token: mondayConfig.token });
        } catch (err) {
          const msg = String(err?.message || '');
          if (msg.includes('itemLinkMaxLocksExceeded')) {
            for (const [columnId, value] of Object.entries(columnValues)) {
              const valuePayload = JSON.stringify(String(value));
              const single = `mutation { change_column_value(board_id: ${targetBoardId}, item_id: ${subitemId}, column_id: \"${columnId}\", value: ${JSON.stringify(valuePayload)}) { id } }`;
              try {
                await mondayGraphQL({ query: single, token: mondayConfig.token });
              } catch (_) {
                // ignore per-column failure
              }
            }
          } else {
            throw err;
          }
        }
      }

      return response(200, { ok: true, success: true, subitem_id: subitemId, scenario_name: scenarioName });
    } catch (err) {
      return response(500, { ok: false, success: false, error: err.message || 'Monday subitem failed' });
    }
  }

  if (path.endsWith('/projects/baseline-scenario') && method === 'POST') {
    try {
      const mondayConfig = await getMondayConfig();
      if (!mondayConfig?.token) {
        return response(500, { ok: false, success: false, error: 'Monday token not configured' });
      }
      const mondayMapping = withMondayColumns(MONDAY_MAPPING, mondayConfig);
      const boardId = mondayConfig.pipeline_board_id || mondayMapping?.board_id;
      const projectId = payload.project_id || payload.projectId || null;
      let parentItemId = payload.monday_item_id || payload.parent_item_id || null;
      let scenarioName = payload.scenario_name || 'Baseline (from board)';
      const fallbackDefaults = payload.fallback_defaults || payload.fallbackDefaults || null;
      const modelProfile = payload.model_profile || payload.modelProfile || null;
      const normalizedModelProfile = normalizeModelProfileKey(modelProfile);
      const profileDefaults = getBaselineDefaultsForProfile(normalizedModelProfile);
      const allowDefaults = payload.use_defaults === true || payload.allow_defaults === true || payload.apply_defaults === true;
      let defaultsUsed = {};

      if (!boardId) {
        return response(500, { ok: false, success: false, error: 'Monday board_id not configured' });
      }

      if (!parentItemId && projectId) {
        const existing = await findMondayItemByProjectId(boardId, projectId, mondayMapping, mondayConfig.token);
        parentItemId = existing?.id || null;
      }
      if (!parentItemId) {
        return response(400, { ok: false, success: false, error: 'monday_item_id or project_id required' });
      }

      const itemQuery = `query { items(ids: [${parentItemId}]) { id name column_values { id text value column { id title type } } subitems { id name } } }`;
      const itemData = await mondayGraphQL({ query: itemQuery, token: mondayConfig.token });
      const item = itemData?.data?.items?.[0];
      if (!item) {
        return response(404, { ok: false, success: false, error: 'Monday item not found' });
      }

      const normalizedScenarioName = String(scenarioName).trim().toLowerCase();
      const existingScenario = (item.subitems || []).find((s) => {
        const name = String(s.name || '').trim().toLowerCase();
        if (!name) return false;
        return name === normalizedScenarioName || name.includes('baseline');
      });
      const existingSubitemId = existingScenario?.id || null;
      if (existingScenario && existingScenario?.name) {
        // Keep naming consistent with the existing baseline subitem.
        scenarioName = existingScenario.name;
      }

      const colMap = buildColumnValueMapByTitle(item.column_values || []);
      let { inputs: rawInputs, derived } = computeBaselineInputsFromColumnMap(colMap);
      let inputs = applyBaselineDefaults(rawInputs, derived, { applyAssumptions: false });
      inputs.model_profile = normalizedModelProfile;
      let missing = listMissingBaselineInputs(inputs);
      const suggestedDefaults = buildSuggestedDefaults(rawInputs, derived, profileDefaults);

      if (missing.length && projectId) {
        const legacyRow = await fetchLegacyDefaults(projectId);
        if (legacyRow) {
          const legacyApplied = applyLegacyDefaultsToInputs(inputs, derived, legacyRow);
          inputs = legacyApplied.inputs;
          derived = legacyApplied.derived;
          if (Object.keys(legacyApplied.defaultsUsed || {}).length) {
            await updateParentCalculatedFields({
              boardId,
              itemId: parentItemId,
              token: mondayConfig.token,
              valuesByTitle: legacyApplied.defaultsUsed
            });
          }
          missing = listMissingBaselineInputs(inputs);
        }
      }

      if (missing.length && fallbackDefaults) {
        if ((!inputs.passings || inputs.passings <= 0) && fallbackDefaults.passings) {
          inputs.passings = fallbackDefaults.passings;
          defaultsUsed['Passings'] = fallbackDefaults.passings;
        }
        if ((!inputs.build_months || inputs.build_months <= 0) && fallbackDefaults.build_months) {
          inputs.build_months = fallbackDefaults.build_months;
          defaultsUsed['Months to Completion'] = fallbackDefaults.build_months;
        }
        if ((!inputs.arpu_start || inputs.arpu_start <= 0) && fallbackDefaults.arpu_start) {
          inputs.arpu_start = fallbackDefaults.arpu_start;
          defaultsUsed['ARPU'] = fallbackDefaults.arpu_start;
        }
        if ((!inputs.capex_per_passing || inputs.capex_per_passing <= 0) && fallbackDefaults.capex_per_passing) {
          inputs.capex_per_passing = fallbackDefaults.capex_per_passing;
          defaultsUsed['Capex per Passing'] = fallbackDefaults.capex_per_passing;
        }
        if ((inputs.install_cost_per_subscriber == null || inputs.install_cost_per_subscriber === '') && fallbackDefaults.install_cost_per_subscriber != null) {
          inputs.install_cost_per_subscriber = fallbackDefaults.install_cost_per_subscriber;
          defaultsUsed['Install Cost per Subscriber'] = fallbackDefaults.install_cost_per_subscriber;
        }
        if ((inputs.opex_per_sub == null || inputs.opex_per_sub === '') && fallbackDefaults.opex_per_sub != null) {
          inputs.opex_per_sub = fallbackDefaults.opex_per_sub;
          defaultsUsed['opex_per_sub'] = fallbackDefaults.opex_per_sub;
        }
        if ((!inputs.total_capex || inputs.total_capex <= 0) && inputs.passings && inputs.capex_per_passing) {
          inputs.total_capex = inputs.passings * inputs.capex_per_passing;
          defaultsUsed['Investment'] = inputs.total_capex;
        }
        if (Object.keys(defaultsUsed).length) {
          await updateParentCalculatedFields({
            boardId,
            itemId: parentItemId,
            token: mondayConfig.token,
            valuesByTitle: defaultsUsed
          });
        }
        missing = listMissingBaselineInputs(inputs);
      }
      if (missing.length && allowDefaults) {
        const applied = applyExplicitDefaults(inputs, profileDefaults);
        inputs = applied.inputs;
        if (Object.keys(applied.defaultsUsed || {}).length) {
          defaultsUsed = { ...defaultsUsed, ...applied.defaultsUsed };
          await updateParentCalculatedFields({
            boardId,
            itemId: parentItemId,
            token: mondayConfig.token,
            valuesByTitle: applied.defaultsUsed
          });
        }
        missing = listMissingBaselineInputs(inputs);
      }
      if (missing.length) {
        try {
          await setDataQualityStatus({
            boardId,
            itemId: parentItemId,
            token: mondayConfig.token,
            status: 'Missing Inputs'
          });
        } catch (_) {
          // Non-blocking.
        }
        return response(400, {
          ok: false,
          success: false,
          error: 'Missing baseline inputs. Provide required fields or accept defaults.',
          missing_inputs: missing,
          suggested_defaults: suggestedDefaults,
          defaults_available: true
        });
      }

      if (allowDefaults) {
        inputs = applyBaselineDefaults(inputs, derived, { applyAssumptions: true });
      }

      const modelResults = runFinancialModel(inputs);
      const outputsDerived = computeDerivedOutputs(inputs, modelResults.metrics, {
        constructionCost: derived.constructionCost,
        installCost: derived.installCost
      });
      const runId = `run_${Date.now()}`;
      const scenarioId = 'baseline';
      const projectIdForOutput = projectId || `monday_${parentItemId}`;
      const outputPrefix = `raw/projects_pipeline/model_outputs/${projectIdForOutput}/${scenarioId}/${runId}/`;
      const outputs = {
        inputs_key: `${outputPrefix}inputs.json`,
        summary_metrics_key: `${outputPrefix}summary_metrics.csv`,
        economics_monthly_key: `${outputPrefix}economics_monthly.csv`
      };

      const inputsPayload = {
        project_id: projectIdForOutput,
        scenario_id: scenarioId,
        scenario_name: scenarioName,
        run_id: runId,
        created_at: new Date().toISOString(),
        inputs,
        metrics: modelResults.metrics
      };

      await s3.putObject({
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: outputs.inputs_key,
        Body: JSON.stringify(inputsPayload, null, 2),
        ContentType: 'application/json'
      }).promise();

      await s3.putObject({
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: outputs.summary_metrics_key,
        Body: generateMetricsCSV(modelResults.metrics),
        ContentType: 'text/csv; charset=utf-8'
      }).promise();

      await s3.putObject({
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: outputs.economics_monthly_key,
        Body: generateMonthlyCSV(modelResults.monthly),
        ContentType: 'text/csv; charset=utf-8'
      }).promise();

      try {
        const registry = await loadScenariosRegistry(projectIdForOutput);
        const updatedRegistry = upsertScenario(registry, {
          scenario_id: scenarioId,
          scenario_name: scenarioName,
          is_test: false,
          inputs
        });
        await saveScenariosRegistry(projectIdForOutput, updatedRegistry);
      } catch (err) {
        console.warn('Baseline scenario registry update failed:', err.message || err);
      }

      const parentWriteback = await updateParentCalculatedFields({
        boardId,
        itemId: parentItemId,
        token: mondayConfig.token,
        valuesByTitle: outputsDerived
      });
      try {
        await setDataQualityStatus({
          boardId,
          itemId: parentItemId,
          token: mondayConfig.token,
          status: 'Ready'
        });
      } catch (_) {
        // Non-blocking.
      }

      let mirrorOutputs = {};
      let refreshedItem = null;
      try {
        refreshedItem = await fetchMondayItemById(parentItemId, mondayConfig.token);
        if (refreshedItem) {
          const refreshedMap = buildColumnValueMapByTitle(refreshedItem.column_values || []);
          mirrorOutputs = extractCalculatedOutputs(refreshedMap, MIRROR_OUTPUT_TITLES);
        }
      } catch (_) {
        mirrorOutputs = {};
      }

      if (refreshedItem && mondayMapping?.field_map) {
        try {
          const mapped = mapMondayItem(refreshedItem, mondayMapping) || {};
          mapped.subscribers = outputsDerived['Subscribers'] ?? mapped.subscribers;
          mapped.take_rate = outputsDerived['Take Rate'] ?? mapped.take_rate;
          mapped.revenue = outputsDerived['Revenue'] ?? mapped.revenue;
          mapped.cash_flow = outputsDerived['Cash Flow'] ?? mapped.cash_flow;
          mapped.irr = outputsDerived['IRR'] ?? mapped.irr;
          mapped.moic = outputsDerived['MOIC'] ?? mapped.moic;
          mapped.npv = outputsDerived['NPV'] ?? mapped.npv;
          mapped.subscription_rate = outputsDerived['Subscription Rate'] ?? mapped.subscription_rate;
          mapped.subscription_months = outputsDerived['Subscription Months'] ?? mapped.subscription_months;
          mapped.capex_per_passing = outputsDerived['Capex per Passing'] ?? mapped.capex_per_passing;
          mapped.construction_plus_install_cost = outputsDerived['Construction + Install Cost'] ?? mapped.construction_plus_install_cost;
          mapped.construction_cost_per_passing = outputsDerived['Construction Cost per Passing'] ?? mapped.construction_cost_per_passing;
          mapped.install_cost_per_subscriber = outputsDerived['Install Cost per Subscriber'] ?? mapped.install_cost_per_subscriber;
          mapped.total_cost_per_passing = outputsDerived['Total Cost per Passing'] ?? mapped.total_cost_per_passing;

          const timestamp = new Date().toISOString();
          const safeTs = timestamp.replace(/[:.]/g, '').replace('Z', '000Z');
          const fieldKeys = MONDAY_INPUT_FIELDS && MONDAY_INPUT_FIELDS.length > 0
            ? MONDAY_INPUT_FIELDS
            : Object.keys(mondayMapping.field_map);
          const header = [...fieldKeys, 'updated_by', 'updated_ts'].join(',');
          const row = fieldKeys.map((k) => `"${String(mapped[k] ?? '').replace(/"/g, '""')}"`).join(',');
          const updatedBy = `"baseline-scenario"`;
          const updatedTs = `"${timestamp}"`;
          const csvBody = `${header}\n${row},${updatedBy},${updatedTs}\n`;
          const inputKey = `raw/projects_pipeline/monday_input/projects_input__${safeTs}.csv`;
          await s3.putObject({
            Bucket: 'gwi-raw-us-east-2-pc',
            Key: inputKey,
            Body: csvBody,
            ContentType: 'text/csv; charset=utf-8'
          }).promise();
        } catch (err) {
          console.warn('Baseline scenario monday_input write failed:', err.message || err);
        }
      }

      const subitemOutputs = {
        ...outputsDerived,
        ...mirrorOutputs,
        'NPV': modelResults.metrics.npv,
        'IRR %': modelResults.metrics.irr_annual_pct,
        'IRR': modelResults.metrics.irr_annual_pct,
        'MOIC': modelResults.metrics.moic,
        'Cash Invested': modelResults.metrics.actual_cash_invested,
        'Peak Subs': modelResults.metrics.peak_subscribers,
        'Peak EBITDA': modelResults.metrics.peak_monthly_ebitda
      };

      const subitemJson = await createScenarioSubitemWithValues({
        boardId,
        parentItemId,
        token: mondayConfig.token,
        scenarioName,
        inputs,
        outputs: subitemOutputs,
        subitemId: existingSubitemId
      });

      return response(200, {
        ok: true,
        success: true,
        project_id: projectIdForOutput,
        monday_item_id: parentItemId,
        scenario_id: scenarioId,
        run_id: runId,
        scenario_name: scenarioName,
        inputs,
        metrics: modelResults.metrics,
        outputs,
        defaults_used: defaultsUsed,
        parent_writeback: parentWriteback,
        subitem: subitemJson,
        baseline_subitem_preexisted: Boolean(existingSubitemId)
      });
    } catch (err) {
      return response(500, { ok: false, success: false, error: err.message || 'Baseline scenario failed' });
    }
  }

  if (path.endsWith('/projects/baseline-migrate') && method === 'POST') {
    try {
      const mondayConfig = await getMondayConfig();
      if (!mondayConfig?.token) {
        return response(500, { ok: false, success: false, error: 'Monday token not configured' });
      }

      const mondayMapping = withMondayColumns(MONDAY_MAPPING, mondayConfig);
      const boardId = payload.board_id || mondayConfig.pipeline_board_id || mondayMapping?.board_id;
      if (!boardId) {
        return response(500, { ok: false, success: false, error: 'Monday board_id not configured' });
      }

      const legacyScenarioName = payload.legacy_scenario_name || 'Legacy (Jared Manual)';
      const baselineScenarioName = payload.baseline_scenario_name || 'Baseline (from board)';
      const createBaselineSubitem = payload.create_baseline_subitem === true;
      const createLegacySubitem = payload.create_legacy_subitem !== false;
      const dryRun = payload.dry_run === true;
      const useSyncFilter = payload.use_sync_filter !== false;
      const allowDefaults = payload.use_defaults === true || payload.allow_defaults === true || payload.apply_defaults === true;
      const limit = payload.limit ? Number(payload.limit) : null;
      const offset = payload.offset ? Number(payload.offset) : 0;
      const verbose = payload.verbose === true;
      const startCursor = payload.cursor || null;
      const pageOnly = payload.page_only === true || !!startCursor;

      let items = [];
      let nextCursor = null;
      if (pageOnly) {
        const page = await fetchBoardItemsPage(boardId, mondayConfig.token, startCursor);
        items = page.items;
        nextCursor = page.cursor;
        if (offset && items.length > offset) {
          items = items.slice(offset);
        }
        if (limit && items.length > limit) {
          items = items.slice(0, limit);
        }
      } else {
        items = await fetchBoardItems(boardId, mondayConfig.token, limit);
        if (offset && items.length > offset) {
          items = items.slice(offset);
        }
      }
      const results = [];
      let processed = 0;
      let updated = 0;
      let legacyCreated = 0;
      let baselineCreated = 0;
      let skippedFilter = 0;
      let missingInputs = 0;

      for (const item of items) {
        const colMap = buildColumnValueMapByTitle(item.column_values || []);
        if (!shouldProcessItem(colMap, mondayMapping, useSyncFilter)) {
          skippedFilter += 1;
          continue;
        }

        processed += 1;
        let { inputs: rawInputs, derived } = computeBaselineInputsFromColumnMap(colMap);
        let inputs = applyBaselineDefaults(rawInputs, derived, { applyAssumptions: false });
        const normalizedModelProfile = normalizeModelProfileKey(inputs.model_profile);
        const profileDefaults = getBaselineDefaultsForProfile(normalizedModelProfile);
        inputs.model_profile = normalizedModelProfile;
        let missing = listMissingBaselineInputs(inputs);
        const suggestedDefaults = buildSuggestedDefaults(rawInputs, derived, profileDefaults);

        const mapped = mapMondayItem(item, mondayMapping) || {};
        const projectIdForDefaults = mapped.project_id || null;
        if (missing.length && projectIdForDefaults) {
          const legacyRow = await fetchLegacyDefaults(projectIdForDefaults);
          if (legacyRow) {
            const legacyApplied = applyLegacyDefaultsToInputs(inputs, derived, legacyRow);
            inputs = legacyApplied.inputs;
            derived = legacyApplied.derived;
            if (Object.keys(legacyApplied.defaultsUsed || {}).length && !dryRun) {
              await updateParentCalculatedFields({
                boardId,
                itemId: item.id,
                token: mondayConfig.token,
                valuesByTitle: legacyApplied.defaultsUsed
              });
            }
            missing = listMissingBaselineInputs(inputs);
          }
        }
        if (missing.length && allowDefaults) {
          const applied = applyExplicitDefaults(inputs, profileDefaults);
          inputs = applied.inputs;
          if (Object.keys(applied.defaultsUsed || {}).length && !dryRun) {
            await updateParentCalculatedFields({
              boardId,
              itemId: item.id,
              token: mondayConfig.token,
              valuesByTitle: applied.defaultsUsed
            });
          }
          missing = listMissingBaselineInputs(inputs);
        }

        const manualOutputs = extractCalculatedOutputs(colMap);
        const hasManualOutputs = Object.keys(manualOutputs).length > 0;
        const existingLegacy = (item.subitems || []).find((s) => matchesScenarioName(s.name, legacyScenarioName));
        const existingBaseline = (item.subitems || []).find((s) => matchesScenarioName(s.name, baselineScenarioName));

        let legacySubitem = null;
        if (createLegacySubitem && hasManualOutputs && !existingLegacy) {
          if (!dryRun) {
            legacySubitem = await createScenarioSubitemWithValues({
              boardId,
              parentItemId: item.id,
              token: mondayConfig.token,
              scenarioName: legacyScenarioName,
              inputs,
              outputs: manualOutputs
            });
          }
          legacyCreated += 1;
        }

        if (missing.length) {
          if (!dryRun) {
            try {
              await setDataQualityStatus({
                boardId,
                itemId: item.id,
                token: mondayConfig.token,
                status: 'Missing Inputs'
              });
            } catch (_) {
              // Non-blocking.
            }
          }
          missingInputs += 1;
          results.push({
            item_id: item.id,
            item_name: item.name,
            status: 'missing_inputs',
            missing_inputs: missing,
            suggested_defaults: suggestedDefaults,
            legacy_subitem: legacySubitem || (existingLegacy ? { ok: true, subitem_id: existingLegacy.id } : null)
          });
          continue;
        }

        if (allowDefaults) {
          inputs = applyBaselineDefaults(inputs, derived, { applyAssumptions: true });
        }

        const modelResults = runFinancialModel(inputs);
        const outputsDerived = computeDerivedOutputs(inputs, modelResults.metrics, {
          constructionCost: derived.constructionCost,
          installCost: derived.installCost
        });

        let parentWriteback = null;
        if (!dryRun) {
          parentWriteback = await updateParentCalculatedFields({
            boardId,
            itemId: item.id,
            token: mondayConfig.token,
            valuesByTitle: outputsDerived
          });
        }
        updated += 1;

        if (!dryRun) {
          try {
            await setDataQualityStatus({
              boardId,
              itemId: item.id,
              token: mondayConfig.token,
              status: 'Ready'
            });
          } catch (_) {
            // Non-blocking.
          }
        }

        let baselineSubitem = null;
        if (createBaselineSubitem && !existingBaseline) {
          const baselineOutputs = {
            ...outputsDerived,
            'NPV': modelResults.metrics.npv,
            'IRR %': modelResults.metrics.irr_annual_pct,
            'MOIC': modelResults.metrics.moic,
            'Cash Invested': modelResults.metrics.actual_cash_invested,
            'Peak Subs': modelResults.metrics.peak_subscribers,
            'Peak EBITDA': modelResults.metrics.peak_monthly_ebitda
          };
          if (!dryRun) {
            baselineSubitem = await createScenarioSubitemWithValues({
              boardId,
              parentItemId: item.id,
              token: mondayConfig.token,
              scenarioName: baselineScenarioName,
              inputs,
              outputs: baselineOutputs
            });
          }
          baselineCreated += 1;
        }

        results.push({
          item_id: item.id,
          item_name: item.name,
          status: 'updated',
          missing_inputs: [],
          legacy_subitem: legacySubitem || (existingLegacy ? { ok: true, subitem_id: existingLegacy.id } : null),
          baseline_subitem: baselineSubitem || (existingBaseline ? { ok: true, subitem_id: existingBaseline.id } : null),
          parent_writeback: parentWriteback
        });
      }

      return response(200, {
        ok: true,
        success: true,
        board_id: boardId,
        dry_run: dryRun,
        page_only: pageOnly,
        next_cursor: pageOnly ? nextCursor : null,
        processed,
        updated,
        legacy_subitems_created: legacyCreated,
        baseline_subitems_created: baselineCreated,
        skipped_filter: skippedFilter,
        missing_inputs: missingInputs,
        results: verbose ? results : results.slice(0, 25)
      });
    } catch (err) {
      return response(500, { ok: false, success: false, error: err.message || 'Baseline migrate failed' });
    }
  }

  if (path.endsWith('/projects/save') && method === 'POST') {
    try {
      const project = payload.project;
      if (!project) {
        return response(400, { ok: false, success: false, error: 'Project data required' });
      }
      if (!project.entity || !project.project_name) {
        return response(400, { ok: false, success: false, error: 'Missing required fields: entity, project_name' });
      }

      const validStages = [
        'Term Sheet / NDA',
        'Project Discussion',
        'Contract Discussion',
        'Final Documents Negotiation',
        'Signed',
        'Term Sheet',
        'Final Docs'
      ];
      if (project.stage && !validStages.includes(project.stage)) {
        return response(400, { ok: false, success: false, error: `Invalid stage. Must be one of: ${validStages.join(', ')}` });
      }

      const validPriorities = ['Low', 'Medium', 'High', 'Must Win'];
      if (project.priority && !validPriorities.includes(project.priority)) {
        return response(400, { ok: false, success: false, error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 20) + 'Z';
      const slug = String(project.project_name).toLowerCase().replace(/\\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const projectId = project.project_id || `${slug}-${timestamp}`;
      const isTest = project.is_test || false;

      const csvRow = [
        projectId,
        project.entity || '',
        project.project_name || '',
        project.project_type || '',
        project.state || '',
        project.partner_share_raw || '',
        project.investor_label || '',
        project.stage || '',
        project.priority || '',
        project.owner || '',
        project.notes || ''
      ].map(escapeCsvValue).join(',');

      const csvContent = `project_id,entity,project_name,project_type,state,partner_share_raw,investor_label,stage,priority,owner,notes\n${csvRow}\n`;
      const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '').replace('Z', '000Z');
      const prefix = isTest ? 'test_' : '';
      const key = `raw/projects_pipeline/input/${prefix}projects_input__${fileTimestamp}.csv`;

      await s3.putObject({
        Bucket: 'gwi-raw-us-east-2-pc',
        Key: key,
        Body: csvContent,
        ContentType: 'text/csv; charset=utf-8'
      }).promise();

      let mondayResult = null;
      let mondayBoardId = null;
      let mondayItemId = null;
      let mondayToken = null;
      let mondayMapping = null;
      let writebackResult = null;
      let updateKey = null;
      let updateError = null;
      try {
        const mondayConfig = await getMondayConfig();
        mondayMapping = withMondayColumns(MONDAY_MAPPING, mondayConfig);
        if (mondayConfig?.token && mondayMapping?.field_map) {
          mondayToken = mondayConfig.token;
          const mondayProject = {
            ...project,
            project_id: projectId,
            module_type: mondayMapping?.sync_filter?.module_type_value || 'Project Pipeline',
            sync_to_aws: true
          };
          if (mondayProject.partner_share_raw && !mondayProject.split_pct) {
            mondayProject.split_pct = mondayProject.partner_share_raw;
          }
          if (mondayProject.stage) {
            mondayProject.stage = normalizeStageValue(mondayProject.stage);
          }
          const boardId = mondayConfig.pipeline_board_id || mondayMapping?.board_id;
          mondayBoardId = boardId;
          mondayResult = await upsertMondayProject({
            project: mondayProject,
            mapping: mondayMapping,
            token: mondayConfig.token,
            boardId
          });
          mondayItemId = mondayResult?.item_id || null;
        }
      } catch (err) {
        mondayResult = { ok: false, error: err.message || 'Monday sync failed' };
      }

      try {
        const updateTimestamp = new Date().toISOString();
        const datePart = updateTimestamp.slice(0, 10);
        const safeTs = updateTimestamp.replace(/[:.]/g, '').replace('Z', '000Z');
        const updatedBy =
          project.updated_by ||
          payload.updated_by ||
          (payload.user && (payload.user.email || payload.user.full_name)) ||
          null;
        const updateRecord = {
          project_id: projectId,
          state: project.state || null,
          stage: project.stage || null,
          priority: project.priority || null,
          owner: project.owner || null,
          notes: project.notes || null,
          updated_by: updatedBy,
          updated_ts: updateTimestamp,
          dt: datePart
        };
        updateKey = `curated_core/project_updates/project_update_${safeTs}.json`;
        await writeS3Json('gwi-raw-us-east-2-pc', updateKey, updateRecord);
      } catch (err) {
        updateError = err.message || 'Failed to write project update';
      }

      if (mondayItemId && mondayBoardId && mondayToken && mondayMapping?.field_map) {
        try {
          const sql = `SELECT * FROM curated_core.projects_enriched WHERE project_id = ${escapeSqlValue(projectId)} LIMIT 1`;
          const { row: projectRow } = await querySingleRow(sql);
          if (projectRow) {
            writebackResult = await writeBackToMonday({
              boardId: mondayBoardId,
              itemId: mondayItemId,
              projectRow,
              mapping: mondayMapping,
              token: mondayToken
            });
          } else {
            writebackResult = { ok: false, error: 'Project not found in curated_core.projects_enriched' };
          }
        } catch (err) {
          writebackResult = { ok: false, error: err.message || 'Monday writeback failed' };
        }
      }

      return response(200, {
        ok: true,
        success: true,
        project_id: projectId,
        s3_key: key,
        is_test: isTest,
        monday: mondayResult,
        update_key: updateKey,
        update_error: updateError,
        monday_writeback: writebackResult,
        message: 'Project saved to S3 change-file.'
      });
    } catch (err) {
      return response(500, { ok: false, success: false, error: err.message || 'Failed to save project' });
    }
  }

  if (path.endsWith('/projects/updates') && method === 'POST') {
    const action = payload.action || (payload.s3_key ? 'delete' : 'list');
    const bucket = 'gwi-raw-us-east-2-pc';
    if (action === 'list') {
      const objects = await listS3Objects(bucket, 'raw/projects_pipeline/input/', 200);
      const files = objects
        .filter(obj => obj.Key && obj.Key.endsWith('.csv'))
        .map(obj => ({
          key: obj.Key,
          file_name: obj.Key.split('/').pop(),
          size_bytes: obj.Size,
          last_modified: obj.LastModified ? obj.LastModified.toISOString() : null,
          is_test: obj.Key.split('/').pop().startsWith('test_')
        }))
        .sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified));
      return response(200, { ok: true, success: true, files });
    }
    if (action === 'content' && payload.key) {
      try {
        const content = await readS3Text(bucket, payload.key);
        return response(200, { ok: true, success: true, key: payload.key, content });
      } catch (err) {
        return response(500, { ok: false, success: false, error: err.message || 'Failed to read file' });
      }
    }
    if (action === 'download' && payload.key) {
      try {
        const url = await s3.getSignedUrlPromise('getObject', {
          Bucket: bucket,
          Key: payload.key,
          Expires: 900
        });
        return response(200, { ok: true, success: true, key: payload.key, download_url: url });
      } catch (err) {
        return response(500, { ok: false, success: false, error: err.message || 'Failed to generate download URL' });
      }
    }
    if (action === 'delete' && payload.s3_key) {
      try {
        await deleteS3Object(bucket, payload.s3_key);
        return response(200, { ok: true, success: true, deleted: payload.s3_key });
      } catch (err) {
        return response(500, { ok: false, success: false, error: err.message || 'Failed to delete file' });
      }
    }
    return response(400, { ok: false, success: false, error: 'Invalid action for updates' });
  }

  if (path.endsWith('/projects/pipeline-results') && method === 'POST') {
    const bucket = 'gwi-raw-us-east-2-pc';
    const action = payload.action || (payload.key ? 'download' : 'latest');

    if (action === 'save_portfolio') {
      const runId = `pipeline_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const runAt = new Date().toISOString();
      const runName = payload.run_name || payload.runName || `Pipeline Run ${runAt}`;
      const summary = payload.portfolio_summary || payload.portfolioSummary || {};
      const monthly = Array.isArray(payload.portfolio_monthly || payload.portfolioMonthly)
        ? (payload.portfolio_monthly || payload.portfolioMonthly)
        : [];
      const scenarioMetrics = Array.isArray(payload.scenario_metrics)
        ? payload.scenario_metrics
        : (Array.isArray(payload.scenarios) ? payload.scenarios : []);
      const scenarioDetails = Array.isArray(payload.scenario_details)
        ? payload.scenario_details
        : scenarioMetrics;
      const prefix = `raw/projects_pipeline/pipeline_runs/${runId}/`;
      const claims = getAuthorizerClaims(event);
      const guardStatus = await loadGuardStatusFromS3();
      const freshness = await getFreshnessEvidence(['curated_core.projects_enriched_live']);

      const runPayload = {
        run_id: runId,
        run_name: runName,
        run_at: runAt,
        scenario_count: scenarioDetails.length,
        actor: {
          email: getClaimsEmail(claims) || null,
          sub: claims?.sub || null
        },
        model_version_hash: MODEL_VERSION_HASH,
        guard_status: guardStatus || null,
        data_freshness: freshness || [],
        summary,
        scenarios: scenarioDetails,
        monthly
      };

      const outputs = {
        run_json: `${prefix}run.json`,
        summary_csv: `${prefix}portfolio_summary.csv`,
        monthly_csv: `${prefix}portfolio_monthly.csv`,
        scenarios_csv: `${prefix}scenario_metrics.csv`,
        report_xlsx: `${prefix}pipeline_report.xlsx`
      };

      try {
        await s3.putObject({
          Bucket: bucket,
          Key: outputs.run_json,
          Body: JSON.stringify(runPayload, null, 2),
          ContentType: 'application/json'
        }).promise();

        await s3.putObject({
          Bucket: bucket,
          Key: outputs.summary_csv,
          Body: generateMetricsCSV(summary),
          ContentType: 'text/csv; charset=utf-8'
        }).promise();

        await s3.putObject({
          Bucket: bucket,
          Key: outputs.monthly_csv,
          Body: generateMonthlyCSV(monthly),
          ContentType: 'text/csv; charset=utf-8'
        }).promise();

        await s3.putObject({
          Bucket: bucket,
          Key: outputs.scenarios_csv,
          Body: generateScenarioMetricsCSV(scenarioMetrics),
          ContentType: 'text/csv; charset=utf-8'
        }).promise();

        const workbookBuffer = buildPipelineWorkbook({ summary, monthly, scenarios: scenarioMetrics, scenarioDetails });
        await s3.putObject({
          Bucket: bucket,
          Key: outputs.report_xlsx,
          Body: workbookBuffer,
          ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }).promise();

        const reportUrl = await s3.getSignedUrlPromise('getObject', {
          Bucket: bucket,
          Key: outputs.report_xlsx,
          Expires: 900
        });

        const runJsonUrl = await s3.getSignedUrlPromise('getObject', {
          Bucket: bucket,
          Key: outputs.run_json,
          Expires: 900
        });
        const summaryCsvUrl = await s3.getSignedUrlPromise('getObject', {
          Bucket: bucket,
          Key: outputs.summary_csv,
          Expires: 900
        });
        const monthlyCsvUrl = await s3.getSignedUrlPromise('getObject', {
          Bucket: bucket,
          Key: outputs.monthly_csv,
          Expires: 900
        });
        const scenariosCsvUrl = await s3.getSignedUrlPromise('getObject', {
          Bucket: bucket,
          Key: outputs.scenarios_csv,
          Expires: 900
        });

        return response(200, {
          ok: true,
          success: true,
          run_id: runId,
          run_name: runName,
          run_at: runAt,
          outputs,
          report_url: reportUrl,
          artifact_urls: {
            run_json: runJsonUrl,
            summary_csv: summaryCsvUrl,
            monthly_csv: monthlyCsvUrl,
            scenarios_csv: scenariosCsvUrl,
            report_xlsx: reportUrl
          }
        });
      } catch (err) {
        return response(500, { ok: false, success: false, error: err.message || 'Failed to save pipeline run' });
      }
    }

    if (action === 'list_portfolio') {
      try {
        const prefix = 'raw/projects_pipeline/pipeline_runs/';
        const objects = await listS3Objects(bucket, prefix, 200);
        const runJsons = objects.filter((o) => o.Key && o.Key.endsWith('/run.json'));
        const runs = [];
        for (const obj of runJsons) {
          try {
            const content = await readS3Text(bucket, obj.Key);
            const parsed = JSON.parse(content);
            runs.push({
              run_id: parsed.run_id,
              run_name: parsed.run_name,
              run_at: parsed.run_at,
              scenario_count: parsed.scenario_count || (parsed.scenarios ? parsed.scenarios.length : 0),
              s3_key: obj.Key
            });
          } catch (_) {
            // skip malformed
          }
        }
        const sorted = runs.sort((a, b) => new Date(b.run_at) - new Date(a.run_at));
        return response(200, { ok: true, success: true, runs: sorted });
      } catch (err) {
        return response(500, { ok: false, success: false, error: err.message || 'Failed to list pipeline runs' });
      }
    }

    if (action === 'get_portfolio') {
      const runId = payload.run_id || payload.runId;
      if (!runId) {
        return response(400, { ok: false, success: false, error: 'run_id required' });
      }
      const key = `raw/projects_pipeline/pipeline_runs/${runId}/run.json`;
      try {
        const content = await readS3Text(bucket, key);
        const parsed = JSON.parse(content);
        return response(200, { ok: true, success: true, run: parsed, key });
      } catch (err) {
        return response(500, { ok: false, success: false, error: err.message || 'Failed to load pipeline run' });
      }
    }

    const projectId = payload.projectId || payload.project_id;

    if (!projectId && action !== 'download') {
      return response(400, { ok: false, success: false, error: 'projectId required' });
    }

    const prefix = projectId ? `raw/projects_pipeline/model_outputs/${projectId}/` : null;

    try {
      if (action === 'list') {
        const outputs = await listS3Objects(bucket, prefix, 200);
        if (!outputs.length) {
          return response(404, { ok: false, success: false, error: 'No pipeline results found', outputs: [] });
        }
        return response(200, { ok: true, success: true, outputs });
      }

      if (action === 'download') {
        const key = payload.key;
        if (!key) {
          return response(400, { ok: false, success: false, error: 'key required for download' });
        }
        if (prefix && !key.startsWith(prefix)) {
          return response(400, { ok: false, success: false, error: 'key does not match project prefix' });
        }
        const url = await s3.getSignedUrlPromise('getObject', {
          Bucket: bucket,
          Key: key,
          Expires: 900
        });
        return response(200, { ok: true, success: true, key, download_url: url });
      }

      const outputs = await listS3Objects(bucket, prefix, 200);
      if (!outputs.length) {
        return response(404, { ok: false, success: false, error: 'No pipeline results found', outputs: [] });
      }
      const sorted = outputs.slice().sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
      const latest = sorted[0];
      const url = await s3.getSignedUrlPromise('getObject', {
        Bucket: bucket,
        Key: latest.Key,
        Expires: 900
      });
      return response(200, {
        ok: true,
        success: true,
        latest: {
          key: latest.Key,
          last_modified: latest.LastModified ? latest.LastModified.toISOString() : null,
          size_bytes: latest.Size || null
        },
        download_url: url,
        outputs: sorted
      });
    } catch (err) {
      return response(500, { ok: false, success: false, error: err.message || 'Pipeline results failed' });
    }
  }

  if (path.endsWith('/projects/submissions') && method === 'POST') {
    const bucket = 'gwi-raw-us-east-2-pc';
    const action = payload.action || (payload.submission ? 'submit' : (payload.submission_id ? 'promote' : 'list'));

    if (action === 'submit') {
      const submission = payload.submission;
      if (!submission) {
        return response(400, { ok: false, success: false, error: 'submission object required' });
      }
      const submission_id = `submission_${Date.now()}`;
      const key = `raw/projects_pipeline/submissions/${submission_id}.json`;
      const submissionData = {
        submission_id,
        ...submission,
        status: 'pending_review',
        submitted_at: new Date().toISOString()
      };
      await writeS3Json(bucket, key, submissionData);
      return response(200, { ok: true, success: true, submission_id, s3_key: key, message: 'Project submitted for review' });
    }

    if (action === 'list') {
      const objects = await listS3Objects(bucket, 'raw/projects_pipeline/submissions/', 200);
      const submissions = [];
      for (const obj of objects) {
        if (!obj.Key) continue;
        try {
          const content = await readS3Text(bucket, obj.Key);
          const submission = JSON.parse(content);
          submissions.push({
            ...submission,
            submission_id: obj.Key.split('/').pop().replace('.json', ''),
            s3_key: obj.Key
          });
        } catch (_) {
          // ignore
        }
      }
      submissions.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      return response(200, { ok: true, success: true, submissions });
    }

    if (action === 'promote') {
      const submission_id = payload.submission_id;
      const submission = payload.submission;
      if (!submission_id || !submission) {
        return response(400, { ok: false, success: false, error: 'submission_id and submission required' });
      }
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\\..+/, '');
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
        promoted_from_submission: submission_id,
        promoted_at: new Date().toISOString()
      };
      const projectKey = `raw/projects_pipeline/project_changes/${project_id}__${timestamp}.json`;
      await writeS3Json(bucket, projectKey, projectRecord);
      return response(200, { ok: true, success: true, project_id, message: 'Submission promoted to official project' });
    }

    return response(400, { ok: false, success: false, error: 'Invalid action for submissions' });
  }

  if (path.endsWith('/query') && method !== 'POST') {
    return response(405, { ok: false, error: 'Method Not Allowed' });
  }

  if (!path.endsWith('/query')) {
    return response(404, { ok: false, error: 'Not Found' });
  }

  let questionId = payload.question_id || payload.query_id;
  let params = payload.params || {};
  const inlineSql = payload.sql;
  const questionText = payload.question || payload.question_text || payload.prompt;
  const threadId = payload.thread_id || payload.threadId || null;
  let parentCaseId = payload.context?.case_id || payload.context?.caseId || null;
  const wantsInvestigation = questionText ? detectInvestigationIntent(questionText) : false;
  let resolved = null;
  let resolvedCacheSeed = null;
  let queryDef = null;

  if (questionText) {
    const nonData = detectNonDataQuestion(questionText);
    if (nonData) {
      return response(200, {
        ok: true,
        cached: false,
        stale: false,
        question_id: nonData.question_id,
        non_data_key: nonData.non_data_key || null,
        columns: [],
        rows: [],
        views_used: [],
        answer_markdown: nonData.answer_markdown,
        evidence_pack: {
          executed_sql: null,
          query_execution_id: null,
          sources: [],
          row_count: 0,
          validations: { read_only: true, allowlist: true },
          confidence: 'high',
          guardrail: 'non_data_response'
        }
      });
    }
  }

  if (questionText && hasDestructiveIntent(questionText)) {
    return response(200, {
      ok: true,
      cached: false,
      stale: false,
      question_id: 'guardrail_blocked',
      columns: [],
      rows: [],
      views_used: [],
      answer_markdown:
        '**Request blocked** — destructive or write intent detected. Only read-only analytics queries are allowed.',
      evidence_pack: {
        executed_sql: null,
        query_execution_id: null,
        sources: [],
        row_count: 0,
        validations: { read_only: true, allowlist: true },
        confidence: 'low',
        guardrail: 'ddl_dml_blocked'
      }
    });
  }

  if (questionText && !payload.context && threadId) {
    const isLikelyFollowup =
      detectExplainFollowupIntent(questionText) ||
      detectVerifyFollowupIntent(questionText);
    if (isLikelyFollowup) {
      const threadContext = await loadThreadContext(threadId);
      if (threadContext) {
        payload.context = threadContext;
        parentCaseId = threadContext.case_id || parentCaseId;
      }
    }
  }

  if (questionText && payload.context) {
    const followupExplain = await maybeHandleFollowupExplain({
      event,
      questionText,
      context: payload.context
    });
    if (followupExplain) {
      return response(200, followupExplain);
    }
  }

  if (questionText && payload.context) {
    const followupVerify = await maybeHandleFollowupVerify({
      event,
      questionText,
      context: payload.context
    });
    if (followupVerify) {
      return response(200, followupVerify);
    }
  }

  if (!questionId && questionText) {
    resolved = resolveDeterministicQuery(questionText);
    if (resolved) {
      if (resolved.notSupportedPayload) {
        return response(200, resolved.notSupportedPayload);
      }
      if (resolved.questionId) {
        questionId = resolved.questionId;
        params = { ...params, ...(resolved.params || {}) };
      }
      if (resolved.queryDef) {
        queryDef = resolved.queryDef;
      }
      if (resolved.cacheKeySeed) {
        resolvedCacheSeed = resolved.cacheKeySeed;
      }
    }
  }

  if (!queryDef && questionId) {
    queryDef = REGISTRY[questionId] || null;
  }

  if (questionId === 'glclosepack_summary' || questionId === 'glclosepack_detail') {
    const override = buildGlClosePackQuery(questionId, params || {});
    if (override) {
      queryDef = override;
    }
  }

  const MULTISCOPE_QUESTIONS = new Set(['customers_in_location_multiscope', 'copper_customers_multiscope']);
  const isMultiScope = MULTISCOPE_QUESTIONS.has(questionId);

  if (questionId && !queryDef && !inlineSql && !questionText && !isMultiScope) {
    return response(400, { ok: false, error: 'Unknown question_id' });
  }

  if (!questionId && !inlineSql && !questionText) {
    return response(400, { ok: false, error: 'Missing question_id, sql, or question' });
  }

  const querySignature = queryDef && queryDef.sql ? hashKey(queryDef.sql) : 'none';
  const cacheKeySeed =
    resolvedCacheSeed ||
    (questionId && queryDef && !queryDef.__dynamic
      ? `${questionId}:${stableStringify(params)}:${querySignature}`
      : `${questionText || inlineSql}:${stableStringify(params)}`);
  const cacheKey = hashKey(cacheKeySeed);

  try {
    const cached = await getCache(cacheKey);
    if (cached && cached.expires_at > Math.floor(Date.now() / 1000) && cached.result) {
      let payloadOut = cached.result;
      const freshnessGate = await runFreshnessGate({ questionId });
      if (freshnessGate) {
        const evidencePack = payloadOut?.evidence_pack && typeof payloadOut.evidence_pack === 'object'
          ? { ...payloadOut.evidence_pack, freshness_gate: freshnessGate }
          : { freshness_gate: freshnessGate };
        payloadOut = { ...payloadOut, evidence_pack: evidencePack };
        if (freshnessGate.status === 'blocked') {
          payloadOut = {
            ...payloadOut,
            columns: [],
            rows: [],
            answer_markdown: buildUnavailableMarkdownFromFreshnessGate(freshnessGate),
            evidence_pack: { ...evidencePack, status: 'unavailable', confidence: 'low' }
          };
        }
      }
      const caseId = payload.case_id || payload.caseId || generateCaseId();
      await writeCaseRecord(buildCaseRecord({
        caseId,
        event,
        questionText,
        questionId: questionId || 'freeform_sql',
        payloadOut,
        threadId,
        parentCaseId
      }));
      await setThreadLastCase(threadId, caseId);
      return response(200, {
        ok: true,
        cached: true,
        stale: false,
        question_id: questionId || 'freeform_sql',
        views_used: queryDef?.views_used || cached.result?.views_used || [],
        ...cached.result,
        last_success_ts: cached.last_success_ts,
        case_id: CASE_RUNTIME_ENABLED ? caseId : undefined,
        actions_available: buildCaseActions(payloadOut)
      });
    }

    let result;
    let viewsUsed = [];
    let generatedSql = null;
    if (isMultiScope) {
      let payloadOut = null;
      if (questionId === 'copper_customers_multiscope') {
        payloadOut = await executeCopperCustomerMultiScope(params);
      } else {
        payloadOut = await executeCustomerLocationMultiScope(params);
      }
      payloadOut.metric_key = payloadOut.metric_key || resolveMetricKeyForQuestionId(questionId);
      payloadOut = await maybeAttachVerification({ payloadOut, questionId, wantsInvestigation });
      await putCache(cacheKey, payloadOut, CACHE_TTL_SECONDS);
      const caseId = payload.case_id || payload.caseId || generateCaseId();
      await writeCaseRecord(buildCaseRecord({
        caseId,
        event,
        questionText,
        questionId,
        payloadOut,
        threadId,
        parentCaseId
      }));
      await setThreadLastCase(threadId, caseId);
      return response(200, {
        ok: true,
        cached: false,
        stale: false,
        question_id: questionId,
        views_used: payloadOut.views_used || [],
        ...payloadOut,
        last_success_ts: Math.floor(Date.now() / 1000),
        case_id: CASE_RUNTIME_ENABLED ? caseId : undefined,
        actions_available: buildCaseActions(payloadOut)
      });
    }
    if (queryDef) {
      let effectiveQueryDef = queryDef;
      if (queryDef.__dynamic) {
        const safeSql = ensureLimit(queryDef.sql, MAX_RESULT_ROWS);
        validateReadOnlySql(safeSql);
        validateSqlAllowlist(safeSql);
        effectiveQueryDef = { ...queryDef, sql: safeSql };
      }
      const resolvedParams = fillMissingParams(effectiveQueryDef, params);
      result = await executeQuery(effectiveQueryDef, resolvedParams);
      result.request_params = resolvedParams;
      viewsUsed = effectiveQueryDef.views_used || extractReferencedTables(effectiveQueryDef.sql);
    } else if (!inlineSql && questionText) {
      const suggestions = suggestRegistryMatches(questionText, 5);
      const suggestionIds = suggestions.map((item) => item.id);
      const suggestionLines = suggestions.map((item) => `- ${item.id}`).join('\n');

      if (!CAPABILITY_ROUTER_ENABLED) {
        const answerMarkdown = suggestions.length
          ? `**No deterministic route found for:** \"${questionText}\"\n\nTry one of these governed templates:\n${suggestionLines}`
          : `**No deterministic route found for:** \"${questionText}\"\n\nAsk about MRR, customers, tickets, outages, passings, or projects to get a governed answer.`;
        return response(200, {
          ok: true,
          cached: false,
          stale: false,
          question_id: 'deterministic_no_match',
          columns: [],
          rows: [],
          views_used: [],
          answer_markdown: answerMarkdown,
          suggestions: suggestionIds
        });
      }

      const capabilityMatch = matchCapability(questionText);
      if (!capabilityMatch) {
        return response(200, buildNotSupportedPayload({
          questionText,
          capabilityMatch: null,
          reason: 'capability not registered for this question',
          nextStep: 'Add a capability (config/ai/capabilities.yaml) or ask a governed template question',
          details: [
            'Capability routing is enabled, but no capability keywords matched.',
            'Deterministic templates are still available via question_id or guided prompts.'
          ],
          suggestions: suggestionIds
        }));
      }

      const capDef = capabilityMatch.capability || {};
      const missingFlags = resolveMissingCapabilityFlags(capDef);
      const sourceResolution = resolveMissingCapabilitySources(capDef);

      if (missingFlags.length) {
        return response(200, buildNotSupportedPayload({
          questionText,
          capabilityMatch,
          reason: `capability \"${capabilityMatch.capability_key}\" requires flags: ${missingFlags.join(', ')}`,
          nextStep: `Enable ${missingFlags.join(', ')} in the API environment and redeploy`,
          details: [
            `Capability: ${capabilityMatch.capability_key}`,
            `Missing flags: ${missingFlags.join(', ')}`
          ],
          suggestions: suggestionIds
        }));
      }

      if (sourceResolution.missing.length) {
        return response(200, buildNotSupportedPayload({
          questionText,
          capabilityMatch,
          reason: `missing required datasets for capability \"${capabilityMatch.capability_key}\": ${sourceResolution.missing.join(', ')}`,
          nextStep: 'Ingest/model the missing datasets and add SSOT views to the source allowlist',
          details: [
            `Capability: ${capabilityMatch.capability_key}`,
            `Missing datasets: ${sourceResolution.missing.join(', ')}`
          ],
          suggestions: suggestionIds
        }));
      }

      const deterministicRoute = chooseDeterministicQueryForCapability(capabilityMatch.capability_key, questionText);
      if (deterministicRoute && deterministicRoute.question_id && REGISTRY[deterministicRoute.question_id]) {
        questionId = deterministicRoute.question_id;
        params = { ...params, ...(deterministicRoute.params || {}) };
        queryDef = REGISTRY[questionId];
        const resolvedParams = fillMissingParams(queryDef, params);
        result = await executeQuery(queryDef, resolvedParams);
        result.request_params = resolvedParams;
        viewsUsed = queryDef.views_used || extractReferencedTables(queryDef.sql);
      } else {
        if (TEMPLATES_ONLY || !PLANNER_ALLOWED) {
          return response(200, buildNotSupportedPayload({
            questionText,
            capabilityMatch,
            reason: `planner execution is disabled for capability \"${capabilityMatch.capability_key}\"`,
            nextStep: 'Set TEMPLATES_ONLY=false and PLANNER_ALLOWED=true (and redeploy) to enable governed planning',
            details: [
              `Capability: ${capabilityMatch.capability_key}`,
              `TEMPLATES_ONLY=${TEMPLATES_ONLY}`,
              `PLANNER_ALLOWED=${PLANNER_ALLOWED}`
            ],
            suggestions: suggestionIds
          }));
        }

        if (!BEDROCK_ENABLED || !BEDROCK_MODEL_ID || !BEDROCK_TOOL_USE_ENABLED) {
          return response(200, buildNotSupportedPayload({
            questionText,
            capabilityMatch,
            reason: `planner execution is not configured for capability \"${capabilityMatch.capability_key}\"`,
            nextStep: 'Enable BEDROCK_ENABLED=true and BEDROCK_TOOL_USE_ENABLED=true (and provide a valid model or inference profile), then redeploy',
            details: [
              `Capability: ${capabilityMatch.capability_key}`,
              `BEDROCK_ENABLED=${BEDROCK_ENABLED}`,
              `BEDROCK_TOOL_USE_ENABLED=${BEDROCK_TOOL_USE_ENABLED}`
            ],
            suggestions: suggestionIds
          }));
        }

        let planResult = null;
        try {
          const plannerQuestion = buildContextualQuestion(questionText, payload.context);
          planResult = await executeGovernedPlan(plannerQuestion);
        } catch (err) {
          const msg = String(err?.message || err || '');
          const plannerNote = /on-demand throughput|inference profile|not supported/i.test(msg)
            ? 'Bedrock requires an inference profile for this model.'
            : 'Planner error (Bedrock) prevented governed execution.';
          const answerMarkdown =
            `**Planner unavailable** — ${plannerNote}\n` +
            'Ask a governed template question or provide a valid Bedrock inference profile.\n' +
            (suggestions.length ? `\nTry these deterministic templates:\n${suggestionLines}` : '');
          return response(200, {
            ok: true,
            cached: false,
            stale: false,
            question_id: 'planner_unavailable',
            columns: [],
            rows: [],
            views_used: [],
            answer_markdown: answerMarkdown,
            plan_status: 'planner_unavailable',
            suggestions: suggestionIds,
            capability: {
              capability_key: capabilityMatch.capability_key,
              support_level: capDef.support_level || null
            },
            evidence_pack: {
              executed_sql: null,
              query_execution_id: null,
              sources: [],
              row_count: 0,
              validations: { read_only: true, allowlist: true },
              confidence: 'low',
              planner_error: msg
            }
          });
        }

        const answerMarkdown = buildGovernedAnswerMarkdown(planResult);
        const evidencePack = buildEvidencePackFromPlan(planResult);
        const libraryEntry = await promoteQueryLibrary(planResult);
        const agentSteps = buildAgentSteps(planResult, answerMarkdown);
        const caseId = payload.case_id || payload.caseId || generateCaseId();
        const columns = planResult.primaryResult?.columns || [];
        const rows = planResult.primaryResult?.rows || [];
        const views = planResult.compiled?.views_used || [];

        const payloadOut = {
          sql: planResult.primaryResult?.sql || null,
          generated_sql: planResult.primaryResult?.sql || null,
          query_execution_id: planResult.primaryResult?.query_execution_id || null,
          columns,
          rows,
          truncated: planResult.primaryResult?.truncated || false,
          max_rows: planResult.primaryResult?.max_rows || null,
          views_used: views,
          answer_markdown: answerMarkdown || null,
          evidence_pack: evidencePack,
          agent_steps: agentSteps,
          query_library: libraryEntry,
          plan_status: planResult.status,
          metric_key: planResult.plan?.metric_key || null,
          capability_key: capabilityMatch.capability_key
        };

        const enrichedPayloadOut = await maybeAttachVerification({
          payloadOut,
          questionId: planResult.compiled?.query_id || planResult.plan?.metric_key || null,
          wantsInvestigation
        });

        const agentArtifacts = await writeAgentArtifacts({ caseId, questionText, planResult, payloadOut: enrichedPayloadOut });
        if (agentArtifacts) {
          enrichedPayloadOut.agent_artifacts = agentArtifacts;
        }

        await putCache(cacheKey, enrichedPayloadOut, CACHE_TTL_SECONDS);
        await writeCaseRecord(buildCaseRecord({
          caseId,
          event,
          questionText,
          questionId: planResult.compiled?.query_id || planResult.plan?.metric_key || 'governed_plan',
          payloadOut: enrichedPayloadOut,
          threadId,
          parentCaseId
        }));
        await setThreadLastCase(threadId, caseId);

        return response(200, {
          ok: true,
          cached: false,
          stale: false,
          question_id: planResult.compiled?.query_id || planResult.plan?.metric_key || 'governed_plan',
          views_used: views,
          ...enrichedPayloadOut,
          last_success_ts: Math.floor(Date.now() / 1000),
          plan_errors: planResult.errors || null,
          case_id: CASE_RUNTIME_ENABLED ? caseId : undefined,
          actions_available: buildCaseActions(enrichedPayloadOut)
        });
      }
    } else {
      if (AWS_ONLY) {
        return response(403, { ok: false, error: 'AWS-only mode: freeform SQL disabled' });
      }
      if (!ALLOW_FREEFORM_SQL) {
        return response(403, { ok: false, error: 'Freeform SQL disabled' });
      }
      const safeSql = ensureLimit(inlineSql, MAX_RESULT_ROWS);
      validateReadOnlySql(safeSql);
      validateSqlAllowlist(safeSql);
      viewsUsed = extractReferencedTables(safeSql);
      result = await executeFreeformQuery(safeSql, params);
    }

    const metricKey = resolveMetricKeyForQuestionId(questionId);
    const metricDef = metricKey ? getMetricDef(metricKey) : null;
    const requestParams = result.request_params || params || {};
    const rowCount = computeRowCount(result.rows);

    let ladder = null;
    const shouldRunLadder = Boolean(metricDef) && rowCount <= 2;
    if (shouldRunLadder) {
      ladder = await runInvestigationLadder({
        metricKey,
        metricDef,
        questionId,
        primaryResult: result,
        viewsUsed,
        baseParams: requestParams
      });
    }

    let answerMarkdown = null;
    let columnsOut = result.columns;
    let rowsOut = result.rows;
    const evidencePack = buildEvidencePackFromResult(result, viewsUsed);
    if (metricKey && metricDef) {
      evidencePack.metric_definition = {
        metric_key: metricKey,
        description: metricDef.description || null,
        grain: metricDef.grain || null,
        scope: metricDef.scope || null
      };
    }
    const freshnessChecks = ladder ? (ladder.freshness || []) : await getFreshnessEvidence(viewsUsed);
    if (freshnessChecks.length) {
      evidencePack.freshness = freshnessChecks;
    }

    const freshnessGate = await runFreshnessGate({ questionId });
    if (freshnessGate) {
      evidencePack.freshness_gate = freshnessGate;
    }

    if (ladder) {
      evidencePack.status = ladder.status;
      evidencePack.primary_value = ladder.primary_value;
      evidencePack.cross_checks = ladder.cross_checks || [];
      evidencePack.sanity_check = ladder.sanity_check || null;
      evidencePack.driver_queries = ladder.driver_queries || [];
      evidencePack.confidence = ladder.confidence || evidencePack.confidence;

      if (ladder.status === 'unavailable') {
        answerMarkdown = buildUnavailableMarkdownFromLadder(ladder);
        columnsOut = [];
        rowsOut = [];
      } else if (ladder.status === 'inconclusive') {
        answerMarkdown = buildInconclusiveMarkdownFromLadder(ladder);
      } else {
        answerMarkdown = buildAnswerMarkdown(questionId, result.columns, result.rows);
      }
    } else {
      const emptyUnavailable = freshnessChecks.some((check) => {
        if (!check || check.status !== 'empty') return false;
        const meta = getAllowedSource(check.view);
        return meta?.empty_is_unavailable === true;
      });
      answerMarkdown = emptyUnavailable ? '**UNAVAILABLE** — one or more required sources are empty.' : buildAnswerMarkdown(questionId, result.columns, result.rows);
      if (emptyUnavailable) {
        evidencePack.status = 'unavailable';
        evidencePack.confidence = 'low';
        columnsOut = [];
        rowsOut = [];
      }
    }

    if (freshnessGate && freshnessGate.status === 'blocked') {
      evidencePack.status = 'unavailable';
      evidencePack.confidence = 'low';
      answerMarkdown = buildUnavailableMarkdownFromFreshnessGate(freshnessGate);
      columnsOut = [];
      rowsOut = [];
    }

    let payloadOut = {
      sql: result.sql,
      generated_sql: generatedSql || result.sql,
      query_execution_id: result.query_execution_id,
      columns: columnsOut,
      rows: rowsOut,
      truncated: result.truncated || false,
      max_rows: result.max_rows || null,
      views_used: viewsUsed,
      request_params: requestParams || null,
      metric_key: metricKey,
      answer_markdown: answerMarkdown || null,
      evidence_pack: evidencePack,
      agent_steps: buildDeterministicAgentSteps({
        questionId,
        metricKey,
        ladder,
        result,
        answerMarkdown
      })
    };

    payloadOut = await maybeAttachVerification({ payloadOut, questionId, wantsInvestigation });

    await putCache(cacheKey, payloadOut, CACHE_TTL_SECONDS);
    const caseId = payload.case_id || payload.caseId || generateCaseId();
    await writeCaseRecord(buildCaseRecord({
      caseId,
      event,
      questionText,
      questionId: questionId || 'freeform_sql',
      payloadOut,
      threadId,
      parentCaseId
    }));
    await setThreadLastCase(threadId, caseId);

    return response(200, {
      ok: true,
      cached: false,
      stale: false,
      question_id: questionId || 'freeform_sql',
      views_used: viewsUsed,
      ...payloadOut,
      last_success_ts: Math.floor(Date.now() / 1000),
      case_id: CASE_RUNTIME_ENABLED ? caseId : undefined,
      actions_available: buildCaseActions(payloadOut)
    });
  } catch (err) {
    const cached = await getCache(cacheKey);
    if (cached && cached.result) {
      let payloadOut = cached.result;
      const freshnessGate = await runFreshnessGate({ questionId });
      if (freshnessGate) {
        const evidencePack = payloadOut?.evidence_pack && typeof payloadOut.evidence_pack === 'object'
          ? { ...payloadOut.evidence_pack, freshness_gate: freshnessGate }
          : { freshness_gate: freshnessGate };
        payloadOut = { ...payloadOut, evidence_pack: evidencePack };
        if (freshnessGate.status === 'blocked') {
          payloadOut = {
            ...payloadOut,
            columns: [],
            rows: [],
            answer_markdown: buildUnavailableMarkdownFromFreshnessGate(freshnessGate),
            evidence_pack: { ...evidencePack, status: 'unavailable', confidence: 'low' }
          };
        }
      }
      const caseId = payload.case_id || payload.caseId || generateCaseId();
      await writeCaseRecord(buildCaseRecord({
        caseId,
        event,
        questionText,
        questionId: questionId || 'freeform_sql',
        payloadOut,
        threadId,
        parentCaseId
      }));
      await setThreadLastCase(threadId, caseId);
      return response(200, {
        ok: true,
        cached: true,
        stale: true,
        question_id: questionId || 'freeform_sql',
        views_used: queryDef?.views_used || cached.result?.views_used || [],
        ...payloadOut,
        last_success_ts: cached.last_success_ts,
        error: err.message,
        case_id: CASE_RUNTIME_ENABLED ? caseId : undefined,
        actions_available: buildCaseActions(payloadOut)
      });
    }

    return response(500, { ok: false, error: err.message || 'Query failed' });
  }
};
