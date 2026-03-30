import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleAuthCallback } from '@/lib/cognitoAuth';
import { Button } from '@/components/ui/button';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const result = await handleAuthCallback();
        if (!active) return;
        navigate(result.returnUrl || '/', { replace: true });
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Login failed');
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [navigate]);

  if (error) {
    const retry = () => {
      // Go back through the normal login gate to re-establish PKCE state.
      window.location.assign('/login');
    };

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-lg border border-slate-200 bg-white p-6 shadow">
          <h1 className="text-lg font-semibold mb-2">Sign in failed</h1>
          <p className="text-sm text-slate-600">{error}</p>
          <div className="mt-4">
            <Button onClick={retry} className="w-full">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
    </div>
  );
}
