const TOKEN_STORAGE_KEY = 'mac_cognito_tokens_v1';
const AUTH_REQUEST_KEY = 'mac_cognito_auth_request_v1';
const CLOCK_SKEW_SECONDS = 60;
const AUTH_REQUEST_TTL_MS = 15 * 60 * 1000;

const getWindowConfig = () => {
  if (typeof window === 'undefined') return {};
  return window.__MAC_APP_CONFIG__ || {};
};

const getEnv = (key) => {
  return (import.meta?.env?.[key] || '').trim();
};

const normalize = (value) => String(value || '').trim();

export const getCognitoConfig = () => {
  const cfg = getWindowConfig();
  const domain = normalize(cfg.cognitoDomain || getEnv('VITE_COGNITO_DOMAIN'));
  const clientId = normalize(cfg.cognitoClientId || getEnv('VITE_COGNITO_CLIENT_ID'));
  const region = normalize(cfg.cognitoRegion || getEnv('VITE_COGNITO_REGION') || 'us-east-2');
  const userPoolId = normalize(cfg.cognitoUserPoolId || getEnv('VITE_COGNITO_USER_POOL_ID'));
  const allowedDomain = normalize(cfg.allowedEmailDomain || getEnv('VITE_ALLOWED_EMAIL_DOMAIN') || '@macmtn.com');
  const authProvider = normalize(cfg.authProvider || getEnv('VITE_AUTH_PROVIDER'));
  const authProviders = Array.isArray(cfg.authProviders)
    ? cfg.authProviders.map((p) => String(p || '').trim().toLowerCase()).filter(Boolean)
    : normalize(getEnv('VITE_AUTH_PROVIDERS'))
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectUri = normalize(cfg.cognitoRedirectUri || getEnv('VITE_COGNITO_REDIRECT_URI') || `${origin}/auth/callback`);
  const logoutUri = normalize(cfg.cognitoLogoutUri || getEnv('VITE_COGNITO_LOGOUT_URI') || origin);
  return {
    domain: domain.replace(/\/$/, ''),
    clientId,
    region,
    userPoolId,
    redirectUri,
    logoutUri,
    allowedDomain,
    authProvider: authProvider.toLowerCase(),
    authProviders,
    scopes: ['openid', 'email', 'profile']
  };
};

export const isCognitoConfigured = () => {
  const cfg = getCognitoConfig();
  return Boolean(cfg.domain && cfg.clientId && cfg.redirectUri);
};

const base64UrlEncode = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const sha256 = async (value) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
};

const randomString = (length = 64) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += charset[values[i] % charset.length];
  }
  return output;
};

const readStorage = (key, isSession = false) => {
  if (typeof window === 'undefined') return null;
  const storage = isSession ? window.sessionStorage : window.localStorage;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

const writeStorage = (key, value, isSession = false) => {
  if (typeof window === 'undefined') return;
  const storage = isSession ? window.sessionStorage : window.localStorage;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (_) {}
};

const clearStorage = (key, isSession = false) => {
  if (typeof window === 'undefined') return;
  const storage = isSession ? window.sessionStorage : window.localStorage;
  try {
    storage.removeItem(key);
  } catch (_) {}
};

const isExpired = (expiresAt) => {
  if (!expiresAt) return true;
  const now = Date.now();
  return now + CLOCK_SKEW_SECONDS * 1000 >= Number(expiresAt);
};

export const getStoredTokens = () => readStorage(TOKEN_STORAGE_KEY);

export const clearTokens = () => clearStorage(TOKEN_STORAGE_KEY);

const storeTokens = (tokens) => {
  if (!tokens) return null;
  const expiresAt = Date.now() + Number(tokens.expires_in || 0) * 1000;
  const payload = {
    access_token: tokens.access_token,
    id_token: tokens.id_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type || 'Bearer',
    scope: tokens.scope,
    expires_at: expiresAt
  };
  writeStorage(TOKEN_STORAGE_KEY, payload);
  return payload;
};

export const parseJwt = (token) => {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(payload);
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
};

export const getUserFromTokens = (tokens) => {
  const claims = parseJwt(tokens?.id_token);
  if (!claims) return null;
  return {
    email: claims.email || claims['cognito:username'] || null,
    full_name: claims.name || claims.given_name || claims.email || null,
    groups: claims['cognito:groups'] || []
  };
};

const isAuthRequestValid = (request) => {
  if (!request || typeof request !== 'object') return false;
  if (!request.state || !request.code_verifier) return false;
  const createdAt = Number(request.created_at || 0);
  if (!createdAt) return false;
  return Date.now() - createdAt < AUTH_REQUEST_TTL_MS;
};

const getAuthRequest = () => {
  const session = readStorage(AUTH_REQUEST_KEY, true);
  if (isAuthRequestValid(session)) return session;

  // Fallback: some browsers/extensions can clear sessionStorage during redirects.
  const local = readStorage(AUTH_REQUEST_KEY, false);
  if (isAuthRequestValid(local)) return local;

  return null;
};

const setAuthRequest = (payload) => {
  const request = { ...(payload || {}), created_at: Date.now() };
  writeStorage(AUTH_REQUEST_KEY, request, true);
  writeStorage(AUTH_REQUEST_KEY, request, false);
};

const clearAuthRequest = () => {
  clearStorage(AUTH_REQUEST_KEY, true);
  clearStorage(AUTH_REQUEST_KEY, false);
};

const normalizeProvider = (provider) => String(provider || '').trim().toLowerCase();

const toCognitoProvider = (provider) => {
  const normalized = normalizeProvider(provider);
  if (!normalized || normalized === 'cognito') return null;
  if (normalized === 'google') return 'Google';
  if (normalized === 'amazon') return 'LoginWithAmazon';
  return provider;
};

export const buildLoginUrl = async ({ returnUrl, provider } = {}) => {
  const cfg = getCognitoConfig();
  if (!cfg.domain || !cfg.clientId) {
    throw new Error('Cognito not configured');
  }
  const state = randomString(32);
  const codeVerifier = randomString(64);
  let codeChallenge = codeVerifier;
  let codeChallengeMethod = 'plain';
  try {
    codeChallenge = await sha256(codeVerifier);
    codeChallengeMethod = 'S256';
  } catch (_) {
    codeChallenge = codeVerifier;
    codeChallengeMethod = 'plain';
  }
  setAuthRequest({ state, code_verifier: codeVerifier, return_url: returnUrl || '/' });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes.join(' '),
    state,
    code_challenge_method: codeChallengeMethod,
    code_challenge: codeChallenge
  });
  const providerName = toCognitoProvider(provider || cfg.authProvider);
  if (providerName) {
    params.set('identity_provider', providerName);
  }
  return `${cfg.domain}/oauth2/authorize?${params.toString()}`;
};

export const startCognitoLogin = async ({ returnUrl, provider } = {}) => {
  const url = await buildLoginUrl({ returnUrl, provider });
  window.location.assign(url);
};

const exchangeCodeForToken = async ({ code, codeVerifier }) => {
  const cfg = getCognitoConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    code,
    code_verifier: codeVerifier
  });
  const res = await fetch(`${cfg.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error_description || 'Token exchange failed');
  }
  return json;
};

const refreshTokens = async (refreshToken) => {
  const cfg = getCognitoConfig();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    refresh_token: refreshToken
  });
  const res = await fetch(`${cfg.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error_description || 'Token refresh failed');
  }
  return json;
};

export const handleAuthCallback = async () => {
  const params = new URLSearchParams(window.location.search || '');
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  if (error) {
    throw new Error(params.get('error_description') || error);
  }
  if (!code) {
    throw new Error('Missing authorization code');
  }
  const request = getAuthRequest();
  if (!request || request.state !== state) {
    throw new Error('Invalid login state');
  }

  const tokens = await exchangeCodeForToken({ code, codeVerifier: request.code_verifier });
  clearAuthRequest();
  return {
    stored: storeTokens({ ...tokens, refresh_token: tokens.refresh_token || request.refresh_token }),
    returnUrl: request.return_url || '/'
  };
};

export const ensureValidTokens = async () => {
  const stored = getStoredTokens();
  if (!stored) return null;
  if (!isExpired(stored.expires_at)) return stored;
  if (stored.refresh_token) {
    try {
      const refreshed = await refreshTokens(stored.refresh_token);
      return storeTokens({ ...refreshed, refresh_token: stored.refresh_token });
    } catch (_) {
      clearTokens();
      return null;
    }
  }
  clearTokens();
  return null;
};

export const getAuthToken = async () => {
  const tokens = await ensureValidTokens();
  if (!tokens) return null;
  // Prefer ID token: it reliably contains `email` for domain gating / evidence.
  // Access tokens may omit `email` and only include a non-email username for federated users.
  return tokens.id_token || tokens.access_token || null;
};

export const buildLogoutUrl = () => {
  const cfg = getCognitoConfig();
  if (!cfg.domain || !cfg.clientId) return null;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    logout_uri: cfg.logoutUri
  });
  return `${cfg.domain}/logout?${params.toString()}`;
};
