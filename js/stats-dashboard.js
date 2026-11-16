import { yearFromDate } from './utils.js';
import { allMovies } from './must-api.js';

export function buildDashboardStats(library, profileRaw = {}) {
  const moviesWatched = library.lists.watched.filter((i) => i.product?.type !== 'show').length;
  const showsTracked = library.lists.shows.length;
  const moviesWant = library.lists.want.filter((i) => i.product?.type !== 'show').length;
  const episodesWatched = library.lists.shows.reduce(
    (sum, s) => sum + (s.user_product_info?.user_show_info?.episodes_watched || 0),
    0,
  );

  const ratedItems = [...allMovies(library), ...library.lists.shows].filter(
    (i) => i.user_product_info?.rate != null,
  );
  const ratings = ratedItems.map((i) => Number(i.user_product_info.rate)).filter((n) => !Number.isNaN(n));
  const avgRating = ratings.length
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : profileRaw.rates_statistics?.average_rate ?? null;

  const distribution = profileRaw.rates_statistics?.rates_distribution || buildRatingDistribution(ratings);
  const topYears = buildTopYears(library.lists.watched.filter((i) => i.product?.type !== 'show'));

  return {
    moviesWatched,
    showsTracked,
    moviesWant,
    episodesWatched,
    avgRating,
    ratedCount: ratings.length,
    distribution,
    topYears,
    hoursSpent: profileRaw.hours_spent,
    watchedByType: profileRaw.watched_by_type,
  };
}

function buildRatingDistribution(ratings) {
  const buckets = {};
  ratings.forEach((r) => {
    const key = Math.round(r);
    buckets[key] = (buckets[key] || 0) + 1;
  });
  return Object.entries(buckets)
    .map(([rate, count]) => ({ rate: Number(rate), count }))
    .sort((a, b) => a.rate - b.rate);
}

function buildTopYears(watchedMovies, limit = 8) {
  const counts = new Map();
  watchedMovies.forEach((item) => {
    const y = yearFromDate(item.product?.release_date);
    if (!y) return;
    counts.set(y, (counts.get(y) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([year, count]) => ({ year, count }));
}