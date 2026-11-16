export function sampleLibrary() {
  const movie = (overrides) => ({
    listName: 'watched',
    reviewText: '',
    user_product_info: {
      status: 'watched',
      rate: 8,
      modified_at: '2026-01-15T10:00:00.000Z',
    },
    product: {
      id: 1001,
      type: 'movie',
      title: 'Fight Club',
      release_date: '1999-10-15',
      runtime: 8340,
    },
    externalIds: { imdbID: 'tt0137523', tmdbID: '550' },
    ...overrides,
  });

  return {
    profile: { uri: 'demo', name: 'Demo' },
    lists: {
      watched: [
        movie({ listName: 'watched' }),
        movie({
          listName: 'watched',
          product: { id: 2, type: 'movie', title: 'Paris, Texas', release_date: '1984-05-18', runtime: 0 },
          externalIds: { imdbID: 'tt0087961', tmdbID: '655' },
          user_product_info: { status: 'watched', rate: 9, modified_at: '2026-02-01T00:00:00.000Z' },
        }),
      ],
      want: [
        movie({
          listName: 'want',
          user_product_info: { status: 'want', rate: null, modified_at: '2026-03-01T00:00:00.000Z' },
          product: { id: 3, type: 'movie', title: 'Inception', release_date: '2010-07-16', runtime: 0 },
          externalIds: { imdbID: 'tt1375666', tmdbID: '27205' },
        }),
      ],
      shows: [
        {
          listName: 'shows',
          reviewText: '',
          user_product_info: {
            status: 'watching',
            rate: 7,
            modified_at: '2026-04-01T00:00:00.000Z',
            user_show_info: { episodes_watched: 3, first_unwatched_episode: 999 },
          },
          product: {
            id: 4,
            type: 'show',
            title: 'Severance',
            release_date: '2022-02-18',
            items_count: 19,
          },
          externalIds: { imdbID: 'tt11280740', tmdbID: '95396' },
          firstUnwatchedEpisode: { title: 'Episode 4', release_date: '2022-03-11' },
        },
      ],
    },
    seasons: [],
  };
}