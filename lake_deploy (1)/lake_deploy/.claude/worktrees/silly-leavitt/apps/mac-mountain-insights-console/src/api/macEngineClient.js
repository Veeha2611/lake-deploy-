import { MAC_API_BASE } from '@/lib/mac-app-flags';
import { getAuthToken } from '@/lib/cognitoAuth';

const ENGINE_ENDPOINTS = {
  manageScenariosRegistry: '/engine/scenarios',
  listProjectModelOutputs: '/engine/outputs',
  runProjectModel: '/engine/run',
  runPortfolioAnalysisV2: '/engine/portfolio',
  runRevenueReproPack: '/engine/revenue-repro-pack',
  getRevenueReproStatus: '/engine/revenue-repro-status',
  caseAction: '/cases/action',
  downloadArtifact: '/artifacts/download',
  createBaselineScenario: '/projects/baseline-scenario',
  createMondayScenarioSubitem: '/monday/scenario-subitem',
  listProjectUpdates: '/projects/updates',
  downloadPipelineResults: '/projects/pipeline-results',
  deleteProject: '/projects/updates'
};

function getBaseUrl() {
  return MAC_API_BASE ? MAC_API_BASE.replace(/\/$/, '') : '';
}

async function post(path, payload) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error('MAC API base not configured');
  }
  const token = await getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `MAC API error (${res.status})`);
  }
  return json;
}

export async function macEngineInvoke(functionName, payload = {}) {
  const path = ENGINE_ENDPOINTS[functionName];
  if (!path) {
    throw new Error(`No MAC API mapping for ${functionName}`);
  }

  const data = await post(path, payload);
  return { data };
}

export const MAC_ENGINE_ENABLED = Boolean(MAC_API_BASE);
