import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildExportArtifact } from '../js/exporters.js';
import { csvEscape } from '../js/utils.js';
import { sampleLibrary } from './fixtures.js';

describe('csvEscape', () => {
  it('quotes commas and quotes', () => {
    assert.equal(csvEscape('Paris, Texas'), '"Paris, Texas"');
    assert.equal(csvEscape('Say "hi"'), '"Say ""hi"""');
  });
});

describe('buildExportArtifact', () => {
  const library = sampleLibrary();
  const user = 'demo';

  it('produces Letterboxd watched CSV headers and imdb ids', () => {
    const art = buildExportArtifact('letterboxd', library, user, 'all');
    assert.match(art.content, /Title,Year,imdbID,tmdbID,Rating,Rating10,WatchedDate,Review/);
    assert.match(art.content, /tt0137523/);
    assert.match(art.content, /"Paris, Texas"/);
    const watchedFile = art.extraFiles.find((f) => f.name.includes('watched'));
    assert.ok(watchedFile);
    assert.match(watchedFile.content, /2026-01-15/);
  });

  it('produces IMDb ratings CSV columns', () => {
    const art = buildExportArtifact('imdb', library, user, 'all');
    const ratings = art.extraFiles.find((f) => f.name.includes('ratings'));
    assert.match(ratings.content, /^Const,Your Rating,Date Rated,Title,URL,Title Type,Runtime \(mins\),Year/);
    assert.match(ratings.content, /tt0137523,8,/);
  });

  it('produces Trakt CSV with shows and movies', () => {
    const art = buildExportArtifact('trakt-csv', library, user, 'all');
    assert.match(art.content, /^type,list,imdb,tmdb,title,year,rating,watched_at,status,episodes_watched,episode_count/);
    assert.match(art.content, /show,shows,tt11280740,95396,Severance/);
    assert.match(art.content, /movie,watched,tt0137523,550,Fight Club/);
  });

  it('produces MAL XML with matched anime and unmatched report', () => {
    const lib = structuredClone(library);
    lib.lists.shows[0].malAttempted = true;
    lib.lists.shows[0].malMatch = { mal_id: 1535, title: 'Death Note' };
    lib.lists.shows.push({
      ...structuredClone(lib.lists.shows[0]),
      product: { id: 5, type: 'show', title: 'Obscure Anime', release_date: '2020-01-01' },
      malAttempted: true,
      malMatch: null,
    });
    const art = buildExportArtifact('mal-xml', lib, user, 'all');
    assert.match(art.content, /series_animedb_id>1535</);
    assert.match(art.extraFiles[1].content, /Obscure Anime.*no_mal_match/);
  });

  it('produces parseable Trakt JSON and raw JSON', () => {
    for (const format of ['trakt-json', 'json']) {
      const art = buildExportArtifact(format, library, user, 'none');
      const parsed = JSON.parse(art.content);
      assert.equal(parsed.username, user);
      assert.ok(parsed.profile || parsed.items);
    }
  });
});