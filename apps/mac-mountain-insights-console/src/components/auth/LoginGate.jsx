import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { MAC_AWS_ONLY, MAC_DISABLE_AUTH } from '@/lib/mac-app-flags';
import { buildLoginUrl, getCognitoConfig } from '@/lib/cognitoAuth';

const sanitizeReturnUrl = (raw) => {
  if (!raw) return '/';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (_) {
    decoded = raw;
  }
  if (!decoded.startsWith('/')) return '/';
  if (decoded.startsWith('/login') || decoded.startsWith('/auth')) return '/';
  return decoded;
};

export default function LoginGate() {
  const { login, authError, isAuthenticated } = useAuth();
  const [error, setError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [loginUrl, setLoginUrl] = useState(null);
  const [googleUrl, setGoogleUrl] = useState(null);
  const authCfg = getCognitoConfig();
  const providerList = authCfg.authProviders?.length
    ? authCfg.authProviders
    : authCfg.authProvider
    ? [authCfg.authProvider]
    : [];
  const showGoogle = providerList.includes('google');

  const params = new URLSearchParams(location.search || '');
  const returnUrl = sanitizeReturnUrl(params.get('from_url') || params.get('fromUrl'));

  if (isAuthenticated) {
    navigate(returnUrl || '/', { replace: true });
    return null;
  }
  if (MAC_DISABLE_AUTH) {
    navigate(returnUrl || '/', { replace: true });
    return null;
  }

  useEffect(() => {
    if (!MAC_AWS_ONLY) return;
    let active = true;
    buildLoginUrl({ returnUrl })
      .then((url) => {
        if (active) setLoginUrl(url);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Authentication failed.');
      });
    if (showGoogle) {
      buildLoginUrl({ returnUrl, provider: 'google' })
        .then((url) => {
          if (active) setGoogleUrl(url);
        })
        .catch((err) => {
          if (active) setError(err?.message || 'Authentication failed.');
        });
    } else if (active) {
      setGoogleUrl(null);
    }
    return () => {
      active = false;
    };
  }, [returnUrl, showGoogle]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (MAC_AWS_ONLY) {
      if (loginUrl) {
        window.location.assign(loginUrl);
        return;
      }
      try {
        await login({ returnUrl });
      } catch (err) {
        setError(err?.message || 'Authentication failed.');
      }
      return;
    }
    setError('Auth not configured for this environment.');
  };

  const message = error || authError?.message || null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--mac-cream)] px-4">
      <Card className="w-full max-w-md shadow-xl border border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl">MAC App Sign In</CardTitle>
          <p className="text-sm text-muted-foreground">
            Access is limited to @macmtn.com emails.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {message ? (
              <div className="text-sm text-amber-700">{message}</div>
            ) : null}
            <Button type="submit" className="w-full">
              Sign In with MAC Account
            </Button>
            {showGoogle && googleUrl ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => window.location.assign(googleUrl)}
              >
                Sign In with Google
              </Button>
            ) : null}
            {loginUrl ? (
              <a
                href={loginUrl}
                className="block text-center text-xs text-slate-500 hover:text-slate-700"
              >
                If nothing happens, open the sign-in page directly.
              </a>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
