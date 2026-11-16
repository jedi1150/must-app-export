import { sleep, yearFromDate } from './utils.js';
import { allItemsForIdLookup } from './must-api.js';

const JIKAN_GAP_MS = 420;

export async function resolveMalIds(http, library, onProgress) {
  const items = allItemsForIdLookup(library);
  let processed = 0;

  for (const item of items) {
    item.malAttempted = true;
    try {
      const title = item.product?.title;
      const year = yearFromDate(item.product?.release_date);
      const q = encodeURIComponent(title);
      const data = await http.fetchJson(
        `https://api.jikan.moe/v4/anime?q=${q}&limit=10`,
        {},
        `Jikan ${title}`,
        { retries: 2 },
      );
      const match = pickMalEntry(data?.data, title, year);
      if (match) {
        item.malMatch = {
          mal_id: match.mal_id,
          title: match.title,
          type: match.type,
        };
      }
    } catch {
      item.malMatch = null;
    }
    processed += 1;
    onProgress?.(processed, items.length);
    if (processed < items.length) await sleep(JIKAN_GAP_MS);
  }
  return items;
}

function pickMalEntry(results, title, year) {
  if (!results?.length) return null;
  const exact = results.filter((r) => r.title === title || r.title_english === title);
  let pool = exact.length ? exact : results;
  if (year) {
    const yearHits = pool.filter((r) => String(r.year) === String(year));
    if (yearHits.length) pool = yearHits;
  }
  return pool.reduce((best, cur) => {
    if (!best) return cur;
    return (cur.scored_by || 0) > (best.scored_by || 0) ? cur : best;
  }, null);
}