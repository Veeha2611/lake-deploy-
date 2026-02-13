import { getAuthToken } from '@/lib/cognitoAuth';

const DEFAULT_VIEWER = {
  full_name: 'MAC Viewer',
  email: 'viewer@macmtn.com',
  role: 'viewer'
};

const getWindowConfig = () => {
  if (typeof window === 'undefined') return {};
  return window.__MAC_APP_CONFIG__ || {};
};

const getApiBaseUrl = () => {
  const cfg = getWindowConfig();
  return (
    cfg.apiBaseUrl ||
    import.meta.env.VITE_MAC_APP_API_BASE ||
    ''
  ).replace(/\/$/, '');
};

const getViewer = () => {
  const cfg = getWindowConfig();
  if (cfg.viewer && typeof cfg.viewer === 'object') {
    return { ...DEFAULT_VIEWER, ...cfg.viewer };
  }
  return DEFAULT_VIEWER;
};

const getAwsOnly = () => {
  const cfg = getWindowConfig();
  if (typeof cfg.awsOnly === 'boolean') return cfg.awsOnly;
  return String(import.meta.env.VITE_MAC_APP_AWS_ONLY || 'true').toLowerCase() === 'true';
};

const safeJson = async (res) => {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    return { ok: false, error: 'Non-JSON response', raw: text };
  }
};

const apiFetch = async (path, { method = 'POST', body } = {}) => {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return { ok: false, error: 'MAC API base URL not configured' };
  }
  const token = await getAuthToken();
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await safeJson(res);
  if (!res.ok && !json.ok) {
    return { ok: false, error: json.error || `HTTP ${res.status}` };
  }
  return json;
};

const normalizeAthenaRows = (payload) => {
  const columns = payload.columns || [];
  let rows = payload.rows || [];
  if (rows.length && columns.length) {
    const header = rows[0];
    if (Array.isArray(header) && header.length === columns.length) {
      const matchesHeader = header.every((val, idx) => val === columns[idx]);
      if (matchesHeader) {
        rows = rows.slice(1);
      }
    }
  }
  return { columns, rows };
};

const invokeAiLayerQuery = async (payload = {}) => {
  const sql = payload?.params?.sql || payload?.sql || null;
  const questionId = payload?.question_id || payload?.query_id || payload?.template_id || null;
  const params = payload?.params || {};
  const awsOnly = getAwsOnly();

  if (awsOnly && sql) {
    return {
      data: {
        ok: false,
        error: 'SQL execution is disabled in AWS-only mode. Use an allowed question_id.'
      }
    };
  }

  if (!sql && !questionId) {
    return {
      data: {
        ok: false,
        error: 'Missing sql or question_id'
      }
    };
  }

  const body = sql ? { sql, params } : { question_id: questionId, params };
  const response = await apiFetch('/query', { method: 'POST', body });

  if (!response.ok) {
    return {
      data: {
        ok: false,
        error: response.error || 'Query failed'
      }
    };
  }

  const { columns, rows } = normalizeAthenaRows(response);
  const dataRows = rows || [];
  const dataResults = columns.length
    ? dataRows.map((row) => {
        const values = Array.isArray(row) ? row : Object.values(row);
        const obj = {};
        columns.forEach((col, idx) => {
          obj[col] = values[idx];
        });
        return obj;
      })
    : [];

  const evidence = {
    athena_query_execution_id: response.query_execution_id,
    sql: response.sql,
    views_used: response.views_used || []
  };

  return {
    data: {
      ok: true,
      columns,
      data_rows: dataRows,
      data_results: dataResults,
      rows_returned: dataRows.length,
      generated_sql: response.sql,
      athena_query_execution_id: response.query_execution_id,
      cached: response.cached,
      stale: response.stale,
      evidence
    }
  };
};

const getQueryRegistry = async () => {
  const response = await apiFetch('/registry', { method: 'GET' });
  if (!response.ok) {
    return { ok: false, error: response.error || 'Registry unavailable' };
  }
  return response;
};

const normalizeFunctionResponse = (response, fallbackError = 'Request failed') => {
  if (response && response.ok === false) {
    return { data: { success: false, error: response.error || fallbackError } };
  }
  if (response && response.success !== undefined) {
    return { data: response };
  }
  return { data: { success: true, ...(response || {}) } };
};

const invokeProjectsUpdates = async (payload = {}) => {
  const response = await apiFetch('/projects/updates', { method: 'POST', body: payload });
  return normalizeFunctionResponse(response, 'Project updates failed');
};

const invokePipelineResults = async (payload = {}) => {
  const response = await apiFetch('/projects/pipeline-results', { method: 'POST', body: payload });
  return normalizeFunctionResponse(response, 'Pipeline results export failed');
};

const invokeSaveProject = async (payload = {}) => {
  const response = await apiFetch('/projects/save', { method: 'POST', body: payload });
  return normalizeFunctionResponse(response, 'Save project failed');
};

const invokeProjectSubmissions = async (payload = {}) => {
  const response = await apiFetch('/projects/submissions', { method: 'POST', body: payload });
  return normalizeFunctionResponse(response, 'Project submissions failed');
};

const invokeScenariosRegistry = async (payload = {}) => {
  const response = await apiFetch('/engine/scenarios', { method: 'POST', body: payload });
  return normalizeFunctionResponse(response, 'Scenario registry failed');
};

const invokeModelOutputs = async (payload = {}) => {
  const response = await apiFetch('/engine/outputs', { method: 'POST', body: payload });
  return normalizeFunctionResponse(response, 'Model outputs failed');
};

const invokeProjectModel = async (payload = {}) => {
  const response = await apiFetch('/engine/run', { method: 'POST', body: payload });
  return normalizeFunctionResponse(response, 'Project model failed');
};

const invokePortfolioModel = async (payload = {}) => {
  const response = await apiFetch('/engine/portfolio', { method: 'POST', body: payload });
  return normalizeFunctionResponse(response, 'Portfolio model failed');
};

const invokeScenarioSubitem = async (payload = {}) => {
  const response = await apiFetch('/monday/scenario-subitem', { method: 'POST', body: payload });
  return normalizeFunctionResponse(response, 'Monday scenario subitem failed');
};

const checkAWSHealth = async () => {
  const response = await apiFetch('/health', { method: 'GET' });
  return {
    athena_connected: !!response.ok,
    last_successful_query: response.timestamp || null,
    lambda_endpoint: getApiBaseUrl(),
    environment: 'prod',
    athena_workgroup: 'primary',
    s3_output_bucket: 's3://gwi-raw-us-east-2-pc/athena-results/',
    error: response.ok ? null : response.error || 'Health check failed'
  };
};

const invokeAdminUsers = async (payload = {}) => {
  const action = payload.action || 'list';
  if (action === 'list') {
    const group = payload.group || 'mac-admin';
    const response = await apiFetch(`/admin/users?group=${encodeURIComponent(group)}`, { method: 'GET' });
    return normalizeFunctionResponse(response, 'Admin list failed');
  }
  const response = await apiFetch('/admin/users', { method: 'POST', body: payload });
  return normalizeFunctionResponse(response, 'Admin action failed');
};

const functionHandlers = {
  aiLayerQuery: invokeAiLayerQuery,
  listProjectUpdates: invokeProjectsUpdates,
  deleteProject: invokeProjectsUpdates,
  downloadPipelineResults: invokePipelineResults,
  saveProject: invokeSaveProject,
  submitProjectForReview: invokeProjectSubmissions,
  listProjectSubmissions: invokeProjectSubmissions,
  promoteSubmissionToProject: invokeProjectSubmissions,
  manageScenariosRegistry: invokeScenariosRegistry,
  listProjectModelOutputs: invokeModelOutputs,
  runProjectModel: invokeProjectModel,
  runPortfolioAnalysisV2: invokePortfolioModel,
  createMondayScenarioSubitem: invokeScenarioSubitem,
  adminUsers: invokeAdminUsers,
  answerQuestion: async () => ({ data: { ok: false, error: 'Natural language queries are disabled in AWS-only build' } }),
  answerQuestionV2: async () => ({ data: { ok: false, error: 'Natural language queries are disabled in AWS-only build' } })
};

const queryHistoryKey = 'mac_query_history_v1';

const readQueryHistory = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(queryHistoryKey);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
};

const writeQueryHistory = (items) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(queryHistoryKey, JSON.stringify(items));
};

export const base44 = {
  functions: {
    invoke: async (name, payload = {}) => {
      const handler = functionHandlers[name];
      if (handler) {
        return handler(payload);
      }
      return {
        data: {
          ok: false,
          error: `Function "${name}" not configured in AWS-only build`
        }
      };
    },
    checkAWSHealth,
    getQueryRegistry,
    adminUsers: invokeAdminUsers
  },
  auth: {
    me: async () => getViewer(),
    logout: () => {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(queryHistoryKey);
      }
    },
    redirectToLogin: () => {}
  },
  appLogs: {
    logUserInApp: async () => true
  },
  entities: {
    Query: {
      create: async (payload) => {
        const items = readQueryHistory();
        const record = {
          ...payload,
          id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
          created_date: new Date().toISOString()
        };
        items.unshift(record);
        writeQueryHistory(items.slice(0, 50));
        return record;
      },
      list: async (_orderBy = '-created_date', limit = 10) => {
        const items = readQueryHistory();
        return items.slice(0, limit);
      },
      delete: async (id) => {
        const items = readQueryHistory().filter((item) => item.id !== id);
        writeQueryHistory(items);
        return { ok: true };
      }
    }
  },
  integrations: {
    Core: {
      InvokeLLM: async () => ({
        data: {
          ok: false,
          error: 'LLM integration disabled in AWS-only build'
        }
      })
    }
  }
};

export default base44;
