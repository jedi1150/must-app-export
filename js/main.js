import { applyI18n, t } from './i18n.js';
import { createHttpClient } from './http.js';
import {
  fetchAnonymousToken,
  fetchPublicProfile,
  loadUserLibrary,
  allItemsForIdLookup,
} from './must-api.js';
import { resolveExternalIds } from './tmdb.js';
import { buildExportArtifact, computeStats } from './exporters.js';
import { downloadBlob, normalizeUsername } from './utils.js';

let currentLang = 'ru';
let exportResult = null;

const els = {
  form: document.getElementById('export-form'),
  username: document.getElementById('username'),
  submitBtn: document.getElementById('submit-btn'),
  downloadBtn: document.getElementById('download-btn'),
  progress: document.getElementById('progress'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  alert: document.getElementById('alert'),
  summary: document.getElementById('summary'),
  profileCard: document.getElementById('profile-card'),
  statsGrid: document.getElementById('stats-grid'),
  tableWrap: document.getElementById('preview-table-wrap'),
  diaryMode: document.getElementById('diary-mode'),
  includeReviews: document.getElementById('include-reviews'),
  tmdbToken: document.getElementById('tmdb-token'),
  corsProxy: document.getElementById('cors-proxy'),
};

document.querySelectorAll('.lang-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentLang = btn.dataset.lang;
    document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b === btn));
    applyI18n(currentLang);
  });
});

applyI18n(currentLang);

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await runExport();
});

els.downloadBtn.addEventListener('click', () => {
  if (!exportResult) return;
  const blob = new Blob([exportResult.content], { type: exportResult.mime });
  downloadBlob(exportResult.filename, blob);
});

async function runExport() {
  resetUi();
  const username = normalizeUsername(els.username.value);
  if (!username) {
    showAlert('error', t(currentLang, 'errEmptyUser'));
    return;
  }

  const format = new FormData(els.form).get('format');
  const diaryMode = els.diaryMode.value;
  const includeReviews = els.includeReviews.checked;
  const tmdbToken = els.tmdbToken.value;
  const corsProxy = els.corsProxy.value;

  setBusy(true);
  setProgress(2, t(currentLang, 'progressProfile'));

  try {
    const http = createHttpClient({ corsProxy });

    const profile = await fetchPublicProfile(http, username);
    setProgress(8, t(currentLang, 'progressProfile'));

    const bearer = await fetchAnonymousToken(http);

    const library = await loadUserLibrary(
      http,
      profile,
      bearer,
      { includeReviews },
      ({ phase, list, current, total, listIndex, listCount }) => {
        if (phase === 'lists') {
          const pct = 10 + Math.round(((listIndex + current / Math.max(total, 1)) / listCount) * 45);
          setProgress(pct, t(currentLang, 'progressList', { list, current, total }));
        }
      },
    );

    const lookupItems = allItemsForIdLookup(library);
    const skipLookup = format === 'json';

    if (!skipLookup && lookupItems.length) {
      await resolveExternalIds(http, lookupItems, tmdbToken, (current, total) => {
        const pct = 55 + Math.round((current / total) * 40);
        setProgress(pct, t(currentLang, 'progressIds', { current, total }));
      });
    }

    exportResult = buildExportArtifact(format, library, username, diaryMode);
    renderSummary(username, library, exportResult);
    setProgress(100, t(currentLang, 'exportDone'));
    showAlert('success', t(currentLang, 'exportDone'));
    els.downloadBtn.disabled = false;
  } catch (error) {
    const message =
      error.code === 'private'
        ? t(currentLang, 'errPrivate')
        : error.code === 'not_found'
          ? t(currentLang, 'errNotFound')
          : `${t(currentLang, 'errExport')}: ${error.message}`;
    showAlert('error', message);
    setProgress(0, '');
    els.progress.classList.add('hidden');
  } finally {
    setBusy(false);
  }
}

function renderSummary(username, library, artifact) {
  const p = library.profile;
  const img = p.user_image
    ? `<img src="https://mustapp.com/images${p.user_image}" alt="" width="56" height="56" />`
    : '';
  els.profileCard.innerHTML = `
    ${img}
    <div>
      <strong>@${username}</strong> · ${escapeHtml(p.name || '')}
      <div class="field-hint">${escapeHtml(p.bio_message || '')}</div>
    </div>
  `;

  const stats = computeStats(library);
  els.statsGrid.innerHTML = `
    <div class="stat"><strong>${stats.moviesWatched}</strong><span>${t(currentLang, 'statMoviesWatched')}</span></div>
    <div class="stat"><strong>${stats.moviesWant}</strong><span>${t(currentLang, 'statMoviesWant')}</span></div>
    <div class="stat"><strong>${stats.shows}</strong><span>${t(currentLang, 'statShows')}</span></div>
    <div class="stat"><strong>${stats.rated}</strong><span>${t(currentLang, 'statRated')}</span></div>
  `;

  const rows = artifact.previewRows || [];
  const moreCount = allItemsForIdLookup(library).length - rows.length;

  const body = rows
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.year)}</td>
      <td>${escapeHtml(row.list)}</td>
      <td>${escapeHtml(row.type)}</td>
      <td>${escapeHtml(row.rating ?? '')}</td>
      <td>${escapeHtml(row.imdb ?? '')}</td>
      <td>${escapeHtml(row.status ?? '')}</td>
    </tr>`,
    )
    .join('');

  els.tableWrap.innerHTML = `
    <table class="preview" aria-label="Preview">
      <thead>
        <tr>
          <th>${t(currentLang, 'colTitle')}</th>
          <th>${t(currentLang, 'colYear')}</th>
          <th>${t(currentLang, 'colList')}</th>
          <th>${t(currentLang, 'colType')}</th>
          <th>${t(currentLang, 'colRating')}</th>
          <th>${t(currentLang, 'colImdb')}</th>
          <th>${t(currentLang, 'colStatus')}</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    ${moreCount > 0 ? `<p class="field-hint">${t(currentLang, 'previewMore', { n: moreCount })}</p>` : ''}
  `;

  els.summary.classList.remove('hidden');
}

function resetUi() {
  exportResult = null;
  els.downloadBtn.disabled = true;
  els.alert.classList.add('hidden');
  els.summary.classList.add('hidden');
  els.progress.classList.remove('hidden');
}

function setBusy(busy) {
  els.submitBtn.disabled = busy;
  els.username.disabled = busy;
}

function setProgress(percent, text) {
  els.progressFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  els.progressFill.parentElement.setAttribute('aria-valuenow', String(percent));
  els.progressText.textContent = text;
}

function showAlert(kind, message) {
  els.alert.className = `alert ${kind}`;
  els.alert.textContent = message;
  els.alert.classList.remove('hidden');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}