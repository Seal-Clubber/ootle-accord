const VERSION = /^[a-f0-9]{12}$/;

/** Checks only our public build manifest. Never calls the wallet or indexer. */
export function createAppUpdater({ currentVersion, getUrl, fetcher = globalThis.fetch,
  canReload, navigate, onUpdate = () => {}, now = Date.now } = {}) {
  let pending = null;
  let checking = false;
  let navigating = false;

  function apply({ manual = false } = {}) {
    if (!pending || navigating || !canReload(manual)) return false;
    const url = new URL(getUrl());
    // Do not loop if a CDN served the previous HTML even on the versioned URL.
    if (url.searchParams.get('v') === pending) return false;
    url.searchParams.set('v', pending);
    navigating = true;
    navigate(url.href);
    return true;
  }

  async function check() {
    if (!VERSION.test(currentVersion) || checking || navigating) return;
    checking = true;
    try {
      const manifest = new URL('./version.json', getUrl());
      manifest.searchParams.set('check', String(now()));
      const response = await fetcher(manifest.href, { cache: 'no-store', credentials: 'omit',
        referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) return;
      const result = await response.json();
      if (!VERSION.test(result?.version)) return;
      pending = result.version === currentVersion ? null : result.version;
      onUpdate(pending);
      apply();
    } catch { /* Offline or mid-deployment: keep the current app usable. */ }
    finally { checking = false; }
  }

  return Object.freeze({ check, apply });
}
