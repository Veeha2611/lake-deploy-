const getWindowConfig = () => {
  if (typeof window === 'undefined') return {};
  return window.__MAC_APP_CONFIG__ || {};
};

const getEnv = (key) => {
  return (import.meta?.env?.[key] || '').trim();
};

const cfg = getWindowConfig();
const DEFAULT_API_BASE = 'https://0vyy63hwe5.execute-api.us-east-2.amazonaws.com/prod';

const asBool = (value, defaultValue = false) => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return defaultValue;
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
};

export const MAC_PREVIEW = typeof cfg.preview === 'boolean'
  ? cfg.preview
  : String(getEnv('VITE_MAC_APP_PREVIEW')).toLowerCase() === 'true';

export const MAC_API_BASE = (cfg.apiBaseUrl || getEnv('VITE_MAC_APP_API_BASE') || DEFAULT_API_BASE).trim();

export const USE_MAC_API = Boolean(MAC_API_BASE) && !MAC_PREVIEW;

export const MAC_AWS_ONLY = typeof cfg.awsOnly === 'boolean'
  ? cfg.awsOnly
  : String(getEnv('VITE_MAC_APP_AWS_ONLY') || 'true').toLowerCase() === 'true';

// Auth can be disabled for breakglass/preview via runtime config.
// Default is false (auth enabled) unless explicitly set.
export const MAC_DISABLE_AUTH = typeof cfg.disableAuth === 'boolean'
  ? cfg.disableAuth
  : String(getEnv('VITE_MAC_DISABLE_AUTH') || 'false').toLowerCase() === 'true';

// AI runtime feature flags (UI gating only; backend enforces independently).
// Default safe state is false unless explicitly enabled via runtime config or env.
export const CASE_RUNTIME_ENABLED = asBool(cfg.CASE_RUNTIME_ENABLED, asBool(getEnv('VITE_CASE_RUNTIME_ENABLED'), false));
export const BEDROCK_TOOL_USE_ENABLED = asBool(cfg.BEDROCK_TOOL_USE_ENABLED, asBool(getEnv('VITE_BEDROCK_TOOL_USE_ENABLED'), false));
export const KB_ENABLED = asBool(cfg.KB_ENABLED, asBool(getEnv('VITE_KB_ENABLED'), false));
export const VERIFY_ACTION_ENABLED = asBool(cfg.VERIFY_ACTION_ENABLED, asBool(getEnv('VITE_VERIFY_ACTION_ENABLED'), false));
export const REPORT_EXPORT_ENABLED = asBool(cfg.REPORT_EXPORT_ENABLED, asBool(getEnv('VITE_REPORT_EXPORT_ENABLED'), false));
