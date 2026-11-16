import { DEFAULT_TMDB_TOKEN, mapWithConcurrency, sleep, yearFromDate } from './utils.js';

const LOOKUP_BATCH = 20;
const TMDB_CONCURRENCY = 4;
const BETWEEN_BATCHES_MS = 250;

export async function resolveExternalIds(http, items, tmdbToken, onProgress) {
  const token = (tmdbToken || '').trim() || DEFAULT_TMDB_TOKEN;
  const headers = {
    accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const cache = new Map();
  const needsLookup = items.filter((item) => {
    const key = item.product?.id;
    return key != null;
  });

  let processed = 0;
  for (let start = 0; start < needsLookup.length; start += LOOKUP_BATCH) {
    const slice = needsLookup.slice(start, start + LOOKUP_BATCH);
    await mapWithConcurrency(slice, TMDB_CONCURRENCY, async (item) => {
      const key = item.product.id;
      if (cache.has(key)) {
        item.externalIds = cache.get(key);
        return;
      }
      const ids = await lookupIds(http, item, headers);
      cache.set(key, ids);
      item.externalIds = ids;
    });

    processed += slice.length;
    onProgress?.(processed, needsLookup.length);
    if (start + LOOKUP_BATCH < needsLookup.length) await sleep(BETWEEN_BATCHES_MS);
  }

  return items;
}

async function lookupIds(http, item, headers) {
  const product = item.product;
  const type = product.type === 'show' ? 'show' : 'movie';
  const year = yearFromDate(product.release_date);
  const title = product.title;

  const searchPath =
    type === 'show'
      ? `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(title)}&first_air_date_year=${year}&include_adult=true&page=1`
      : `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&year=${year}&include_adult=true&page=1`;

  let search = await http.fetchJson(searchPath, { headers }, `TMDB search ${title}`, { retries: 3 });
  const resultsKey = type === 'show' ? 'results' : 'results';
  let results = search?.[resultsKey] || [];

  if (!results.length) {
    const fallbackPath =
      type === 'show'
        ? `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(title)}&include_adult=true&page=1`
        : `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&include_adult=true&page=1`;
    search = await http.fetchJson(fallbackPath, { headers }, `TMDB search ${title}`, { retries: 2 });
    results = search?.results || [];
  }

  const pick = pickBestResult(results, product, type);
  if (!pick) return { tmdbID: '', imdbID: '' };

  const externalPath =
    type === 'show'
      ? `https://api.themoviedb.org/3/tv/${pick.id}/external_ids`
      : `https://api.themoviedb.org/3/movie/${pick.id}/external_ids`;

  const external = await http.fetchJson(externalPath, { headers }, `TMDB external_ids ${title}`, { retries: 3 });
  return {
    tmdbID: String(pick.id),
    imdbID: external.imdb_id || '',
  };
}

function pickBestResult(results, product, type) {
  if (!results.length) return null;
  const titleField = type === 'show' ? 'name' : 'title';
  const dateField = type === 'show' ? 'first_air_date' : 'release_date';

  let filtered = results.filter((r) => r[titleField] === product.title);
  if (!filtered.length) filtered = results;
  filtered = filtered.filter((r) => r[dateField] === product.release_date);
  if (!filtered.length) filtered = results;

  return filtered.reduce((best, cur) => {
    if (!best) return cur;
    return (cur.popularity || 0) > (best.popularity || 0) ? cur : best;
  }, null);
}