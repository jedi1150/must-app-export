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
    case 'simkl':
      return simklCsv(library, username, diaryMode);
    case 'tvtime':
      return tvtimeCsv(library, username, diaryMode);
    case 'plex':
      return plexExports(library, username, diaryMode);
    case 'kinorium':
      return kinoriumCsv(library, username, diaryMode);
    case 'serializd':
      return serializdShowsList(library, username);
    case 'sheets':
      return genericSheetsCsv(library, username, diaryMode);
    case 'markdown':
      return obsidianMarkdown(library, username, diaryMode);
    case 'moviebase':
      return moviebaseBundle(library, username, diaryMode);
    case 'mal-xml':
      return malXmlExport(library, username, diaryMode);
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

function plexExports(library, username, _diaryMode) {
  const build = (items, kind) => {
    const lines = ['Title,Year,imdbID'];
    for (const item of items) {
      const p = item.product;
      lines.push([p?.title ?? '', yearFromDate(p?.release_date), item.externalIds?.imdbID ?? ''].map(csvEscape).join(','));
    }
    return { kind, csv: `${lines.join('\n')}\n` };
  };

  const moviesWatched = library.lists.watched.filter((i) => i.product?.type !== 'show');
  const moviesWant = library.lists.want.filter((i) => i.product?.type !== 'show');
  const shows = library.lists.shows;
  const showRows = shows.map((item) => {
    const p = item.product;
    return [p?.title ?? '', yearFromDate(p?.release_date), item.externalIds?.imdbID ?? ''].map(csvEscape).join(',');
  });

  const watchedCsv = build(moviesWatched, 'watched').csv;
  const wantCsv = build(moviesWant, 'want').csv;
  const showsCsv = ['Title,Year,imdbID', ...showRows].join('\n') + '\n';

  return {
    filename: `${username}-plex-lists.zip`,
    mime: 'application/zip',
    content: '',
    previewRows: [...moviesWatched, ...shows].slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
    extraFiles: [
      { name: `${username}-plex-watched-movies.csv`, content: watchedCsv },
      { name: `${username}-plex-watchlist-movies.csv`, content: wantCsv },
      { name: `${username}-plex-shows.csv`, content: showsCsv },
    ],
  };
}

function kinoriumCsv(library, username, diaryMode) {
  const lines = ['date,status,title,year,imdb_id,tmdb_id,type'];
  const emit = (item, type) => {
    const p = item.product;
    const rate = item.user_product_info?.rate;
    const status = rate != null && rate !== '' ? rate : 'watched';
    const date = watchedDateFromItem(item, diaryMode) || item.user_product_info?.modified_at?.slice(0, 10) || '';
    lines.push(
      [date, status, p?.title ?? '', yearFromDate(p?.release_date), item.externalIds?.imdbID ?? '', item.externalIds?.tmdbID ?? '', type]
        .map(csvEscape)
        .join(','),
    );
  };
  for (const item of library.lists.watched) {
    emit(item, item.product?.type === 'show' ? 'show' : 'movie');
  }
  for (const item of library.lists.want) emit(item, 'movie');
  for (const item of library.lists.shows) emit(item, 'show');

  const csv = `${lines.join('\n')}\n`;
  return {
    filename: `${username}-kinorium-import.csv`,
    mime: 'text/csv;charset=utf-8',
    content: csv,
    previewRows: allItemsForIdLookup(library).slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
  };
}

function serializdShowsList(library, username) {
  const titles = new Set();
  for (const item of library.lists.shows) {
    if (item.product?.title) titles.add(item.product.title);
  }
  for (const item of library.lists.watched) {
    if (item.product?.type === 'show' && item.product?.title) titles.add(item.product.title);
  }
  const text = `${[...titles].sort((a, b) => a.localeCompare(b)).join('\n')}\n`;
  return {
    filename: `${username}-serializd-shows.txt`,
    mime: 'text/plain;charset=utf-8',
    content: text,
    previewRows: library.lists.shows.slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
  };
}

function genericSheetsCsv(library, username, diaryMode) {
  const lines = [
    'list,type,title,year,imdb_id,tmdb_id,rating,status,watched_date,episodes_watched,episode_count,review',
  ];
  const emit = (item, type) => {
    const p = item.product;
    lines.push(
      [
        item.listName,
        type,
        p?.title ?? '',
        yearFromDate(p?.release_date),
        item.externalIds?.imdbID ?? '',
        item.externalIds?.tmdbID ?? '',
        item.user_product_info?.rate ?? '',
        item.user_product_info?.status ?? '',
        watchedDateFromItem(item, diaryMode),
        item.user_product_info?.user_show_info?.episodes_watched ?? '',
        type === 'show' ? p?.items_count ?? '' : '',
        item.reviewText || '',
      ]
        .map(csvEscape)
        .join(','),
    );
  };
  for (const item of library.lists.watched) emit(item, item.product?.type === 'show' ? 'show' : 'movie');
  for (const item of library.lists.want) emit(item, 'movie');
  for (const item of library.lists.shows) emit(item, 'show');

  const csv = `${lines.join('\n')}\n`;
  return {
    filename: `${username}-must-universal.csv`,
    mime: 'text/csv;charset=utf-8',
    content: csv,
    previewRows: allItemsForIdLookup(library).slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
  };
}

function obsidianMarkdown(library, username, diaryMode) {
  const sections = [`# Must export @${username}`, `Exported: ${new Date().toISOString()}`, ''];
  const appendSection = (title, items) => {
    sections.push(`## ${title}`);
    for (const item of items) {
      const p = item.product;
      const type = p?.type === 'show' ? 'show' : 'movie';
      const rate = item.user_product_info?.rate;
      const date = watchedDateFromItem(item, diaryMode);
      const imdb = item.externalIds?.imdbID;
      const tags = [type, item.listName, rate != null ? `rating/${rate}` : null].filter(Boolean).join(' ');
      const link = imdb ? `https://www.imdb.com/title/${imdb}/` : '';
      const meta = [yearFromDate(p?.release_date), date, link].filter(Boolean).join(' · ');
      sections.push(`- [ ] **${p?.title ?? 'Untitled'}** (${meta}) \`${tags}\``);
    }
    sections.push('');
  };
  appendSection('Watched', library.lists.watched);
  appendSection('Want', library.lists.want);
  appendSection('Shows', library.lists.shows);

  const md = `${sections.join('\n')}\n`;
  return {
    filename: `${username}-must-obsidian.md`,
    mime: 'text/markdown;charset=utf-8',
    content: md,
    previewRows: allItemsForIdLookup(library).slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
  };
}

function moviebaseBundle(library, username, diaryMode) {
  const trakt = traktCsv(library, username, diaryMode);
  const simkl = simklCsv(library, username, diaryMode);
  const letterboxd = letterboxdZipLike(library, username, diaryMode);
  return {
    filename: `${username}-moviebase-via-trakt.zip`,
    mime: 'application/zip',
    content: '',
    previewRows: trakt.previewRows,
    extraFiles: [
      { name: trakt.filename, content: trakt.content },
      { name: simkl.filename, content: simkl.content },
      ...(letterboxd.extraFiles || []),
      { name: 'README-moviebase.txt', content: moviebaseReadme(username) },
    ],
  };
}

function moviebaseReadme(username) {
  return `Moviebase import guide for Must export (@${username})

Recommended route:
1) Import ${username}-trakt-import.csv into Trakt (https://github.com/xbgmsharp/trakt) OR
2) In Moviebase app: Settings → Import → choose Trakt / Simkl / Letterboxd export.

Moviebase also supports live Trakt sync (Settings → Trakt): https://moviebase.app/resources/how-to-sync-trakt
`;
}

const SIMKL_HEADER =
  'Type,TMDB_ID,IMDB_ID,Title,Year,LastEpWatched,Watchlist,WatchedDate,Rating,Memo';

function simklWatchlist(status, listName) {
  if (listName === 'want') return 'plan to watch';
  if (status === 'watching') return 'watching';
  if (status === 'watched') return 'completed';
  return 'completed';
}

function simklDate(item, diaryMode) {
  const d = watchedDateFromItem(item, diaryMode) || item.user_product_info?.modified_at?.slice(0, 10);
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}

function simklCsv(library, username, diaryMode) {
  const lines = [SIMKL_HEADER];
  const emit = (item, type) => {
    const p = item.product;
    const isShow = type === 'tv';
    const ep = item.user_product_info?.user_show_info?.episodes_watched;
    const lastEp = isShow && ep ? `S01E${String(ep).padStart(2, '0')}` : '';
    lines.push(
      [
        type,
        item.externalIds?.tmdbID ?? '',
        item.externalIds?.imdbID ?? '',
        p?.title ?? '',
        yearFromDate(p?.release_date),
        lastEp,
        simklWatchlist(item.user_product_info?.status, item.listName),
        simklDate(item, diaryMode),
        item.user_product_info?.rate ?? '',
        item.reviewText || '',
      ]
        .map(csvEscape)
        .join(','),
    );
  };

  for (const item of library.lists.watched) {
    if (item.product?.type === 'show') emit(item, 'tv');
    else emit(item, 'movie');
  }
  for (const item of library.lists.want) emit(item, 'movie');
  for (const item of library.lists.shows) emit(item, 'tv');

  const csv = `${lines.join('\n')}\n`;
  return {
    filename: `${username}-simkl-import.csv`,
    mime: 'text/csv;charset=utf-8',
    content: csv,
    previewRows: allItemsForIdLookup(library).slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
  };
}

function tvtimeCsv(library, username, diaryMode) {
  const lines = [
    'content_type,title,year,imdb_id,tmdb_id,list,status,episodes_watched,episode_count,rating,watched_date',
  ];

  const emit = (item, type) => {
    const p = item.product;
    lines.push(
      [
        type,
        p?.title ?? '',
        yearFromDate(p?.release_date),
        item.externalIds?.imdbID ?? '',
        item.externalIds?.tmdbID ?? '',
        item.listName,
        item.user_product_info?.status ?? '',
        item.user_product_info?.user_show_info?.episodes_watched ?? '',
        type === 'show' ? p?.items_count ?? '' : '',
        item.user_product_info?.rate ?? '',
        watchedDateFromItem(item, diaryMode),
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
    filename: `${username}-tvtime-archive.csv`,
    mime: 'text/csv;charset=utf-8',
    content: csv,
    previewRows: allItemsForIdLookup(library).slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
  };
}

function malXmlExport(library, username, diaryMode) {
  const matched = [];
  const unmatched = [];
  for (const item of allItemsForIdLookup(library)) {
    if (item.malMatch?.mal_id) matched.push(item);
    else if (item.malAttempted) unmatched.push(item);
  }

  const animeBlocks = matched.map((item) => malAnimeBlock(item, diaryMode)).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<myanimelist>\n${animeBlocks}\n</myanimelist>\n`;
  const unmatchedCsv = [
    'title,year,list,type,reason',
    ...unmatched.map((u) =>
      [
        u.product?.title ?? '',
        yearFromDate(u.product?.release_date),
        u.listName,
        u.product?.type ?? 'movie',
        'no_mal_match',
      ]
        .map(csvEscape)
        .join(','),
    ),
  ].join('\n');

  return {
    filename: `${username}-mal-anime.xml`,
    mime: 'application/xml;charset=utf-8',
    content: xml,
    previewRows: matched.slice(0, PREVIEW_LIMIT).map((item) => previewRow(item)),
    meta: { matched: matched.length, unmatched: unmatched.length },
    extraFiles: [
      { name: `${username}-mal-anime.xml`, content: xml },
      { name: `${username}-mal-unmatched.csv`, content: `${unmatchedCsv}\n` },
    ],
  };
}

function malAnimeBlock(item, diaryMode) {
  const malId = item.malMatch.mal_id;
  const title = escapeXmlCdataText(item.malMatch.title || item.product?.title || '');
  const status = malStatus(item);
  const score = item.user_product_info?.rate ?? 0;
  const ep = item.user_product_info?.user_show_info?.episodes_watched ?? 0;
  const start = watchedDateFromItem(item, diaryMode) || '0000-00-00';
  const finish = item.listName === 'watched' ? start : '0000-00-00';
  return `  <anime>
    <series_animedb_id>${malId}</series_animedb_id>
    <series_title><![CDATA[${title}]]></series_title>
    <my_watched_episodes>${ep}</my_watched_episodes>
    <my_start_date>${start}</my_start_date>
    <my_finish_date>${finish}</my_finish_date>
    <my_score>${score}</my_score>
    <my_status>${status}</my_status>
    <my_times_watched>1</my_times_watched>
    <update_on_import>1</update_on_import>
  </anime>`;
}

function malStatus(item) {
  if (item.listName === 'want') return 'Plan to Watch';
  if (item.user_product_info?.status === 'watching') return 'Watching';
  return 'Completed';
}

function escapeXmlCdataText(value) {
  return String(value).replace(/]]>/g, ']]]]><![CDATA[>');
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