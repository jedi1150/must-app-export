# Must Export / Экспорт Must

**EN:** Static web app and CLI to export movies and TV shows from a **public** [Must](https://mustapp.com) profile (`mustapp.com/@username`) into Letterboxd, IMDb, Trakt, and JSON.

**RU:** Статический сайт и CLI для выгрузки фильмов и сериалов из **публичного** профиля [Must](https://mustapp.com) (`mustapp.com/@никнейм`) в форматы Letterboxd, IMDb, Trakt и JSON.

Live site (after Pages is enabled): `https://jedi1150.github.io/must-app-export/`

---

## Features / Возможности

| | EN | RU |
|---|----|----|
| Lists | Watched, want-to-watch, TV show progress | Просмотрено, «Посмотрю», прогресс сериалов |
| Formats | Letterboxd CSV, IMDb CSV, Trakt CSV/JSON, raw JSON | Те же форматы |
| IDs | IMDb/TMDB via TMDB API when Must has no external ids | Сопоставление через TMDB |
| UI | Russian (default) and English | Интерфейс RU/EN |
| Offline | `node scripts/export-must.mjs <username>` | Локальный экспорт без браузера |

---

## Must API used / Используемые эндпоинты Must

| Endpoint | Purpose |
|----------|---------|
| `GET /api/users/uri/{username}` | Public profile and product id lists (`watched`, `want`, `shows`) |
| `POST /api/acc/anonymous` | Guest bearer token for product detail requests |
| `POST /api/users/id/{userId}/products?embed=product` | Title metadata, ratings, watch status, show progress (batches of 100 ids) |
| `POST /api/users/id/{userId}/products?embed=review` | Optional review text |

**CORS:** Must returns `Access-Control-Allow-Origin: *` for these routes, so the GitHub Pages app calls Must **directly** without a proxy. TMDB is also called from the browser for IMDb/TMDB resolution. An optional CORS proxy field exists in Advanced settings as a fallback.

---

## Export columns / Колонки экспорта

### Letterboxd (movies)

- **Watched file:** `Title, Year, imdbID, tmdbID, Rating, Rating10, WatchedDate, Review`
- **Watchlist file:** `Title, Year, imdbID, tmdbID`

### IMDb-style CSV (movies)

- **Ratings:** `Const, Your Rating, Date Rated, Title, URL, Title Type, Runtime (mins), Year`
- **Watched:** `Const, Title, Title Type, Year, Your Rating, Watched Date`
- **Watchlist:** `Const, Title, Title Type, Year, URL`

### Trakt CSV

`type, list, imdb, tmdb, title, year, rating, watched_at, status, episodes_watched, episode_count` (movies + shows)

### Trakt-friendly JSON & raw JSON

Full structured dump including `ids.imdb`, `ids.tmdb`, ratings, dates, show episode counts, and raw Must `product` / `user_product_info` objects.

---

## GitHub Pages setup / Настройка GitHub Pages

1. **Public repository** — required for a public site.
2. **Workflows**
   - **CI** (`.github/workflows/ci.yml`) — lint, build check, export generator tests on pull requests and pushes to `main`.
   - **Deploy** (`.github/workflows/deploy-pages.yml`) — on push to `main`, runs `actions/configure-pages` with `enablement: true`, then deploys the repo root as the Pages artifact.
3. **If deploy fails** (Pages not enabled): open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. Re-run the Deploy workflow.

**Repository description (GitHub):** *Export public Must (mustapp.com) watchlists to Letterboxd, IMDb, Trakt, and JSON — static site + CLI.*

---

## Local development / Локальная разработка

```bash
npm ci
npm run lint
npm test
npm run build

# Static UI
npx --yes serve -l 4173 .

# CLI export (profile must be public)
node scripts/export-must.mjs grotesque --format letterboxd --out exports
```

Optional env vars for CLI: `TMDB_BEARER_TOKEN`, `MUST_CORS_PROXY`.

---

## Rate limits / Ограничения

Product requests are batched (100 ids) with pauses. TMDB lookups run in small concurrent batches with backoff on HTTP 429/5xx. Large libraries may take several minutes in the browser; use the CLI for very large profiles.

---

## License

MIT (see repository; add `LICENSE` if you need a formal file).