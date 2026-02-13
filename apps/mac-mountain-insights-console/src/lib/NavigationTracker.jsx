import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pagesConfig } from '@/pages.config';

export default function NavigationTracker() {
  const location = useLocation();
  const { Pages, mainPage } = pagesConfig;
  const mainPageKey = mainPage ?? Object.keys(Pages)[0];

  useEffect(() => {
    const pathname = location.pathname;
    const pageName = pathname === '/' || pathname === ''
      ? mainPageKey
      : pathname.replace(/^\//, '').split('/')[0];

    if (pageName) {
      // No-op: reserved for future telemetry
      return;
    }
  }, [location, mainPageKey, Pages]);

  return null;
}
