// Storage priority:
//  SAVE:  1) IndexedDB (fast local)  2) backend PostgreSQL (source of truth)
//  LOAD:  1) backend PostgreSQL      2) IndexedDB           3) localStorage

const DB_NAME    = 'nia_analyser_v3';
const DB_VERSION = 1;
const STORE      = 'uploads';
const LS_KEY     = 'nia_analyser_data';
const LS_META    = 'nia_analyser_meta';

// Derive a user-scoped IDB key so data from User A never loads for User B.
// Falls back to 'latest' when no token is present (e.g. logged out).
function getUserKey() {
  try {
    const token = localStorage.getItem('nia_token');
    if (!token) return 'latest';
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    const uid = payload.sub || '';
    return uid ? `latest_${uid}` : 'latest';
  } catch {
    return 'latest';
  }
}

// ── IndexedDB ────────────────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbSave(rawData, fileName) {
  const key = getUserKey();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id: key, rawData, fileName, savedAt: new Date().toISOString() });
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
    tx.onabort    = e => reject(e.target.error || new Error('IDB transaction aborted'));
  });
}

async function idbLoad() {
  const key = getUserKey();
  const db = await openDB();
  const row = await new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = e => reject(e.target.error);
    tx.onabort    = e => reject(e.target.error || new Error('IDB transaction aborted'));
  });
  if (row?.rawData?.length) return { rawData: row.rawData, fileName: row.fileName, savedAt: row.savedAt };
  return null;
}

// ── localStorage ─────────────────────────────────────────────────────────────
function lsSave(rawData, fileName) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rawData));
    localStorage.setItem(LS_META, JSON.stringify({ fileName, savedAt: new Date().toISOString() }));
    return true;
  } catch { return false; }
}

function lsLoad() {
  try {
    const json = localStorage.getItem(LS_KEY);
    if (!json) return null;
    const rawData = JSON.parse(json);
    if (!rawData?.length) return null;
    const meta = JSON.parse(localStorage.getItem(LS_META) || '{}');
    return { rawData, fileName: meta.fileName || '', savedAt: meta.savedAt || '' };
  } catch { return null; }
}

// ── Public API ────────────────────────────────────────────────────────────────

// Fast local-only read: IDB → localStorage. No network. Used during app startup
// so the loading screen disappears immediately, backend sync happens after.
export async function loadFromLocalCache() {
  try {
    const result = await idbLoad();
    if (result) return result;
  } catch {}
  return lsLoad();
}

export async function saveToStorage(rawData, fileName) {
  // 1. IndexedDB immediately (fast — user gets instant persistence)
  let idbOk = false;
  try {
    await idbSave(rawData, fileName);
    idbOk = true;
  } catch (e) {
    console.error('[storage] IndexedDB save failed:', e);
  }

  // 2. localStorage backup (may silently fail if data > 5 MB)
  const lsOk = lsSave(rawData, fileName);

  if (!idbOk && !lsOk) {
    throw new Error('Local storage failed. Data will not persist after refresh. Make sure the backend is running.');
  }

  console.log(`[storage] Saved locally — IDB=${idbOk}, LS=${lsOk}, rows=${rawData?.length}`);
}

export async function loadFromStorage() {
  const token = localStorage.getItem('nia_token');

  // 1. PostgreSQL — primary source of truth (only when authenticated)
  if (token) {
    try {
      const { api } = await import('./api');
      const result = await api.getLatestData();
      if (result?.rows?.length) {
        console.log(`[storage] Loaded from PostgreSQL: ${result.rows.length} rows (${result.file_name})`);
        // Warm the local cache so offline loads still work
        idbSave(result.rows, result.file_name).catch(() => {});
        lsSave(result.rows, result.file_name);
        return { rawData: result.rows, fileName: result.file_name || '', savedAt: result.uploaded_at || '' };
      }
    } catch (e) {
      console.warn('[storage] PostgreSQL load failed, falling back to local storage:', e?.message);
    }
  }

  // 2. IndexedDB — offline fallback
  try {
    const result = await idbLoad();
    if (result) {
      console.log(`[storage] Loaded from IndexedDB: ${result.rawData.length} rows (${result.fileName})`);
      return result;
    }
  } catch (e) {
    console.error('[storage] IndexedDB load failed:', e);
  }

  // 3. localStorage — last resort
  const lsResult = lsLoad();
  if (lsResult) {
    console.log(`[storage] Loaded from localStorage: ${lsResult.rawData.length} rows (${lsResult.fileName})`);
    return lsResult;
  }

  console.warn('[storage] No data found in any storage.');
  return null;
}

export async function clearStorage() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete('latest');
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  } catch { /* ignore */ }
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_META);
  } catch { /* ignore */ }
}
