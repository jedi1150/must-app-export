import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createEtaTracker,
  estimateExportDurationMs,
  estimateLoadDurationMs,
  formatDuration,
  formatEtaRemaining,
} from '../js/eta.js';

const sampleProfile = {
  lists: {
    watched: Array.from({ length: 250 }, (_, i) => i),
    want: Array.from({ length: 40 }, (_, i) => i),
    shows: Array.from({ length: 30 }, (_, i) => i),
  },
};

describe('estimateLoadDurationMs', () => {
  it('grows with list size and reviews', () => {
    const base = estimateLoadDurationMs(sampleProfile, { includeReviews: false });
    const withReviews = estimateLoadDurationMs(sampleProfile, { includeReviews: true });
    assert.ok(base > 5_000);
    assert.ok(withReviews > base);
  });

  it('handles empty lists', () => {
    const ms = estimateLoadDurationMs({ lists: { watched: [], want: [], shows: [] } });
    assert.ok(ms >= 2_000);
  });
});

describe('estimateExportDurationMs', () => {
  const library = {
    lists: {
      watched: [{ product: { id: 1 } }, { product: { id: 2 } }],
      want: [],
      shows: [{ product: { id: 3 } }],
    },
  };

  it('json is faster than letterboxd with TMDB', () => {
    const json = estimateExportDurationMs(library, 'json');
    const letterboxd = estimateExportDurationMs(library, 'letterboxd');
    assert.ok(json < letterboxd);
  });

  it('mal-xml adds Jikan time', () => {
    const mal = estimateExportDurationMs(library, 'mal-xml');
    const json = estimateExportDurationMs(library, 'json');
    assert.ok(mal > json + 1_000);
  });
});

describe('createEtaTracker', () => {
  it('smooths rate and estimates remaining', () => {
    const tracker = createEtaTracker(0.5);
    tracker.tick(0, 100);
    tracker.tick(10, 100);
    const { remainingMs } = tracker.tick(20, 100);
    assert.ok(remainingMs != null);
    assert.ok(remainingMs > 0);
  });
});

describe('formatDuration', () => {
  it('formats seconds and minutes', () => {
    assert.match(formatDuration(28_000, 'en'), /^~\d+s$/);
    assert.match(formatDuration(125_000, 'ru'), /мин/);
  });

  it('formatEtaRemaining prefixes language', () => {
    assert.match(formatEtaRemaining(30_000, 'en'), /left$/);
    assert.match(formatEtaRemaining(30_000, 'ru'), /^осталось/);
  });
});