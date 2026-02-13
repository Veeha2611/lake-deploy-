import { validateQueryAgainstAllowlist, QUERY_REGISTRY } from '@/components/dashboard/SSOTQueryRegistry';
import { getMockData } from '@/api/mockSSOTData';
import { MAC_API_BASE, MAC_PREVIEW, MAC_AWS_ONLY } from '@/lib/mac-app-flags';
import { getAuthToken } from '@/lib/cognitoAuth';

const AWS_QUERY_ID_ALIASES = {
  account_movement: 'account_movement_6m',
  mrr_summary: 'mrr_summary_12m',
  band_distribution: 'ae_band_distribution',
  ticket_trend: 'ticket_trend_90d',
  total_mrr_detail: 'total_mrr',
  active_accounts_detail: 'active_accounts',
  at_risk_detail: 'at_risk_customers'
};

function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

function applyParams(sql, params) {
  if (!params || !sql) return sql;
  let rendered = sql;
  Object.keys(params).forEach((key) => {
    rendered = rendered.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), escapeSqlValue(params[key]));
  });
  return rendered;
}

function resolveQueryById(queryId) {
  if (!queryId) return null;
  const registryEntries = Object.values(QUERY_REGISTRY || {});
  return registryEntries.find(entry => entry.id === queryId) || null;
}

export function getRegisteredQuery(queryId) {
  return resolveQueryById(queryId);
}

function normalizeRows(rows, columns) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  if (!Array.isArray(columns) || columns.length === 0) return rows;
  const first = rows[0];
  if (!Array.isArray(first) || first.length !== columns.length) return rows;
  const matchesHeader = first.every((val, idx) =>
    String(val).trim().toLowerCase() === String(columns[idx]).trim().toLowerCase()
  );
  return matchesHeader ? rows.slice(1) : rows;
}

async function runMacApiQuery({ queryId, sql, label, params } = {}) {
  if (!MAC_API_BASE) return null;
  const questionId = AWS_QUERY_ID_ALIASES[queryId] || queryId;
  const payload = questionId
    ? { question_id: questionId, params: params || {} }
    : { sql, params: params || {} };
  if (!payload.question_id && !payload.sql) return null;

  const baseUrl = MAC_API_BASE.replace(/\/$/, '');
  const token = await getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${baseUrl}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `MAC API error (${res.status})`);
  }

  const columns = json.columns || [];
  const dataRows = Array.isArray(json.data_rows)
    ? json.data_rows
    : normalizeRows(json.rows || [], columns);

  return {
    data: {
      ok: true,
      columns,
      data_rows: dataRows,
      evidence: {
        athena_query_execution_id: json.query_execution_id || null,
        generated_sql: json.sql || sql || null,
        views_used: json.views_used || [],
        query_id: json.question_id || questionId || null,
        query_name: label || null
      }
    }
  };
}

function runMockQuery({ queryId, sql, label } = {}) {
  const mock = getMockData({ queryId, sql });
  return {
    data: {
      ok: true,
      columns: mock.columns || [],
      data_rows: normalizeRows(mock.data_rows || [], mock.columns || []),
      evidence: {
        athena_query_execution_id: 'preview',
        generated_sql: sql || null,
        query_id: queryId || null,
        query_name: label || null
      }
    }
  };
}

export async function runSSOTQuery({ sql, queryId, label, params } = {}) {
  const useMock = MAC_PREVIEW && !MAC_API_BASE;
  if (useMock) {
    return runMockQuery({ queryId, sql, label });
  }

  const registryEntry = resolveQueryById(queryId);

  // In AWS-only mode, prefer the MAC API by question_id even if the local registry
  // doesn't have SQL. This avoids "missing SQL" errors for API-backed query IDs.
  if (MAC_API_BASE && queryId && (MAC_AWS_ONLY || !registryEntry)) {
    try {
      const macResponse = await runMacApiQuery({ queryId, label, params });
      if (macResponse) {
        return macResponse;
      }
    } catch (error) {
      // If MAC API doesn't recognize the question_id and we have local SQL, fall back.
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('unknown question_id') || !registryEntry?.sql) {
        throw error;
      }
      if (MAC_AWS_ONLY) {
        throw new Error(`Unknown question_id "${queryId}" in AWS-only mode`);
      }
    }
  }

  const resolvedSql = applyParams(registryEntry?.sql || sql, params);

  if (!resolvedSql) {
    throw new Error(`SSOT query missing SQL${queryId ? ` for queryId=${queryId}` : ''}`);
  }

  const validation = validateQueryAgainstAllowlist(resolvedSql);
  if (!validation.valid) {
    throw new Error(`SSOT query rejected${label ? ` (${label})` : ''}: ${validation.error}`);
  }

  if (MAC_API_BASE) {
    try {
      const macResponse = await runMacApiQuery({ queryId, sql: resolvedSql, label, params });
      if (macResponse) {
        return macResponse;
      }
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!MAC_AWS_ONLY && message.includes('unknown question_id') && resolvedSql) {
        const fallback = await runMacApiQuery({ sql: resolvedSql, label, params });
        if (fallback) {
          return fallback;
        }
      }
      throw error;
    }
  }

  if (MAC_AWS_ONLY) {
    throw new Error('MAC API not configured for SSOT query');
  }

  throw new Error('SSOT query failed: MAC API unavailable');
}
