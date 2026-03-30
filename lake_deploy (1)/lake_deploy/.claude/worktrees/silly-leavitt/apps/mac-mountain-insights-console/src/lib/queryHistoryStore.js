const STORAGE_KEY = 'mac_query_history_v1';
const MAX_ENTRIES = 25;

export function loadQueryHistory() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

export function saveQueryHistory(entries) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    // ignore
  }
}

export function addQueryHistory(question) {
  const entries = loadQueryHistory();
  const now = new Date().toISOString();
  const newEntry = {
    id: `${Date.now()}`,
    question,
    created_date: now
  };
  const next = [newEntry, ...entries].slice(0, MAX_ENTRIES);
  saveQueryHistory(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('mac-query-history-updated'));
  }
  return next;
}

export function clearQueryHistory() {
  saveQueryHistory([]);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('mac-query-history-updated'));
  }
}
