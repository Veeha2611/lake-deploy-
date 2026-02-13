import React, { createContext, useContext, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { MAC_AWS_ONLY, MAC_DISABLE_AUTH } from '@/lib/mac-app-flags';
import {
  isCognitoConfigured,
  ensureValidTokens,
  getUserFromTokens,
  startCognitoLogin,
  buildLogoutUrl,
  clearTokens,
  getCognitoConfig
} from '@/lib/cognitoAuth';

const AuthContext = createContext();
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const isAllowedEmail = (email) => {
  const cfg = getCognitoConfig();
  const allowed = normalizeEmail(cfg.allowedDomain || '@macmtn.com');
  return normalizeEmail(email).endsWith(allowed);
};

const safeJson = async (res) => {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return {};
  }
};

// Some Cognito token shapes omit `email` in the ID token (or the stored ID token is missing).
// Fall back to /oauth2/userInfo using the access token to recover a deterministic email.
const hydrateCognitoUser = async (tokens) => {
  if (!tokens) return null;
  const candidate = getUserFromTokens(tokens) || null;
  const hasEmail = Boolean(candidate?.email && String(candidate.email).includes('@'));
  if (hasEmail) return candidate;

  const accessToken = tokens?.access_token || null;
  const cfg = getCognitoConfig();
  if (!accessToken || !cfg?.domain) return candidate;

  try {
    const res = await fetch(`${cfg.domain.replace(/\/$/, '')}/oauth2/userInfo`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const info = await safeJson(res);
    const email = info.email || info.username || null;
    const fullName = info.name || info.given_name || null;
    if (!email) return candidate;
    return {
      ...(candidate || {}),
      email,
      full_name: fullName || candidate?.full_name || email
    };
  } catch (_) {
    return candidate;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    const loadViewer = async () => {
      try {
        if (MAC_DISABLE_AUTH) {
          setUser({ full_name: 'MAC Viewer', email: 'viewer@macmtn.com', role: 'viewer' });
          setIsAuthenticated(true);
          setAuthError(null);
          return;
        }
        if (MAC_AWS_ONLY) {
          if (!isCognitoConfigured()) {
            setUser(null);
            setIsAuthenticated(false);
            setAuthError({ type: 'auth_required', message: 'Auth not configured. Contact admin.' });
            return;
          }
          const tokens = await ensureValidTokens();
          const candidate = await hydrateCognitoUser(tokens);
          if (candidate && candidate.email && isAllowedEmail(candidate.email)) {
            const rawGroups = candidate.groups || [];
            const groups = Array.isArray(rawGroups)
              ? rawGroups
              : String(rawGroups || '').split(',');
            const isAdmin = groups.some((g) => String(g || '').trim().toLowerCase() === 'mac-admin');
            setUser({ ...candidate, role: isAdmin ? 'admin' : 'viewer' });
            setIsAuthenticated(true);
            setAuthError(null);
          } else {
            setUser(null);
            setIsAuthenticated(false);
            setAuthError({ type: 'auth_required', message: 'Sign in with a @macmtn.com email.' });
          }
          return;
        }

        const viewer = await base44.auth.me();
        if (viewer && isAllowedEmail(viewer.email)) {
          setUser(viewer);
          setIsAuthenticated(true);
          setAuthError(null);
        } else {
          setUser(null);
          setIsAuthenticated(false);
          setAuthError({ type: 'access_denied', message: 'Access restricted to @macmtn.com emails.' });
        }
      } catch (err) {
        setAuthError({ type: 'unknown', message: err.message || 'Auth unavailable' });
        setIsAuthenticated(false);
      } finally {
        setIsLoadingAuth(false);
      }
    };
    loadViewer();
  }, []);

  const login = async ({ returnUrl, email, full_name, provider } = {}) => {
    if (MAC_AWS_ONLY) {
      await startCognitoLogin({ returnUrl, provider });
      return true;
    }
    const normalized = normalizeEmail(email || '');
    if (!normalized) {
      setAuthError({ type: 'auth_required', message: 'Email is required.' });
      setIsAuthenticated(false);
      return false;
    }
    if (!isAllowedEmail(normalized)) {
      setAuthError({ type: 'access_denied', message: 'Only @macmtn.com emails can access this app.' });
      setIsAuthenticated(false);
      return false;
    }
    const nextUser = {
      full_name: full_name || normalized.split('@')[0],
      email: normalized,
      role: 'viewer'
    };
    setUser(nextUser);
    setIsAuthenticated(true);
    setAuthError(null);
    return true;
  };

  const logout = () => {
    if (!MAC_AWS_ONLY) {
      base44.auth.logout();
      setUser(null);
      setIsAuthenticated(false);
      return;
    }
    clearTokens();
    setUser(null);
    setIsAuthenticated(false);
    const logoutUrl = buildLogoutUrl();
    if (logoutUrl) {
      window.location.assign(logoutUrl);
    }
  };

  const navigateToLogin = () => {
    if (typeof window === 'undefined') return;
    const target = window.location.pathname + window.location.search + window.location.hash;
    const encoded = encodeURIComponent(target);
    if (MAC_AWS_ONLY) {
      login({ returnUrl: target });
      return;
    }
    window.location.assign(`/login?from_url=${encoded}`);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        login,
        logout,
        navigateToLogin
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
