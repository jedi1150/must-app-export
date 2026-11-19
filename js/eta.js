/** Timing constants aligned with must-api.js, tmdb.js, mal-resolve.js */
export const LOAD = {
  PRODUCT_BATCH: 100,
  BATCH_PAUSE_MS: 350,
  BATCH_REQUEST_MS: 900,
  REVIEW_BATCH_MS: 650,
  PROFILE_OVERHEAD_MS: 2_500,
  EPISODE_LOOKUP_RATIO: 0.35,
  EPISODE_BATCH_MS: 800,
};

export const EXPORT = {
  LOOKUP_BATCH: 20,
  TMDB_CONCURRENCY: 4,
  BETWEEN_BATCHES_MS: 250,
  TMDB_ITEM_MS: 650,
  JIKAN_GAP_MS: 420,
  JIKAN_REQUEST_MS: 380,
  BUILD_MS: 1_200,
  ZIP_MS: 400,
};

/**
 * Estimate profile library fetch duration (ms) from public profile list id counts.
 */
export function estimateLoadDurationMs(profile, { includeReviews = false } = {}) {
  if (!profile?.lists) return LOAD.PROFILE_OVERHEAD_MS;

  const listNames = ['watched', 'want', 'shows'];
  let listMs = 0;

  for (const name of listNames) {
    const count = (profile.lists[name] || []).length;
    if (!count) continue;
    const batches = Math.ceil(count / LOAD.PRODUCT_BATCH);
    const perBatch = LOAD.BATCH_REQUEST_MS + (includeReviews ? LOAD.REVIEW_BATCH_MS : 0);
    listMs += batches * perBatch + Math.max(0, batches - 1) * LOAD.BATCH_PAUSE_MS;
  }

  const showCount = (profile.lists.shows || []).length;
  const episodeBatches = Math.ceil((showCount * LOAD.EPISODE_LOOKUP_RATIO) / LOAD.PRODUCT_BATCH);
  const episodeMs = episodeBatches > 0 ? episodeBatches * LOAD.EPISODE_BATCH_MS : 0;

  return LOAD.PROFILE_OVERHEAD_MS + listMs + episodeMs;
}

/**
 * Estimate export duration (ms) for a format given a loaded library.
 * @param {object} library
 * @param {string} format — resolved export format id
 * @param {{ skipTmdb?: boolean }} options — skipTmdb when items already carry externalIds
 */
export function estimateExportDurationMs(library, format, { skipTmdb = false } = {}) {
  const items = countLookupItems(library);
  let ms = EXPORT.BUILD_MS;

  const needsTmdb = format !== 'json' && format !== 'mal-xml' && !skipTmdb;
  const needsMal = format === 'mal-xml';

  if (needsTmdb && items > 0) {
    const batches = Math.ceil(items / EXPORT.LOOKUP_BATCH);
    const batchTime =
      Math.ceil(EXPORT.LOOKUP_BATCH / EXPORT.TMDB_CONCURRENCY) * EXPORT.TMDB_ITEM_MS;
    ms += batches * batchTime + Math.max(0, batches - 1) * EXPORT.BETWEEN_BATCHES_MS;
  }

  if (needsMal && items > 0) {
    ms += items * (EXPORT.JIKAN_REQUEST_MS + EXPORT.JIKAN_GAP_MS);
  }

  if (format === 'trakt-json' || format === 'json') {
    ms = Math.max(ms, 800);
  }

  ms += EXPORT.ZIP_MS;
  return ms;
}

export function libraryHasExternalIds(library) {
  const items = countLookupItems(library);
  if (!items) return true;
  const withIds = allLookupItems(library).filter((item) => item.externalIds?.imdbID || item.externalIds?.tmdbID);
  return withIds.length >= items * 0.95;
}

function countLookupItems(library) {
  if (!library) return 0;
  return allLookupItems(library).length;
}

function allLookupItems(library) {
  const movies = [...(library.lists?.watched || []), ...(library.lists?.want || [])];
  const shows = library.lists?.shows || [];
  return [...movies, ...shows];
}

export function createEtaTracker(smoothing = 0.28) {
  let startMs = null;
  let lastMs = null;
  let lastDone = 0;
  let emaRate = null;

  return {
    reset() {
      startMs = null;
      lastMs = null;
      lastDone = 0;
      emaRate = null;
    },
    /**
     * @returns {{ remainingMs: number|null, elapsedMs: number }}
     */
    tick(done, total) {
      const now = Date.now();
      if (startMs == null) {
        startMs = now;
        lastMs = now;
        lastDone = done;
        return { remainingMs: null, elapsedMs: 0 };
      }

      const elapsedMs = now - startMs;
      const deltaDone = done - lastDone;
      const deltaMs = Math.max(1, now - lastMs);

      if (deltaDone > 0) {
        const instant = deltaDone / deltaMs;
        emaRate = emaRate == null ? instant : emaRate * (1 - smoothing) + instant * smoothing;
      }

      lastMs = now;
      lastDone = done;

      if (!emaRate || !total || done >= total) {
        return { remainingMs: done >= total ? 0 : null, elapsedMs };
      }

      const remaining = (total - done) / emaRate;
      return { remainingMs: Math.max(0, Math.round(remaining)), elapsedMs };
    },
  };
}

export function formatDuration(ms, lang) {
  if (ms == null || Number.isNaN(ms)) return '';
  const sec = Math.round(ms / 1000);
  if (sec < 5) {
    return lang === 'ru' ? 'несколько секунд' : 'a few seconds';
  }
  if (sec < 60) {
    return lang === 'ru' ? `~${sec} с` : `~${sec}s`;
  }
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (rest < 8) {
    return lang === 'ru' ? `~${min} мин` : `~${min} min`;
  }
  return lang === 'ru' ? `~${min} мин ${rest} с` : `~${min}m ${rest}s`;
}

export function formatEtaRemaining(ms, lang) {
  if (ms == null) return '';
  if (ms < 1_500) {
    return lang === 'ru' ? 'осталось ~0 с' : '~0s left';
  }
  const label = formatDuration(ms, lang);
  return lang === 'ru' ? `осталось ${label}` : `${label} left`;
}