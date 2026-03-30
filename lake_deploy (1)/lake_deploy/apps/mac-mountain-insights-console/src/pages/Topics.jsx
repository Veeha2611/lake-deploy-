import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Topics() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`${createPageUrl('Console')}#topics`, { replace: true });
  }, [navigate]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 text-muted-foreground">
      Redirecting to the Intelligence Console…
    </div>
  );
}
