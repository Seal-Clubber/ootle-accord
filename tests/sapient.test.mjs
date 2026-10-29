import test from 'node:test';
import assert from 'node:assert/strict';
import { createSapientAdapter, discoverTariProvider, SAPIENT_PRIVACY_REPORT } from '../app/lib/sapient.mjs';

const resourceAddress = `resource_${'a'.repeat(64)}`;
const capabilities = { transactionRequests: true, supportsPrivateFees: true, htlcFund: true, scriptPathSpend: true };
const receipt = { transactionId: 'tx-1', receivedCommitment: 'b'.repeat(64), amount: '700', journalId: 'journal-1' };
const conditions = [[{ Builtin: { HashLock: { hash: 'a'.repeat(64), alg: 'Sha256' } } }], [{ Builtin: { AfterEpoch: 500 } }]];
const claim = { resourceAddress, commitment: 'b'.repeat(64), conditions, preimageHex: 'd'.repeat(64) };
const refund = { resourceAddress, commitment: 'b'.repeat(64), conditions, amount: '700', outputMask: 'c'.repeat(64) };

function memoryStorage(initial) {
  const values = new Map(initial ? [['ootleaccord.sapient.pending.v1.esmeralda', initial]] : []);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values };
}

function wallet({ network = 'esmeralda', caps = capabilities, statuses, submitError, onRequest, result = receipt } = {}) {
  const calls = [];
  let status = 'pending';
  let accountChanged;
  const provider = {
    isTariWallet: true,
    on(event, fn) { assert.equal(event, 'accountsChanged'); accountChanged = fn; return () => { accountChanged = undefined; }; },
    async request(args) {
      calls.push(args);
      onRequest?.(args);
      switch (args.method) {
        case 'tari_requestAccounts':
        case 'tari_getAccounts': return ['component_donor'];
        case 'tari_getNetwork': return network;
        case 'tari_getCapabilities': return { ...caps };
        case 'tari_createTransactionRequest': status = 'approved'; return { requestId: 'request-1' };
        case 'tari_getTransactionRequest': {
          const next = statuses?.length ? statuses.shift() : status;
          return { status: next, ...(next === 'submitted' ? { result } : {}) };
        }
        case 'tari_submitTransactionRequest':
          status = 'submitted';
          if (submitError) throw new Error('Network response lost');
          return result;
        case 'tari_disconnect': return null;
        default: throw new Error(`Unexpected method ${args.method}`);
      }
    },
  };
  return { provider, calls, changeAccount: () => accountChanged?.([]) };
}

function adapterFor(mock, extra = {}) {
  return createSapientAdapter({ provider: mock.provider, storage: memoryStorage(), pollIntervalMs: 0, requestTimeoutMs: 200, ...extra });
}

test('provider discovery never connects, and resolves after initialization', async () => {
  const target = new EventTarget();
  const mock = wallet();
  const discovery = discoverTariProvider({ target, timeoutMs: 50 });
  target.tari = mock.provider;
  target.dispatchEvent(new Event('tari#initialized'));
  assert.equal(await discovery, mock.provider);
  assert.deepEqual(mock.calls, []);
});

test('claim requires explicit connection, then enforces private fees without private view access', async () => {
  const mock = wallet();
  const storage = memoryStorage();
  const adapter = adapterFor(mock, { storage });
  assert.deepEqual(mock.calls, []);
  await assert.rejects(adapter.claimMilestone(claim), { code: 'NOT_CONNECTED' });
  await adapter.connect();
  assert.equal(await adapter.claimMilestone(claim), receipt);
  const creation = mock.calls.find(call => call.method === 'tari_createTransactionRequest');
  assert.deepEqual(creation.params, { kind: 'htlcClaim', ...claim, feeType: 'private', enforceFeeType: true });
  assert.equal(mock.calls.some(call => /ViewAccess|Balances/.test(call.method)), false);
  assert.equal(storage.values.size, 0);
  assert.equal(adapter.getState().status, 'submitted');
  assert.equal(Object.isFrozen(adapter.getState()), true);
  assert.equal(Object.isFrozen(adapter.getState().capabilities), true);
});

test('a lost submit response checks the existing request and never creates or submits a duplicate', async () => {
  const mock = wallet({ submitError: true, statuses: ['approved', 'approved', 'submitting', 'submitted'] });
  const adapter = adapterFor(mock);
  await adapter.connect();
  assert.equal(await adapter.claimMilestone(claim), receipt);
  assert.equal(mock.calls.filter(call => call.method === 'tari_createTransactionRequest').length, 1);
  assert.equal(mock.calls.filter(call => call.method === 'tari_submitTransactionRequest').length, 1);
});

test('resuming a stored completed request recovers the receipt without another transaction', async () => {
  const storage = memoryStorage('request-old');
  const mock = wallet({ statuses: ['submitted'] });
  const adapter = adapterFor(mock, { storage });
  assert.equal(adapter.getState().requestId, 'request-old');
  await adapter.connect();
  assert.equal(await adapter.resumePending(), receipt);
  assert.equal(mock.calls.some(call => /createTransactionRequest|submitTransactionRequest/.test(call.method)), false);
  assert.equal(storage.values.size, 0);
});

test('wrong network, missing script spending, and missing private fees prevent transaction creation', async () => {
  const wrong = wallet({ network: 'igor' });
  const wrongAdapter = adapterFor(wrong);
  await assert.rejects(wrongAdapter.connect(), { code: 'WRONG_NETWORK' });
  assert.equal(wrongAdapter.getState().account, null);
  for (const capability of ['supportsPrivateFees', 'scriptPathSpend']) {
    const unsupported = wallet({ caps: { ...capabilities, [capability]: false } });
    const adapter = adapterFor(unsupported);
    await adapter.connect();
    await assert.rejects(adapter.claimMilestone(claim), { code: 'UNSUPPORTED_CAPABILITY' });
    assert.equal(unsupported.calls.some(call => call.method === 'tari_createTransactionRequest'), false);
  }
});

test('refund rejects malformed, floating, numeric, zero, negative and overflowing amounts before wallet calls', () => {
  const mock = wallet();
  const adapter = adapterFor(mock);
  for (const amount of ['0', '-1', '1.2', '01', ' 1', '1e6', 100, '', '18446744073709551616']) {
    assert.throws(() => adapter.refundMilestone({ ...refund, amount }), { code: 'INVALID_AMOUNT' });
  }
  assert.equal(mock.calls.length, 0);
});

test('account change clears connection data while preserving the pending request for recovery', async () => {
  const mock = wallet();
  const storage = memoryStorage('request-old');
  const adapter = adapterFor(mock, { storage });
  await adapter.connect();
  mock.changeAccount();
  assert.deepEqual(adapter.getState(), { status: 'disconnected', account: null, network: null, capabilities: null, requestId: 'request-old', error: null });
  assert.equal(storage.values.get('ootleaccord.sapient.pending.v1.esmeralda'), 'request-old');
  await assert.rejects(adapter.resumePending(), { code: 'NOT_CONNECTED' });
});

test('waiting timeout preserves only request ID and blocks creating another transaction', async () => {
  const mock = wallet({ statuses: Array(1000).fill('pending') });
  const storage = memoryStorage();
  const adapter = adapterFor(mock, { storage, requestTimeoutMs: 5 });
  await adapter.connect();
  await assert.rejects(adapter.claimMilestone(claim), { code: 'PENDING_TIMEOUT' });
  assert.deepEqual([...storage.values.values()], ['request-1']);
  await assert.rejects(adapter.claimMilestone(claim), { code: 'PENDING_REQUEST' });
  assert.equal(mock.calls.filter(call => call.method === 'tari_createTransactionRequest').length, 1);
});

test('aborting waiting retains request and never pretends to cancel a wallet transaction', async () => {
  const controller = new AbortController();
  const mock = wallet({ statuses: ['pending'], onRequest: ({ method }) => { if (method === 'tari_getTransactionRequest') controller.abort(); } });
  const adapter = adapterFor(mock);
  await adapter.connect();
  await assert.rejects(adapter.claimMilestone(claim, { signal: controller.signal }), { code: 'ABORTED' });
  assert.equal(adapter.getState().requestId, 'request-1');
  assert.equal(mock.calls.some(call => call.method === 'tari_submitTransactionRequest'), false);
});

test('stock wallet private escrow funding fails closed even when htlcFund capability is present', async () => {
  const mock = wallet();
  const adapter = adapterFor(mock);
  await adapter.connect();
  const countBeforeFunding = mock.calls.length;
  assert.throws(() => adapter.fundMilestone({ resourceAddress, amount: '700', claimantWalletAddress: `otl_esm_1${'q'.repeat(90)}`, hashLockHex: 'a'.repeat(64), refundEpoch: '500' }), { code: 'PRIVATE_ESCROW_UNAVAILABLE' });
  assert.equal(mock.calls.length, countBeforeFunding);
  assert.equal(mock.calls.some(call => call.method === 'tari_createTransactionRequest'), false);
  assert.equal(SAPIENT_PRIVACY_REPORT.privateFundingSupported, false);
  assert.equal(SAPIENT_PRIVACY_REPORT.fundingSource, 'revealed');
});

test('failed or malformed submitted responses retain request for inspection, preventing another spend', async () => {
  for (const settings of [{ statuses: ['failed'] }, { result: {} }]) {
    const mock = wallet(settings);
    const adapter = adapterFor(mock);
    await adapter.connect();
    await assert.rejects(adapter.claimMilestone(claim), error => ['TRANSACTION_FAILED', 'INVALID_RECEIPT'].includes(error.code));
    assert.equal(adapter.getState().requestId, 'request-1');
    await assert.rejects(adapter.claimMilestone(claim), { code: 'PENDING_REQUEST' });
  }
});

test('refund keeps exact native field names and condition tree without reading balances', async () => {
  const mock = wallet();
  const adapter = adapterFor(mock);
  await adapter.connect();
  await adapter.refundMilestone(refund);
  const operation = mock.calls.find(call => call.method === 'tari_createTransactionRequest').params;
  assert.deepEqual(operation, { kind: 'htlcRefund', ...refund, feeType: 'private', enforceFeeType: true });
  assert.deepEqual(operation.conditions, conditions);
  assert.notEqual(operation.conditions, conditions);
  assert.equal(mock.calls.some(call => /ViewAccess|Balances/.test(call.method)), false);
});

test('ambiguous create response leaves a durable guard and never opens another spend request', async () => {
  const mock = wallet();
  const original = mock.provider.request;
  mock.provider.request = async args => {
    const result = await original(args);
    if (args.method === 'tari_createTransactionRequest') throw new Error('Create response lost');
    return result;
  };
  const storage = memoryStorage();
  const adapter = adapterFor(mock, { storage });
  await adapter.connect();
  await assert.rejects(adapter.claimMilestone(claim), /Create response lost/);
  await assert.rejects(adapter.claimMilestone(claim), { code: 'PENDING_REQUEST' });
  await assert.rejects(adapter.resumePending(), { code: 'UNKNOWN_CREATE_OUTCOME' });
  const freshAdapter = adapterFor(mock, { storage });
  await freshAdapter.connect();
  await assert.rejects(freshAdapter.claimMilestone(claim), { code: 'PENDING_REQUEST' });
  await assert.rejects(freshAdapter.resumePending(), { code: 'UNKNOWN_CREATE_OUTCOME' });
  assert.equal(mock.calls.filter(call => call.method === 'tari_createTransactionRequest').length, 1);
  assert.deepEqual([...storage.values.values()], ['ootleaccord:unknown-create-outcome']);
});

test('oversized, sparse, cyclic and deeply nested condition inputs are rejected before wallet access', () => {
  const mock = wallet();
  const adapter = adapterFor(mock);
  const cyclic = {}; cyclic.self = cyclic;
  const deeplyNested = {}; let nested = deeplyNested;
  for (let index = 0; index < 30; index++) { nested.child = {}; nested = nested.child; }
  for (const badConditions of [Array(2), [Array(1_000_000_000), []], [[cyclic], [{}]], [[deeplyNested], [{}]], [[{ text: 'x'.repeat(33000) }], [{}]]]) {
    assert.throws(() => adapter.claimMilestone({ ...claim, conditions: badConditions }), { code: 'INVALID_HTLC' });
  }
  assert.equal(mock.calls.length, 0);
});

test('disposing during an outstanding connection cannot restore live connection state', async () => {
  const mock = wallet();
  const original = mock.provider.request;
  let resolveAccounts;
  mock.provider.request = args => args.method === 'tari_requestAccounts' ? new Promise(resolve => { resolveAccounts = resolve; }) : original(args);
  const adapter = adapterFor(mock);
  const connecting = adapter.connect();
  await new Promise(setImmediate);
  adapter.dispose();
  resolveAccounts(['component_donor']);
  await assert.rejects(connecting, { code: 'DISPOSED' });
  assert.equal(adapter.getState().status, 'disposed');
  assert.equal(adapter.getState().account, null);
});
