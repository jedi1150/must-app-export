/** Public avatar URL used by mustapp.com (302 to CDN). */
export function mustProfileImageUrl(usernameOrUri) {
  const uri = String(usernameOrUri || '').trim();
  if (!uri) return null;
  return `https://mustapp.com/api/users/uri/${encodeURIComponent(uri)}/image`;
}

export function profileInitials(name, uri) {
  const fromName = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0])
    .join('');
  if (fromName) return fromName.toUpperCase();
  const u = String(uri || '').trim();
  return (u.slice(0, 2) || '?').toUpperCase();
}

function showPlaceholder(img, placeholder) {
  img.classList.add('hidden');
  placeholder.classList.remove('hidden');
}

/**
 * @param {HTMLElement} container profile-card or similar
 * @param {{ uri?: string, name?: string }} profile
 */
export function prependProfileAvatar(container, profile) {
  const uri = profile?.uri;
  const name = profile?.name;
  const url = mustProfileImageUrl(uri);

  const wrap = document.createElement('div');
  wrap.className = 'profile-avatar';

  const placeholder = document.createElement('div');
  placeholder.className = 'avatar-placeholder';
  placeholder.textContent = profileInitials(name, uri);
  placeholder.setAttribute('aria-hidden', 'true');

  const img = document.createElement('img');
  img.alt = '';
  img.width = 56;
  img.height = 56;
  img.decoding = 'async';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';

  if (url) {
    img.addEventListener('error', () => showPlaceholder(img, placeholder), { once: true });
    img.addEventListener('load', () => {
      if (img.naturalWidth === 0) showPlaceholder(img, placeholder);
    }, { once: true });
    img.src = url;
    placeholder.classList.add('hidden');
  } else {
    img.classList.add('hidden');
  }

  wrap.append(img, placeholder);
  container.prepend(wrap);
}