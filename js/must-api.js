import { MUST_SITE_HEADERS, chunk, sleep } from './utils.js';

const PRODUCT_BATCH = 100;
const BATCH_PAUSE_MS = 350;

export async function fetchAnonymousToken(http) {
  const data = await http.fetchJson(
    'https://mustapp.com/api/acc/anonymous',
    { method: 'POST' },
    'Must anonymous token',
  );
  return data.token;
}

export async function fetchPublicProfile(http, username) {
  try {
    return await http.fetchJson(
      `https://mustapp.com/api/users/uri/${encodeURIComponent(username)}`,
      { method: 'GET' },
      'Must profile',
    );
  } catch (error) {
    if (error.status === 404) {
      const err = new Error('not_found');
      err.code = 'not_found';
      throw err;
    }
    throw error;
  }
}

export async function loadUserLibrary(http, profile, bearer, options, onProgress) {
  if (profile.is_private || !profile.lists) {
    const err = new Error('private');
    err.code = 'private';
    throw err;
  }

  const headers = {
    ...MUST_SITE_HEADERS,
    bearer,
    Authorization: `Bearer ${bearer}`,
  };

  const listNames = ['watched', 'want', 'shows'];
  const result = {
    profile: sanitizeProfile(profile),
    lists: { watched: [], want: [], shows: [] },
    seasons: [],
  };

  let listIndex = 0;
  for (const listName of listNames) {
    const ids = profile.lists[listName] || [];
    const items = await fetchProductsForList(http, profile.id, ids, headers, options, (current, total) => {
      onProgress?.({ phase: 'lists', list: listName, current, total, listIndex, listCount: listNames.length });
    });

    for (const item of items) {
      const enriched = { ...item, listName, reviewText: item.reviewText || '' };
      const type = item.product?.type;
      if (type === 'season') {
        result.seasons.push(enriched);
      } else if (type === 'show') {
        result.lists.shows.push(enriched);
      } else {
        result.lists[listName === 'shows' ? 'want' : listName].push(enriched);
      }
    }
    listIndex += 1;
  }

  await attachFirstUnwatchedEpisodeTitles(http, profile.id, headers, result.lists.shows);
  return result;
}

async function fetchProductsForList(http, userId, ids, headers, options, onProgress) {
  if (!ids.length) return [];
  const batches = chunk(ids, PRODUCT_BATCH);
  const all = [];

  for (let b = 0; b < batches.length; b += 1) {
    const batchIds = batches[b];
    const items = await http.fetchJson(
      `https://mustapp.com/api/users/id/${userId}/products?embed=product`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: batchIds }),
      },
      'Must products',
    );

    if (options.includeReviews) {
      await attachReviews(http, userId, headers, items, batchIds);
    }

    all.push(...items);
    onProgress?.(all.length, ids.length);
    if (b < batches.length - 1) await sleep(BATCH_PAUSE_MS);
  }

  return all;
}

async function attachReviews(http, userId, headers, items, ids) {
  try {
    const reviews = await http.fetchJson(
      `https://mustapp.com/api/users/id/${userId}/products?embed=review`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids }),
      },
      'Must reviews',
      { retries: 2 },
    );
    reviews.forEach((row, idx) => {
      items[idx].reviewText = row.user_product_info?.review?.body ?? '';
    });
  } catch {
    items.forEach((item) => {
      item.reviewText = '';
    });
  }
}

async function attachFirstUnwatchedEpisodeTitles(http, userId, headers, shows) {
  const episodeIds = [
    ...new Set(
      shows
        .map((s) => s.user_product_info?.user_show_info?.first_unwatched_episode)
        .filter(Boolean),
    ),
  ];
  if (!episodeIds.length) return;

  const episodes = new Map();
  for (const batch of chunk(episodeIds, PRODUCT_BATCH)) {
    const rows = await http.fetchJson(
      `https://mustapp.com/api/users/id/${userId}/products?embed=product`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: batch }),
      },
      'Must episode lookup',
    );
    rows.forEach((row) => {
      episodes.set(row.product.id, row.product);
    });
  }

  shows.forEach((show) => {
    const epId = show.user_product_info?.user_show_info?.first_unwatched_episode;
    show.firstUnwatchedEpisode = episodes.get(epId) || null;
  });
}

function sanitizeProfile(profile) {
  return {
    id: profile.id,
    uri: profile.uri,
    name: profile.name,
    is_private: profile.is_private,
    verified: profile.verified,
    user_image: profile.user_image,
    want_count: profile.want_count,
    followers_count: profile.followers_count,
    rates_statistics: profile.rates_statistics,
    watched_by_type: profile.watched_by_type,
    hours_spent: profile.hours_spent,
    bio_message: profile.bio_message,
    links: profile.links,
  };
}

export function allMovies(library) {
  return [...library.lists.watched, ...library.lists.want];
}

export function allItemsForIdLookup(library) {
  return [...allMovies(library), ...library.lists.shows];
}