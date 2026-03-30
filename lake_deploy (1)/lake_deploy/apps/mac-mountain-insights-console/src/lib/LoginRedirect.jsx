import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const MAX_RETURN_URL = 512;

const sanitizeReturnUrl = (raw) => {
  if (!raw) return '/';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (_) {
    decoded = raw;
  }

  if (decoded.length > MAX_RETURN_URL) return '/';
  if (decoded.includes('from_url=') || decoded.includes('fromUrl=')) return '/';
  if (decoded.startsWith('/login') || decoded.startsWith('/auth')) return '/';

  if (decoded.startsWith('http')) {
    try {
      const url = new URL(decoded);
      if (url.origin !== window.location.origin) return '/';
      return `${url.pathname}${url.search}${url.hash}`;
    } catch (_) {
      return '/';
    }
  }

  if (decoded.startsWith('/')) return decoded;
  return '/';
};

export default function LoginRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const rawReturn = params.get('from_url') || params.get('fromUrl');
    const safeTarget = sanitizeReturnUrl(rawReturn);
    navigate(safeTarget, { replace: true });
  }, [location.search, navigate]);

  return null;
}
