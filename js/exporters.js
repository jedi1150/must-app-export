import {
  csvEscape,
  rating10,
  ratingLetterboxd5,
  watchedDateFromItem,
  yearFromDate,
} from './utils.js';
import { allItemsForIdLookup, allMovies } from './must-api.js';

const PREVIEW_LIMIT = 40;

export function buildExportArtifact(format, library, username, diaryMode) {
  switch (format) {
    case 'letterboxd':
      return letterboxdZipLike(library, username, diaryMode);
    case 'imdb':
      return imdbExports(library, username, diaryMode);
    case 'trakt-csv':
      return traktCsv(library, username, diaryMode);
    case 'trakt-json':
      return traktJson(library, username, diaryMode);
    case 'json':
      return rawJson(library, username);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

function letterboxdZipLike(library, username, diaryMode) {
  const watchedMovies = library.lists.watched.filter((i) => i.product?.type !== 'show');
  const wantMovies = library.lists.want.filter((i) => i.product?.type !== 'show');

  const watchedLines = watchedMovies.map((item) => toLetterboxdRow(item, diaryMode));
  const wantLines = wantMovies.map((item) => toLetterboxdWantRow(item));

  const watchedCsv = [
    'Title,Year,imdbID,tmdbID,Rating,Rating10,WatchedDate,Review',
    ...watchedLines,
  ].join('\n');
  const wantCsv = ['Title,Year,imdbID,tmdbID', ...wantLines].join('\n');

  const content = [
    `# ${username} — Letterboxd-compatible CSV`,
    '# Watched list:',
    watchedCsv,
    '',
    '# Watchlist (want):',
    wantCsv,
  ].join('\n');

  return {
    filename: `${username}-letterboxd-export.txt`,
    mime: 'text/plain;charset=utf-8',
    content,
    previewRows: watchedMovies.slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
    extraFiles: [
      { name: `${username}-letterboxd-watched.csv`, content: `${watchedCsv}\n` },
      { name: `${username}-letterboxd-watchlist.csv`, content: `${wantCsv}\n` },
    ],
  };
}

function toLetterboxdRow(item, diaryMode, includeRating = true) {
  const p = item.product;
  const rate = rating10(item.user_product_info?.rate);
  const cols = [
    p?.title ?? '',
    yearFromDate(p?.release_date),
    item.externalIds?.imdbID ?? '',
    item.externalIds?.tmdbID ?? '',
  ];
  if (includeRating) {
    cols.push(ratingLetterboxd5(rate), rate, watchedDateFromItem(item, diaryMode), item.reviewText || '');
  }
  return cols.map(csvEscape).join(',');
}

function toLetterboxdWantRow(item) {
  const p = item.product;
  return [p?.title ?? '', yearFromDate(p?.release_date), item.externalIds?.imdbID ?? '', item.externalIds?.tmdbID ?? '']
    .map(csvEscape)
    .join(',');
}

function imdbExports(library, username, diaryMode) {
  const watched = library.lists.watched.filter((i) => i.product?.type !== 'show');
  const want = library.lists.want.filter((i) => i.product?.type !== 'show');

  const ratedHeader =
    'Const,Your Rating,Date Rated,Title,URL,Title Type,Runtime (mins),Year';
  const watchlistHeader = 'Const,Title,Title Type,Year,URL';

  const ratedRows = watched
    .filter((i) => i.user_product_info?.rate != null)
    .map((item) => imdbRatedRow(item, diaryMode));

  const historyRows = watched.map((item) => imdbHistoryRow(item));

  const watchlistRows = want.map((item) => imdbWatchlistRow(item));

  const ratingsCsv = [ratedHeader, ...ratedRows].join('\n');
  const historyCsv = ['Const,Title,Title Type,Year,Your Rating,Watched Date', ...historyRows].join('\n');
  const watchlistCsv = [watchlistHeader, ...watchlistRows].join('\n');

  const content = [ratingsCsv, '', '# --- history ---', historyCsv, '', '# --- watchlist ---', watchlistCsv].join('\n');

  return {
    filename: `${username}-imdb-export.txt`,
    mime: 'text/plain;charset=utf-8',
    content,
    previewRows: watched.slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
    extraFiles: [
      { name: `${username}-imdb-ratings.csv`, content: `${ratingsCsv}\n` },
      { name: `${username}-imdb-watched.csv`, content: `${historyCsv}\n` },
      { name: `${username}-imdb-watchlist.csv`, content: `${watchlistCsv}\n` },
    ],
  };
}

function imdbConst(item) {
  return item.externalIds?.imdbID || '';
}

function imdbRatedRow(item, diaryMode) {
  const p = item.product;
  const imdb = imdbConst(item);
  const url = imdb ? `https://www.imdb.com/title/${imdb}/` : '';
  const runtimeMin = p?.runtime ? Math.round(Number(p.runtime) / 60) : '';
  const dateRated = watchedDateFromItem(item, diaryMode) || item.user_product_info?.modified_at?.slice(0, 10) || '';
  return [
    imdb,
    item.user_product_info?.rate ?? '',
    dateRated,
    p?.title ?? '',
    url,
    'Movie',
    runtimeMin,
    yearFromDate(p?.release_date),
  ]
    .map(csvEscape)
    .join(',');
}

function imdbHistoryRow(item) {
  const p = item.product;
  return [
    imdbConst(item),
    p?.title ?? '',
    'Movie',
    yearFromDate(p?.release_date),
    item.user_product_info?.rate ?? '',
    item.user_product_info?.modified_at?.slice(0, 10) ?? '',
  ]
    .map(csvEscape)
    .join(',');
}

function imdbWatchlistRow(item) {
  const p = item.product;
  const imdb = imdbConst(item);
  const url = imdb ? `https://www.imdb.com/title/${imdb}/` : '';
  return [imdb, p?.title ?? '', 'Movie', yearFromDate(p?.release_date), url].map(csvEscape).join(',');
}

function traktCsv(library, username, diaryMode) {
  const lines = ['type,list,imdb,tmdb,title,year,rating,watched_at,status,episodes_watched,episode_count'];

  const emit = (item, type) => {
    const p = item.product;
    lines.push(
      [
        type,
        item.listName,
        item.externalIds?.imdbID ?? '',
        item.externalIds?.tmdbID ?? '',
        p?.title ?? '',
        yearFromDate(p?.release_date),
        item.user_product_info?.rate ?? '',
        isoDate(item, diaryMode),
        item.user_product_info?.status ?? '',
        item.user_product_info?.user_show_info?.episodes_watched ?? '',
        type === 'show' ? p?.items_count ?? '' : '',
      ]
        .map(csvEscape)
        .join(','),
    );
  };

  for (const item of library.lists.watched) {
    if (item.product?.type === 'show') emit(item, 'show');
    else emit(item, 'movie');
  }
  for (const item of library.lists.want) emit(item, 'movie');
  for (const item of library.lists.shows) emit(item, 'show');

  const csv = `${lines.join('\n')}\n`;
  return {
    filename: `${username}-trakt-import.csv`,
    mime: 'text/csv;charset=utf-8',
    content: csv,
    previewRows: allItemsForIdLookup(library).slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
  };
}

function traktJson(library, username, diaryMode) {
  const payload = {
    exported_at: new Date().toISOString(),
    source: 'mustapp',
    username,
    profile: library.profile,
    movies: {
      watched: library.lists.watched
        .filter((i) => i.product?.type !== 'show')
        .map((item) => traktItem(item, diaryMode)),
      want: library.lists.want.map((item) => traktItem(item, 'none')),
    },
    shows: library.lists.shows.map((item) => ({
      ...traktItem(item, diaryMode),
      episodes_watched: item.user_product_info?.user_show_info?.episodes_watched ?? null,
      first_unwatched_episode: item.firstUnwatchedEpisode?.title ?? null,
      episode_count: item.product?.items_count ?? null,
    })),
    seasons: library.seasons.map((item) => ({
      list: item.listName,
      title: item.product?.title,
      ids: item.externalIds,
      status: item.user_product_info?.status,
      rating: item.user_product_info?.rate,
    })),
  };

  const json = `${JSON.stringify(payload, null, 2)}\n`;
  return {
    filename: `${username}-trakt-friendly.json`,
    mime: 'application/json;charset=utf-8',
    content: json,
    previewRows: allItemsForIdLookup(library).slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
  };
}

function traktItem(item, diaryMode) {
  const p = item.product;
  return {
    list: item.listName,
    title: p?.title,
    year: yearFromDate(p?.release_date),
    ids: { imdb: item.externalIds?.imdbID || null, tmdb: item.externalIds?.tmdbID || null },
    rating: item.user_product_info?.rate ?? null,
    watched_at: isoDate(item, diaryMode) || null,
    status: item.user_product_info?.status ?? null,
    review: item.reviewText || null,
    must_product_id: p?.id ?? null,
  };
}

function rawJson(library, username) {
  const payload = {
    exported_at: new Date().toISOString(),
    source: 'mustapp',
    username,
    profile: library.profile,
    items: {
      watched: library.lists.watched,
      want: library.lists.want,
      shows: library.lists.shows,
      seasons: library.seasons,
    },
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  return {
    filename: `${username}-must-raw.json`,
    mime: 'application/json;charset=utf-8',
    content: json,
    previewRows: allItemsForIdLookup(library).slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
  };
}

function isoDate(item, diaryMode) {
  const d = watchedDateFromItem(item, diaryMode) || item.user_product_info?.modified_at?.slice(0, 10);
  return d ? `${d}T12:00:00.000Z` : '';
}

function previewRow(item) {
  const p = item.product;
  return {
    title: p?.title,
    year: yearFromDate(p?.release_date),
    list: item.listName,
    type: p?.type || 'movie',
    rating: item.user_product_info?.rate,
    imdb: item.externalIds?.imdbID,
    status: item.user_product_info?.status,
  };
}

export function computeStats(library) {
  const moviesWatched = library.lists.watched.length;
  const moviesWant = library.lists.want.length;
  const shows = library.lists.shows.length;
  const rated = allMovies(library).filter((i) => i.user_product_info?.rate != null).length + library.lists.shows.filter((i) => i.user_product_info?.rate != null).length;
  return { moviesWatched, moviesWant, shows, rated };
}