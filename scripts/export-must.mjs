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
import { resolveMalIds } from '../js/mal-resolve.js';
import { buildServiceArtifact, needsIdLookup, resolveServiceFormat } from '../js/services.js';
import { normalizeUsername } from '../js/utils.js';

function printHelp() {
  console.log(`Usage: node scripts/export-must.mjs <username> [--service <id>] [--format <format>] [--out <dir>]

Services: letterboxd, trakt, simkl, myanimelist, anilist, moviebase, … (see js/service-catalog.js)
Options:
  --service <id>              Target service (default: trakt)
  --format <id>               Raw format override (skips service mapping)
  --diary all|reviewed|none
  --no-reviews
  --cors-proxy <url>
`);
}

function parseArgs(argv) {
  const args = { service: 'trakt', diary: 'all', includeReviews: true, out: 'exports' };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--service') args.service = argv[++i];
    else if (a.startsWith('--service=')) args.service = a.slice('--service='.length);
    else if (a === '--format') args.format = argv[++i];
    else if (a.startsWith('--format=')) args.format = a.slice('--format='.length);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--diary') args.diary = argv[++i];
    else if (a === '--no-reviews') args.includeReviews = false;
    else if (a === '--cors-proxy') args.corsProxy = argv[++i];
    else positional.push(a);
  }
  args.username = positional[0];
  return args;
}

async function writeArtifact(outDir, artifact) {
  await fs.mkdir(outDir, { recursive: true });
  if (artifact.blob) {
    const buf = Buffer.from(await artifact.blob.arrayBuffer());
    await fs.writeFile(path.join(outDir, artifact.filename), buf);
    console.log(`Wrote ${path.join(outDir, artifact.filename)}`);
    return;
  }
  await fs.writeFile(path.join(outDir, artifact.filename), artifact.content, 'utf8');
  console.log(`Wrote ${path.join(outDir, artifact.filename)}`);
  if (artifact.extraFiles?.length) {
    for (const file of artifact.extraFiles) {
      if (file.name === artifact.filename) continue;
      const p = path.join(outDir, file.name);
      await fs.writeFile(p, file.content, 'utf8');
      console.log(`Wrote ${p}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.username) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const username = normalizeUsername(args.username);
  const http = createHttpClient({ corsProxy: args.corsProxy || process.env.MUST_CORS_PROXY || '' });
  const target = args.format
    ? { format: args.format, service: null }
    : resolveServiceFormat(args.service, false, null);

  console.log(`Fetching Must profile @${username}...`);
  const profile = await fetchPublicProfile(http, username);
  const bearer = await fetchAnonymousToken(http);
  const library = await loadUserLibrary(http, profile, bearer, { includeReviews: args.includeReviews });

  if (needsIdLookup(target.format)) {
    await resolveExternalIds(http, allItemsForIdLookup(library), process.env.TMDB_BEARER_TOKEN);
  }
  if (target.format === 'mal-xml') {
    await resolveMalIds(http, library);
  }

  const artifact = await buildServiceArtifact(target, library, username, args.diary);
  await writeArtifact(args.out, artifact);
}

main().catch((error) => {
  console.error(`Export failed: ${error.message}`);
  process.exit(1);
});