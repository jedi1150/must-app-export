import { applyI18n, t } from './i18n.js';
import { createHttpClient } from './http.js';
import {
  fetchAnonymousToken,
  fetchPublicProfile,
  loadUserLibrary,
  allItemsForIdLookup,
} from './must-api.js';
import { resolveExternalIds } from './tmdb.js';
import { resolveMalIds } from './mal-resolve.js';
import {
  buildServiceArtifact,
  needsIdLookup,
  resolveServiceFormat,
  SERVICE_CATALOG,
} from './services.js';
import { buildDashboardStats } from './stats-dashboard.js';
import {
  getCachedLibrary,
  setCachedLibrary,
  setMemoryCache,
  getMemoryCache,
} from './cache.js';
import { downloadBlob, isAbortError, normalizeUsername, throwIfAborted } from './utils.js';
import { prependProfileAvatar } from './profile-avatar.js';
import {
  createEtaTracker,
  estimateExportDurationMs,
  estimateLoadDurationMs,
  formatDuration,
  formatEtaRemaining,
  libraryHasExternalIds,
} from './eta.js';

let currentLang = 'ru';
let loadEtaTracker = createEtaTracker();
let exportEtaTracker = createEtaTracker();
let exportResult = null;
let operation = null;
let state = {
  username: '',
  profilePreview: null,
  library: null,
  profileRaw: null,
  fetchedAt: null,
  loadOptions: { includeReviews: false },
};

const els = {
  lookupForm: document.getElementById('lookup-form'),
  username: document.getElementById('username'),
  lookupBtn: document.getElementById('lookup-btn'),
  lookupAlert: document.getElementById('lookup-alert'),
  lookupPreview: document.getElementById('lookup-preview'),
  stepLoad: document.getElementById('step-load'),
  stepExport: document.getElementById('step-export'),
  loadBtn: document.getElementById('load-btn'),
  cancelLoadBtn: document.getElementById('cancel-load-btn'),
  useCacheBtn: document.getElementById('use-cache-btn'),
  cacheHint: document.getElementById('cache-hint'),
  loadEtaHint: document.getElementById('load-eta-hint'),
  loadAlert: document.getElementById('load-alert'),
  progress: document.getElementById('progress'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  dashboard: document.getElementById('dashboard'),
  profileCard: document.getElementById('profile-card'),
  statsGrid: document.getElementById('stats-grid'),
  ratingChart: document.getElementById('rating-chart'),
  topYears: document.getElementById('top-years'),
  exportForm: document.getElementById('export-form'),
  exportFieldset: document.getElementById('export-fieldset'),
  exportProgress: document.getElementById('export-progress'),
  exportProgressFill: document.getElementById('export-progress-fill'),
  exportProgressText: document.getElementById('export-progress-text'),
  cancelExportBtn: document.getElementById('cancel-export-btn'),
  exportBtn: document.getElementById('export-btn'),
  downloadBtn: document.getElementById('download-btn'),
  exportAlert: document.getElementById('export-alert'),
  importGuide: document.getElementById('import-guide'),
  tableWrap: document.getElementById('preview-table-wrap'),
  serviceList: document.getElementById('service-list'),
  serviceFilesHint: document.getElementById('service-files-hint'),
  exportEtaHint: document.getElementById('export-eta-hint'),
  servicesLanding: document.getElementById('services-landing'),
  manualFormatToggle: document.getElementById('manual-format-toggle'),
  manualFormats: document.getElementById('manual-formats'),
  diaryMode: document.getElementById('diary-mode'),
  includeReviews: document.getElementById('include-reviews'),
  tmdbToken: document.getElementById('tmdb-token'),
  corsProxy: document.getElementById('cors-proxy'),
};

init();

function init() {
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentLang = btn.dataset.lang;
      document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b === btn));
      applyI18n(currentLang);
      renderLandingServices();
      renderServicePicker();
      if (state.profilePreview) renderLookupPreview(state.profilePreview);
      if (state.library) renderDashboard();
      updateLoadEtaHint();
      updateExportEtaHint();
    });
  });
  applyI18n(currentLang);
  renderLandingServices();
  renderServicePicker();

  els.manualFormatToggle?.addEventListener('change', () => {
    els.manualFormats?.classList.toggle('hidden', !els.manualFormatToggle.checked);
    updateExportEtaHint();
  });
  els.includeReviews?.addEventListener('change', updateLoadEtaHint);
  els.manualFormats?.querySelectorAll('input[name="format"]').forEach((input) => {
    input.addEventListener('change', updateExportEtaHint);
  });

  els.lookupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await lookupProfile();
  });

  els.loadBtn.addEventListener('click', () => loadLibraryFull(true));
  els.cancelLoadBtn.addEventListener('click', () => requestCancel('load'));
  els.cancelExportBtn.addEventListener('click', () => requestCancel('export'));
  els.useCacheBtn.addEventListener('click', () => applyCacheRecord(getMemoryCache()));
  window.addEventListener('beforeunload', (event) => {
    if (!operation) return;
    event.preventDefault();
    event.returnValue = t(currentLang, 'confirmLeave');
  });
  document.addEventListener('click', (event) => {
    if (!operation) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.target === '_blank') return;
    if (!window.confirm(t(currentLang, 'confirmLeave'))) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    operation.controller.abort();
    endOperation();
  });

  els.exportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (els.exportFieldset.disabled) return;
    await runExport();
  });

  els.downloadBtn.addEventListener('click', () => {
    if (!exportResult) return;
    const blob = exportResult.blob || new Blob([exportResult.content], { type: exportResult.mime });
    downloadBlob(exportResult.filename, blob);
  });
}

function renderLandingServices() {
  const groups = [
    { key: 'trackers', titleKey: 'serviceGroupTrackers' },
    { key: 'generic', titleKey: 'serviceGroupGeneric' },
    { key: 'unavailable', titleKey: 'serviceGroupArchive' },
  ];
  els.servicesLanding.innerHTML = groups
    .map((group) => {
      const items = SERVICE_CATALOG.filter((s) => s.group === group.key);
      if (!items.length) return '';
      const chips = items.map((s) => `<span class="svc-chip">${t(currentLang, s.labelKey)}</span>`).join('');
      return `<div class="landing-group"><h3>${t(currentLang, group.titleKey)}</h3><div class="svc-chips">${chips}</div></div>`;
    })
    .join('');
}

function renderServicePicker() {
  const groups = [
    { key: 'trackers', titleKey: 'serviceGroupTrackers' },
    { key: 'generic', titleKey: 'serviceGroupGeneric' },
    { key: 'unavailable', titleKey: 'serviceGroupArchive' },
  ];
  els.serviceList.innerHTML = groups
    .map((group) => {
      const items = SERVICE_CATALOG.filter((s) => s.group === group.key);
      if (!items.length) return '';
      const radios = items
        .map(
          (s, idx) => `
        <label class="radio">
          <input type="radio" name="service" value="${s.id}" ${group.key === 'trackers' && idx === 0 ? 'checked' : ''} />
          <span>${t(currentLang, s.labelKey)}</span>
        </label>`,
        )
        .join('');
      return `<div class="service-group"><p class="service-group-title">${t(currentLang, group.titleKey)}</p>${radios}</div>`;
    })
    .join('');
  els.serviceList.querySelectorAll('input[name="service"]').forEach((input) => {
    input.addEventListener('change', updateServiceHint);
  });
  updateServiceHint();
}

function updateServiceHint() {
  const id = new FormData(els.exportForm).get('service');
  const service = SERVICE_CATALOG.find((s) => s.id === id);
  els.serviceFilesHint.textContent = service ? t(currentLang, service.filesKey) : '';
  updateExportEtaHint();
}

function updateLoadEtaHint() {
  const profile = state.profilePreview;
  if (!profile?.lists || !els.loadEtaHint) return;
  const includeReviews = els.includeReviews?.checked;
  const ms = estimateLoadDurationMs(profile, { includeReviews });
  els.loadEtaHint.textContent = t(currentLang, 'loadEtaHint', { eta: formatDuration(ms, currentLang) });
  els.loadEtaHint.classList.remove('hidden');
}

function resolveExportTargetFromForm() {
  const form = new FormData(els.exportForm);
  try {
    return resolveServiceFormat(form.get('service'), els.manualFormatToggle?.checked, form.get('format'));
  } catch {
    return null;
  }
}

function updateExportEtaHint() {
  if (!els.exportEtaHint) return;
  if (!state.library) {
    els.exportEtaHint.textContent = '';
    return;
  }
  const target = resolveExportTargetFromForm();
  if (!target) {
    els.exportEtaHint.textContent = '';
    return;
  }
  const skipTmdb = libraryHasExternalIds(state.library);
  const ms = estimateExportDurationMs(state.library, target.format, { skipTmdb });
  const instant = ms < 2_500 && target.format === 'json';
  const etaLabel = instant
    ? t(currentLang, 'exportEtaInstant')
    : formatDuration(ms, currentLang);
  els.exportEtaHint.textContent = t(currentLang, 'exportEtaHint', { eta: etaLabel });
}

function progressLabel(statusKey, vars, etaMs) {
  const status = t(currentLang, statusKey, vars);
  if (etaMs == null) return status;
  const eta = formatEtaRemaining(etaMs, currentLang);
  return t(currentLang, 'progressWithEta', { status, eta });
}

async function lookupProfile() {
  const username = normalizeUsername(els.username.value);
  if (!username) return showLookupAlert('error', t(currentLang, 'errEmptyUser'));

  state.username = username;
  els.lookupBtn.disabled = true;
  showLookupAlert('', '');

  try {
    const http = createHttpClient({ corsProxy: els.corsProxy.value });
    const profile = await fetchPublicProfile(http, username);
    if (profile.is_private) {
      showLookupAlert('error', t(currentLang, 'errPrivate'));
      els.lookupPreview.classList.add('hidden');
      return;
    }
    state.profilePreview = profile;
    state.profileRaw = profile;
    renderLookupPreview(profile);
    els.stepLoad.classList.remove('hidden');
    updateLoadEtaHint();

    const cached = await getCachedLibrary(username);
    if (cached) {
      setMemoryCache(cached);
      els.useCacheBtn.classList.remove('hidden');
      els.cacheHint.textContent = t(currentLang, 'cacheAvailable', {
        date: new Date(cached.fetchedAt).toLocaleString(currentLang === 'ru' ? 'ru-RU' : 'en-US'),
      });
    } else {
      els.useCacheBtn.classList.add('hidden');
      els.cacheHint.textContent = t(currentLang, 'cacheNone');
    }
  } catch (error) {
    const message = error.code === 'not_found' ? t(currentLang, 'errNotFound') : error.message;
    showLookupAlert('error', message);
    els.lookupPreview.classList.add('hidden');
  } finally {
    els.lookupBtn.disabled = false;
  }
}

function renderLookupPreview(profile) {
  const w = profile.watched_by_type || {};
  els.lookupPreview.innerHTML = `
    <div class="profile-card"><div>
      <strong>@${escapeHtml(profile.uri)}</strong> · ${escapeHtml(profile.name || '')}
      <div class="field-hint">${t(currentLang, 'lookupCounts', {
        movies: w.movies ?? '—',
        shows: w.shows ?? '—',
        want: profile.want_count ?? '—',
      })}</div>
    </div></div>`;
  const card = els.lookupPreview.querySelector('.profile-card');
  prependProfileAvatar(card, { uri: profile.uri, name: profile.name });
  els.lookupPreview.classList.remove('hidden');
}

async function loadLibraryFull(forceNetwork) {
  if (!state.username || operation) return;
  showLoadAlert('', '');
  const signal = beginOperation('load');
  setBusyLoad(true);
  loadEtaTracker.reset();
  const profileForEta = state.profilePreview;
  const loadListKeys = ['watched', 'want', 'shows'];
  const loadListSizes = loadListKeys.map((key) => profileForEta?.lists?.[key]?.length || 0);
  const loadTotalItems = loadListSizes.reduce((sum, n) => sum + n, 0);
  setProgress(3, t(currentLang, 'progressProfile'));

  try {
    if (!forceNetwork) {
      const mem = getMemoryCache();
      if (mem?.library) return applyCacheRecord(mem);
    }

    const http = createHttpClient({ corsProxy: els.corsProxy.value, signal });
    const includeReviews = els.includeReviews.checked;
    const profile = state.profilePreview || (await fetchPublicProfile(http, state.username));
    const bearer = await fetchAnonymousToken(http);
    const library = await loadUserLibrary(
      http,
      profile,
      bearer,
      { includeReviews },
      ({ phase, list, current, total, listIndex, listCount }) => {
        if (phase === 'lists') {
          const pct = 8 + Math.round(((listIndex + current / Math.max(total, 1)) / listCount) * 72);
          const completedBefore = loadListSizes.slice(0, listIndex).reduce((sum, n) => sum + n, 0);
          const loadProgressDone = Math.min(loadTotalItems, completedBefore + current);
          const { remainingMs } = loadEtaTracker.tick(loadProgressDone, loadTotalItems || 1);
          setProgress(
            pct,
            progressLabel('progressList', { list, current, total }, remainingMs),
          );
        }
      },
    );

    state.library = library;
    state.profileRaw = profile;
    state.fetchedAt = new Date().toISOString();
    state.loadOptions = { includeReviews };

    const record = await setCachedLibrary(state.username, library, state.loadOptions);
    setMemoryCache(record);

    afterLibraryReady();
    setProgress(100, t(currentLang, 'loadDone'));
    updateExportEtaHint();
  } catch (error) {
    if (isAbortError(error)) {
      showLoadAlert('info', t(currentLang, 'loadCancelled'));
      return;
    }
    showExportAlert('error', `${t(currentLang, 'errExport')}: ${error.message}`);
  } finally {
    endOperation();
    setBusyLoad(false);
  }
}

function applyCacheRecord(record) {
  if (!record?.library) return;
  state.library = record.library;
  state.fetchedAt = record.fetchedAt;
  state.loadOptions = record.options || {};
  afterLibraryReady();
}

function afterLibraryReady() {
  renderDashboard();
  els.dashboard.classList.remove('hidden');
  els.stepExport.classList.remove('hidden');
  updateExportEtaHint();
  els.cacheHint.textContent = t(currentLang, 'cacheLoaded', {
    date: new Date(state.fetchedAt).toLocaleString(currentLang === 'ru' ? 'ru-RU' : 'en-US'),
  });
}

function renderDashboard() {
  if (!state.library) return;
  const stats = buildDashboardStats(state.library, state.profileRaw);
  const p = state.library.profile;
  els.profileCard.innerHTML = `<div><strong>@${escapeHtml(state.username)}</strong> · ${escapeHtml(p.name || '')}</div>`;
  prependProfileAvatar(els.profileCard, { uri: p.uri || state.username, name: p.name });

  els.statsGrid.innerHTML = `
    <div class="stat"><strong>${stats.moviesWatched}</strong><span>${t(currentLang, 'statMoviesWatched')}</span></div>
    <div class="stat"><strong>${stats.moviesWant}</strong><span>${t(currentLang, 'statMoviesWant')}</span></div>
    <div class="stat"><strong>${stats.showsTracked}</strong><span>${t(currentLang, 'statShows')}</span></div>
    <div class="stat"><strong>${stats.episodesWatched}</strong><span>${t(currentLang, 'statEpisodes')}</span></div>
    <div class="stat"><strong>${stats.avgRating ?? '—'}</strong><span>${t(currentLang, 'statAvgRating')}</span></div>
    <div class="stat"><strong>${stats.ratedCount}</strong><span>${t(currentLang, 'statRated')}</span></div>
  `;

  const dist = stats.distribution || [];
  const max = Math.max(...dist.map((d) => d.count), 1);
  els.ratingChart.innerHTML = dist.length
    ? dist
        .map(
          (d) => `<div class="bar-row"><span>${d.rate}</span><div class="bar" style="width:${Math.round((d.count / max) * 100)}%"></div><span>${d.count}</span></div>`,
        )
        .join('')
    : `<p class="field-hint">${t(currentLang, 'noRatingData')}</p>`;

  els.topYears.innerHTML = stats.topYears.length
    ? `<h4>${t(currentLang, 'topYearsTitle')}</h4><ul>${stats.topYears.map((y) => `<li>${y.year}: ${y.count}</li>`).join('')}</ul>`
    : '';
}

async function runExport() {
  if (!state.library) {
    showExportAlert('error', t(currentLang, 'errNoLibrary'));
    return;
  }

  if (operation) return;

  exportResult = null;
  els.downloadBtn.disabled = true;
  showExportAlert('', '');

  const form = new FormData(els.exportForm);
  const target = resolveServiceFormat(form.get('service'), els.manualFormatToggle?.checked, form.get('format'));
  const diaryMode = els.diaryMode.value;

  const signal = beginOperation('export');
  setBusyExport(true);
  exportEtaTracker.reset();
  await nextPaint();

  try {
    const http = createHttpClient({ corsProxy: els.corsProxy.value, signal });
    const library = structuredClone(state.library);

    if (needsIdLookup(target.format)) {
      const lookupItems = allItemsForIdLookup(library);
      await resolveExternalIds(http, lookupItems, els.tmdbToken.value, (current, total) => {
        const { remainingMs } = exportEtaTracker.tick(current, total);
        setExportProgress(
          20 + Math.round((current / total) * 50),
          progressLabel('progressIds', { current, total }, remainingMs),
        );
      });
    }

    if (target.format === 'mal-xml') {
      await resolveMalIds(http, library, (current, total) => {
        const { remainingMs } = exportEtaTracker.tick(current, total);
        setExportProgress(
          55 + Math.round((current / total) * 35),
          progressLabel('progressMal', { current, total }, remainingMs),
        );
      });
    }

    throwIfAborted(signal);
    exportResult = await buildServiceArtifact(target, library, state.username, diaryMode);
    renderImportGuide(exportResult.serviceMeta, exportResult.files);
    renderPreview(exportResult);
    if (exportResult.meta?.unmatched != null) {
      showExportAlert('success', t(currentLang, 'malSummary', exportResult.meta));
    } else {
      showExportAlert('success', t(currentLang, 'exportDone'));
    }
    els.downloadBtn.disabled = false;
    setExportProgress(100, t(currentLang, 'exportDone'));
  } catch (error) {
    if (isAbortError(error)) {
      showExportAlert('info', t(currentLang, 'exportCancelled'));
      return;
    }
    showExportAlert('error', `${t(currentLang, 'errExport')}: ${error.message}`);
  } finally {
    endOperation();
    setBusyExport(false);
  }
}

function beginOperation(kind) {
  const controller = new AbortController();
  operation = { kind, controller };
  return controller.signal;
}

function endOperation() {
  operation = null;
}

function requestCancel(kind) {
  if (!operation || operation.kind !== kind) return;
  const key = kind === 'load' ? 'confirmCancelLoad' : 'confirmCancelExport';
  if (!window.confirm(t(currentLang, key))) return;
  operation.controller.abort();
}

function renderImportGuide(service, files) {
  if (!service) {
    els.importGuide.classList.add('hidden');
    return;
  }
  const fileList = (files || []).map((f) => `<li><code>${escapeHtml(f.name)}</code></li>`).join('');
  els.importGuide.innerHTML = `
    <h3>${t(currentLang, 'importGuideTitle')}</h3>
    <p>${t(currentLang, service.instructionKey)}</p>
    <p class="field-hint"><a href="${escapeHtml(service.importUrl)}" rel="noopener">${t(currentLang, 'importLink')}</a> ·
    <a href="${escapeHtml(service.docUrl)}" rel="noopener">${t(currentLang, 'docLink')}</a></p>
  <ul class="file-list">${fileList}</ul>`;
  els.importGuide.classList.remove('hidden');
}

function renderPreview(artifact) {
  const rows = artifact.previewRows || [];
  const body = rows
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.year)}</td><td>${escapeHtml(row.list)}</td>
      <td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.rating ?? '')}</td><td>${escapeHtml(row.imdb ?? '')}</td></tr>`,
    )
    .join('');
  els.tableWrap.innerHTML = `<table class="preview"><thead><tr>
      <th>${t(currentLang, 'colTitle')}</th><th>${t(currentLang, 'colYear')}</th><th>${t(currentLang, 'colList')}</th>
      <th>${t(currentLang, 'colType')}</th><th>${t(currentLang, 'colRating')}</th><th>${t(currentLang, 'colImdb')}</th>
    </tr></thead><tbody>${body}</tbody></table>`;
  els.tableWrap.classList.remove('hidden');
}

function showLookupAlert(kind, message) {
  els.lookupAlert.className = kind ? `alert ${kind}` : 'alert hidden';
  els.lookupAlert.textContent = message || '';
  els.lookupAlert.classList.toggle('hidden', !message);
}

function showExportAlert(kind, message) {
  els.exportAlert.className = kind ? `alert ${kind}` : 'alert hidden';
  els.exportAlert.textContent = message || '';
  els.exportAlert.classList.toggle('hidden', !message);
}

function showLoadAlert(kind, message) {
  els.loadAlert.className = kind ? `alert ${kind}` : 'alert hidden';
  els.loadAlert.textContent = message || '';
  els.loadAlert.classList.toggle('hidden', !message);
}

function pageControls() {
  return [
    els.username,
    els.lookupBtn,
    els.loadBtn,
    els.useCacheBtn,
    ...document.querySelectorAll('.lang-btn'),
  ];
}

function exportPageControls() {
  return pageControls();
}

function setControlsDisabled(controls, busy, key) {
  for (const el of controls) {
    if (!el) continue;
    if (busy) {
      el.dataset[key] = el.disabled ? '1' : '0';
      el.disabled = true;
    } else if (el.dataset[key] != null) {
      el.disabled = el.dataset[key] === '1';
      delete el.dataset[key];
    }
  }
}

function setBusyLoad(busy) {
  els.stepLoad.setAttribute('aria-busy', busy ? 'true' : 'false');
  els.cancelLoadBtn.classList.toggle('hidden', !busy);
  els.exportFieldset.disabled = busy;
  setControlsDisabled(pageControls(), busy, 'busyLoad');
  if (busy) els.progress.classList.remove('hidden');
}

function setBusyExport(busy) {
  els.exportFieldset.disabled = busy;
  els.stepExport.setAttribute('aria-busy', busy ? 'true' : 'false');
  setControlsDisabled(exportPageControls(), busy, 'busyExport');
  els.exportProgress.classList.toggle('hidden', !busy);
  if (busy) {
    setExportProgress(null, t(currentLang, 'progressExport'));
    els.exportProgress.scrollIntoView({ block: 'nearest' });
  }
}

async function nextPaint() {
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function setExportProgress(percent, text) {
  const fill = els.exportProgressFill;
  const bar = els.exportProgress.querySelector('[role="progressbar"]');
  if (percent == null) {
    fill.classList.add('indeterminate');
    fill.style.width = '';
    bar.removeAttribute('aria-valuenow');
  } else {
    const value = Math.min(100, Math.max(0, percent));
    fill.classList.remove('indeterminate');
    fill.style.transform = '';
    fill.style.width = `${value}%`;
    bar.setAttribute('aria-valuenow', String(value));
  }
  els.exportProgressText.textContent = text;
}

function setProgress(percent, text) {
  els.progressFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  els.progressText.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}