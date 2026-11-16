export const DEFAULT_TMDB_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJiMWRiNjExNzc2OTdhMjA2MzBiMmMzMmQyMDA5ODY5YyIsIm5iZiI6MTcyOTAyMjAxOS4xODkwMywic3ViIjoiNjRjYTYxMTgwYjc0ZTkwMGFjNjZjMmE5Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.rslpnPCxpGLXcdYfTyNAuL9Qbd9Zrhy0FjSZG-HRwTw';

export const MUST_SITE_HEADERS = {
  accept: '*/*',
  'content-type': 'application/json',
  'x-client-version': 'frontend_site/2.24.2-390.390',
  'x-requested-with': 'XMLHttpRequest',
};

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/(?:www\.)?mustapp\.com\/@?/i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .trim();
}

export function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

export function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function yearFromDate(dateStr) {
  if (!dateStr) return '';
  return String(dateStr).slice(0, 4);
}

export function watchedDateFromItem(item, diaryMode) {
  const modified = item.user_product_info?.modified_at?.slice(0, 10) ?? '';
  if (diaryMode === 'none') return '';
  if (diaryMode === 'reviewed') {
    const hasReview = Boolean(item.reviewText?.trim());
    return hasReview ? modified : '';
  }
  return modified;
}

export function rating10(rate) {
  if (rate == null || rate === '') return '';
  return String(rate);
}

export function ratingLetterboxd5(rate10) {
  if (rate10 == null || rate10 === '') return '';
  const n = Number(rate10);
  if (Number.isNaN(n)) return '';
  return String(Math.round(n / 2 * 2) / 2);
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildProxyUrl(url, proxyBase) {
  const base = (proxyBase || '').trim();
  if (!base) return url;
  if (base.endsWith('=') || base.endsWith('?')) return `${base}${encodeURIComponent(url)}`;
  return `${base.replace(/\/$/, '')}/${url}`;
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}