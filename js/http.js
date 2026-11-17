import { buildProxyUrl, isAbortError, sleep, throwIfAborted } from './utils.js';

export function createHttpClient({ corsProxy = '', signal } = {}) {
  async function fetchJson(url, options = {}, label = 'Request', { retries = 4 } = {}) {
    const finalUrl = buildProxyUrl(url, corsProxy);
    const activeSignal = combineSignals(signal, options.signal);
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      throwIfAborted(activeSignal);
      try {
        const response = await fetch(finalUrl, { ...options, signal: activeSignal });
        if (!response.ok) {
          const err = new Error(`${label}: HTTP ${response.status}`);
          err.status = response.status;
          err.retryAfter = Number(response.headers.get('retry-after')) || null;
          throw err;
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        if (!shouldRetry(error) || attempt === retries) throw error;
        await sleep(getRetryDelay(error, attempt), activeSignal);
      }
    }
    throw lastError;
  }

  return { fetchJson, signal };
}

function combineSignals(parent, local) {
  if (parent && local) return AbortSignal.any([parent, local]);
  return parent || local;
}

function shouldRetry(error) {
  if (isAbortError(error)) return false;
  if (!error.status) return true;
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

function getRetryDelay(error, attempt) {
  if (error.retryAfter) return error.retryAfter * 1000;
  return Math.min(30_000, 1000 * 2 ** attempt);
}