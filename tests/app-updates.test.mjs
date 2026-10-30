import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppUpdater } from '../app/lib/app-updates.mjs';

const current = '0123456789ab';
const next = 'abcdef012345';
function fixture(overrides = {}) {
  const requests = [], navigations = [], updates = [];
  const updater = createAppUpdater({ currentVersion: current,
    getUrl: () => 'https://seal-clubber.github.io/ootle-accord/?other=kept#explore',
    fetcher: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ version: next }) }; },
    canReload: () => true, navigate: url => navigations.push(url),
    onUpdate: version => updates.push(version), now: () => 123, ...overrides,
  });
  return { updater, requests, navigations, updates };
}

test('new build loads fresh HTML under the Pages prefix, preserving route and other query params', async () => {
  const f = fixture();
  await f.updater.check();
  assert.equal(f.requests[0].url, 'https://seal-clubber.github.io/ootle-accord/version.json?check=123');
  assert.equal(f.requests[0].options.cache, 'no-store');
  assert.equal(f.requests[0].options.credentials, 'omit');
  assert.equal(f.requests[0].options.referrerPolicy, 'no-referrer');
  assert.deepEqual(f.navigations, [`https://seal-clubber.github.io/ootle-accord/?other=kept&v=${next}#explore`]);
  await f.updater.check();
  assert.equal(f.navigations.length, 1);
});

test('an update cannot interrupt an unresolved wallet request, even on explicit Update', async () => {
  let pendingRequest = true;
  const f = fixture({ canReload: () => !pendingRequest });
  await f.updater.check();
  assert.deepEqual(f.updates, [next]);
  assert.equal(f.updater.apply({ manual: true }), false);
  assert.deepEqual(f.navigations, []);
  pendingRequest = false;
  assert.equal(f.updater.apply(), true);
  assert.equal(f.navigations.length, 1);
});

test('draft/review deferral allows a later explicit update while preserving the route', async () => {
  const f = fixture({ canReload: manual => manual,
    getUrl: () => 'https://seal-clubber.github.io/ootle-accord/#review' });
  await f.updater.check();
  assert.equal(f.navigations.length, 0);
  assert.equal(f.updater.apply({ manual: true }), true);
  assert.equal(new URL(f.navigations[0]).hash, '#review');
});

test('missing, unchanged, malformed and offline manifests leave the running app usable', async () => {
  for (const fetcher of [
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({ version: current }) }),
    async () => ({ ok: true, json: async () => ({ version: 'https://untrusted.example/' }) }),
    async () => { throw new Error('offline'); },
  ]) {
    const f = fixture({ fetcher });
    await f.updater.check();
    assert.deepEqual(f.navigations, []);
  }
  let calls = 0;
  await fixture({ currentVersion: undefined, fetcher: async () => { calls++; } }).updater.check();
  assert.equal(calls, 0, 'source preview does not request a deployment manifest');
});

test('a stale CDN HTML response cannot create an automatic reload loop', async () => {
  const f = fixture({ getUrl: () => `https://seal-clubber.github.io/ootle-accord/?v=${next}#explore` });
  await f.updater.check();
  assert.equal(f.navigations.length, 0);
  assert.deepEqual(f.updates, [next]);
});
