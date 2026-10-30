import test from 'node:test';
import assert from 'node:assert/strict';
import { createSapientAdapter } from '../app/lib/sapient.mjs';

function fixture({ granted = false, network = 'esmeralda' } = {}) {
  const calls = [];
  const listeners = new Set();
  const state = { granted, unlocked: true, network, account: 'component_existing' };
  let beforeAccounts;
  const provider = {
    isTariWallet: true,
    on(event, listener) { assert.equal(event, 'accountsChanged'); listeners.add(listener); return () => listeners.delete(listener); },
    async request(call) {
      calls.push(call);
      switch (call.method) {
        case 'tari_getAccounts': await beforeAccounts?.(); return state.granted && state.unlocked ? [state.account] : [];
        case 'tari_requestAccounts': state.granted = true; return [state.account];
        case 'tari_getNetwork': return state.network;
        case 'tari_getCapabilities': return { transactionRequests: true, supportsPrivateFees: true, walletAddress: true };
        case 'tari_getWalletAddress': return 'otl_esm_17mufuvtwdwjlqhjj2rwaffwna5uae5pce7qje34p2jmwcz236f05faf4yzfxajqlh4drs7z9h6malpdfdgjwecv88z7ulf48sg4pwmganfp0v';
        case 'tari_disconnect': state.granted = false; return null;
        default: throw new Error(`Unexpected wallet call: ${call.method}`);
      }
    },
  };
  const writes = [];
  const storage = { getItem: () => 'pending-existing', setItem: (...args) => writes.push(args), removeItem: (...args) => writes.push(args) };
  return { calls, state, writes, provider, storage, blockAccounts(fn) { beforeAccounts = fn; }, accountChanged() { for (const listener of listeners) listener([]); } };
}
const adapterFor = f => createSapientAdapter({ provider: f.provider, storage: f.storage });

test('refresh restores an existing Sapient grant without permission, signatures or stored account data', async () => {
  const f = fixture();
  const first = adapterFor(f);
  await first.connect();
  first.dispose();
  f.calls.length = 0;
  const refreshed = adapterFor(f);
  const result = await refreshed.restoreConnection();
  assert.equal(result.status, 'connected');
  assert.equal(result.account, 'component_existing');
  assert.equal(result.requestId, 'pending-existing');
  assert.deepEqual(f.calls.map(c => c.method), ['tari_getAccounts', 'tari_getNetwork', 'tari_getCapabilities']);
  assert.deepEqual(f.writes, []);
});

test('an unconnected or locked wallet is not prompted; an existing grant restores after unlock', async () => {
  const f = fixture();
  const adapter = adapterFor(f);
  assert.equal((await adapter.restoreConnection()).account, null);
  assert.deepEqual(f.calls.map(c => c.method), ['tari_getAccounts']);
  f.state.granted = true;
  f.state.unlocked = false;
  assert.equal((await adapter.restoreConnection()).account, null);
  f.state.unlocked = true;
  assert.equal((await adapter.restoreConnection()).account, 'component_existing');
  assert.equal(f.calls.some(c => c.method === 'tari_requestAccounts'), false);
});

test('overlapping focus/pageshow lookups share a single request', async () => {
  const f = fixture({ granted: true });
  let release;
  f.blockAccounts(() => new Promise(resolve => { release = resolve; }));
  const adapter = adapterFor(f);
  const first = adapter.restoreConnection();
  const second = adapter.restoreConnection();
  assert.equal(first, second);
  await Promise.resolve();
  release();
  await Promise.all([first, second]);
  assert.equal(f.calls.filter(c => c.method === 'tari_getAccounts').length, 1);
});

test('disconnect or disposal during a passive lookup cannot restore a stale account', async () => {
  for (const action of ['disconnect', 'dispose']) {
    const f = fixture({ granted: true });
    let release;
    f.blockAccounts(() => new Promise(resolve => { release = resolve; }));
    const adapter = adapterFor(f);
    const pending = adapter.restoreConnection();
    await Promise.resolve();
    if (action === 'disconnect') await adapter.disconnect(); else adapter.dispose();
    release();
    await pending;
    assert.equal(adapter.getState().account, null);
    assert.equal(adapter.getState().requestId, 'pending-existing');
    assert.deepEqual(f.writes, []);
    if (action === 'disconnect') {
      // Even a delayed provider still reporting a grant cannot undo explicit disconnect.
      f.state.granted = true;
      const count = f.calls.length;
      await adapter.restoreConnection();
      assert.equal(f.calls.length, count);
    }
  }
});

test('account revocation and wrong network fail closed without losing a pending transaction', async () => {
  const f = fixture({ granted: true });
  const adapter = adapterFor(f);
  await adapter.restoreConnection();
  f.state.granted = false;
  f.accountChanged();
  await adapter.restoreConnection();
  assert.equal(adapter.getState().account, null);
  f.state.granted = true;
  f.state.network = 'igor';
  const result = await adapter.restoreConnection();
  assert.equal(result.account, null);
  assert.match(result.error, /Switch Sapient to esmeralda/);
  assert.equal(result.requestId, 'pending-existing');
  assert.equal(f.calls.some(c => /requestAccounts|Transaction|Balances|ViewAccess|sign/i.test(c.method)), false);
});

test('explicit Connect waits for an overlapping passive lookup instead of failing busy', async () => {
  const f = fixture();
  let release;
  f.blockAccounts(() => new Promise(resolve => { release = resolve; }));
  const adapter = adapterFor(f);
  const pending = adapter.restoreConnection();
  const connecting = adapter.connect();
  await Promise.resolve();
  release();
  await pending;
  assert.equal((await connecting).status, 'connected');
  assert.equal(f.calls.filter(c => c.method === 'tari_requestAccounts').length, 1);
});

test('a provider injected late restores its grant without a connection popup', async () => {
  const f = fixture({ granted: true });
  const target = new EventTarget();
  const adapter = createSapientAdapter({ target, storage: null });
  const pending = adapter.restoreConnection();
  target.tari = f.provider;
  target.dispatchEvent(new Event('tari#initialized'));
  assert.equal((await pending).account, 'component_existing');
  assert.equal(f.calls.some(c => c.method === 'tari_requestAccounts'), false);
  adapter.dispose();
});

test('reviewer identity waits for a focus-triggered restore instead of failing busy', async () => {
  const f = fixture({ granted: true });
  let release;
  f.blockAccounts(() => new Promise(resolve => { release = resolve; }));
  const adapter = adapterFor(f);
  const restoring = adapter.restoreConnection();
  const reading = adapter.getReviewerIdentity();
  await Promise.resolve();
  f.blockAccounts();
  release();
  await restoring;
  assert.equal((await reading).publicKey, 'f6f89e316e6ba5f05e5250ddd4a5d3ed39dcd038cf812cc6a154b6ec0951d25f');
  assert.equal(f.calls.some(c => /requestAccounts|Transaction|Balances|ViewAccess/i.test(c.method)), false);
});

test('a stuck passive lookup times out and its late response cannot undo a new connection', async () => {
  const f = fixture({ granted: true });
  let release;
  f.blockAccounts(() => new Promise(resolve => { release = resolve; }));
  const adapter = createSapientAdapter({ provider: f.provider, storage: f.storage, restoreTimeoutMs: 5 });
  const restoring = adapter.restoreConnection();
  const result = await restoring;
  assert.equal(result.account, null);
  assert.match(result.error, /did not respond/);
  assert.equal(result.requestId, 'pending-existing');
  assert.equal((await adapter.connect()).status, 'connected');
  f.blockAccounts();
  release();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(adapter.getState().account, 'component_existing');
  assert.equal((await adapter.getReviewerIdentity()).publicKey.length, 64);
});

test('Connect waits for an in-flight disconnect so the old revocation cannot drop the new grant', async () => {
  const f = fixture({ granted: true });
  const adapter = adapterFor(f);
  await adapter.restoreConnection();
  const request = f.provider.request;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  f.provider.request = async call => { if (call.method === 'tari_disconnect') await gate; return request(call); };
  const disconnecting = adapter.disconnect();
  const connecting = adapter.connect();
  assert.equal(f.calls.some(c => c.method === 'tari_requestAccounts'), false);
  release();
  await disconnecting;
  await connecting;
  assert.equal(f.state.granted, true);
  assert.equal(adapter.getState().status, 'connected');
});
