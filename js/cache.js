const DB_NAME = 'must-export-cache-v1';
const STORE = 'libraries';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'username' });
      }
    };
  });
}

/**
 * @typedef {{ username: string, fetchedAt: string, library: object, options: object }} CacheRecord
 */

/** @returns {Promise<CacheRecord|null>} */
export async function getCachedLibrary(username) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(username);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function setCachedLibrary(username, library, options = {}) {
  const db = await openDb();
  const record = {
    username,
    fetchedAt: new Date().toISOString(),
    library,
    options,
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return record;
}

export async function clearCachedLibrary(username) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(username);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let memoryCache = null;

export function getMemoryCache() {
  return memoryCache;
}

export function setMemoryCache(record) {
  memoryCache = record;
}