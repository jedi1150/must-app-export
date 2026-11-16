#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHttpClient } from '../js/http.js';
import {
  fetchAnonymousToken,
  fetchPublicProfile,
  loadUserLibrary,
  allItemsForIdLookup,
} from '../js/must-api.js';
import { resolveExternalIds } from '../js/tmdb.js';
import { buildExportArtifact } from '../js/exporters.js';
import { normalizeUsername } from '../js/utils.js';

function printHelp() {
  console.log(`Usage: node scripts/export-must.mjs <username> [--format <format>] [--out <dir>]

Formats: letterboxd | imdb | trakt-csv | trakt-json | json (default: trakt-json)
Options:
  --diary all|reviewed|none   WatchedDate handling (default: all)
  --no-reviews                Skip review embed requests
  --cors-proxy <url>          Optional CORS proxy prefix
`);
}

function parseArgs(argv) {
  const args = { format: 'trakt-json', diary: 'all', includeReviews: true, out: 'exports' };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--format') args.format = argv[++i];
    else if (a.startsWith('--format=')) args.format = a.slice('--format='.length);
    else if (a === '--out') args.out = argv[++i];
    else if (a.startsWith('--out=')) args.out = a.slice('--out='.length);
    else if (a === '--diary') args.diary = argv[++i];
    else if (a.startsWith('--diary=')) args.diary = a.slice('--diary='.length);
    else if (a === '--no-reviews') args.includeReviews = false;
    else if (a === '--cors-proxy') args.corsProxy = argv[++i];
    else positional.push(a);
  }
  args.username = positional[0];
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.username) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const username = normalizeUsername(args.username);
  const http = createHttpClient({ corsProxy: args.corsProxy || process.env.MUST_CORS_PROXY || '' });

  console.log(`Fetching Must profile @${username}...`);
  const profile = await fetchPublicProfile(http, username);
  const bearer = await fetchAnonymousToken(http);
  const library = await loadUserLibrary(http, profile, bearer, {
    includeReviews: args.includeReviews,
  });

  const lookupItems = allItemsForIdLookup(library);
  if (args.format !== 'json' && lookupItems.length) {
    console.log(`Resolving IMDb/TMDB for ${lookupItems.length} titles…`);
    await resolveExternalIds(http, lookupItems, process.env.TMDB_BEARER_TOKEN, (cur, total) => {
      if (cur % 50 === 0 || cur === total) console.log(`  ${cur}/${total}`);
    });
  }

  const artifact = buildExportArtifact(args.format, library, username, args.diary);
  await fs.mkdir(args.out, { recursive: true });
  const outPath = path.join(args.out, artifact.filename);
  await fs.writeFile(outPath, artifact.content, 'utf8');
  console.log(`Wrote ${outPath}`);

  if (artifact.extraFiles?.length) {
    for (const file of artifact.extraFiles) {
      const extraPath = path.join(args.out, file.name);
      await fs.writeFile(extraPath, file.content, 'utf8');
      console.log(`Wrote ${extraPath}`);
    }
  }
}

main().catch((error) => {
  console.error(`Export failed: ${error.message}`);
  process.exit(1);
});