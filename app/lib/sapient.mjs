// Provider contract: chironbuilds/tari-wallet/src/lib/messages.ts and
// docs/integration/provider-api.md. No keys, view grants, balances, or telemetry.

const UINT64_MAX = (1n << 64n) - 1n;
const RESOURCE = /^resource_[a-f0-9]{64}$/i;
const PENDING_KEY = 'ootleaccord.sapient.pending.v1';
const UNKNOWN_CREATE = 'ootleaccord:unknown-create-outcome';

/** Checked against the actual provider call, not just the SDK's broader capabilities. */
export const SAPIENT_PRIVACY_REPORT = Object.freeze({
  fundingSource: 'revealed',
  privateFundingSupported: false,
  source: 'https://github.com/chironbuilds/tari-wallet/blob/master/src/background/index.ts',
  sdkSource: 'https://github.com/chironbuilds/ootle-sdk-ts/blob/master/src/wallet.ts',
});

export class SapientError extends Error {
  constructor(message, code, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'SapientError';
    this.code = code;
  }
}

function abortError() {
  return new SapientError('Stopped waiting. The wallet request may still exist; resume it before making another payment.', 'ABORTED');
}

function positiveUnits(value, label) {
  if (typeof value !== 'string' || value.length > 20 || !/^[1-9][0-9]*$/.test(value) || BigInt(value) > UINT64_MAX) {
    throw new SapientError(`${label} must be a positive raw-unit integer string within the resource range.`, 'INVALID_AMOUNT');
  }
  return value;
}

function validateResource(address) {
  if (typeof address !== 'string' || !RESOURCE.test(address)) {
    throw new SapientError('Enter a valid resource address.', 'INVALID_RESOURCE');
  }
}

function validateFee(maxFee) {
  if (maxFee !== undefined) positiveUnits(maxFee, 'Maximum fee');
}

function hex32(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) throw new SapientError(`${label} must contain exactly 32 bytes in hex.`, 'INVALID_HTLC');
}

function validateConditions(conditions) {
  // The wallet, rather than this page, checks the tree against the on-chain script root.
  const invalid = () => { throw new SapientError('Use the unchanged, bounded claim/refund condition tree returned by Sapient.', 'INVALID_HTLC'); };
  if (!Array.isArray(conditions) || conditions.length !== 2) invalid();
  let nodes = 0;
  const ancestors = new Set();
  function clone(value, depth) {
    if (++nodes > 512 || depth > 20) invalid();
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') { if (value.length > 32768) invalid(); return value; }
    if (typeof value === 'number') { if (!Number.isSafeInteger(value)) invalid(); return value; }
    if (!value || typeof value !== 'object' || ancestors.has(value)) invalid();
    ancestors.add(value);
    let result;
    if (Array.isArray(value)) {
      if (value.length > 512) invalid();
      result = [];
      for (let index = 0; index < value.length; index++) {
        if (!Object.hasOwn(value, index)) invalid();
        result.push(clone(value[index], depth + 1));
      }
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
      const keys = Object.keys(value);
      if (keys.length > 512) invalid();
      result = {};
      for (const key of keys) {
        if (key.length > 1024 || ['__proto__', 'constructor', 'prototype'].includes(key)) invalid();
        result[key] = clone(value[key], depth + 1);
      }
    }
    ancestors.delete(value);
    return result;
  }
  const result = clone(conditions, 0);
  if (result.some(leaf => !Array.isArray(leaf) || !leaf.length || leaf.length > 8 || leaf.some(atom => !atom || typeof atom !== 'object' || Array.isArray(atom)))) invalid();
  if (new TextEncoder().encode(JSON.stringify(result)).length > 32768) invalid();
  return result;
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Discover a provider without connecting or requesting any wallet permission. */
export async function discoverTariProvider({ target = globalThis.window, timeoutMs = 1500, signal } = {}) {
  const usable = () => target?.tari?.isTariWallet === true && typeof target.tari.request === 'function' ? target.tari : null;
  if (signal?.aborted) throw abortError();
  if (usable()) return usable();
  if (!target?.addEventListener) return null;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener('tari#initialized', ready);
      signal?.removeEventListener('abort', aborted);
    };
    const ready = () => { const found = usable(); if (found) { cleanup(); resolve(found); } };
    const aborted = () => { cleanup(); reject(abortError()); };
    const timer = setTimeout(() => { cleanup(); resolve(usable()); }, Math.max(0, timeoutMs));
    target.addEventListener('tari#initialized', ready);
    signal?.addEventListener('abort', aborted, { once: true });
    ready();
  });
}

/**
 * Dependency-free browser adapter. connect() and each submit method are explicit actions.
 * getState()/subscribe() expose frozen snapshots. Only a request ID or ambiguity marker is persisted
 * in sessionStorage; callers own receipt storage and confidential delivery to recipients.
 */
export function createSapientAdapter({
  target = globalThis.window,
  provider: initialProvider,
  expectedNetwork = 'esmeralda',
  storage,
  pollIntervalMs = 700,
  requestTimeoutMs = 180000,
} = {}) {
  let provider = initialProvider;
  let sessionStorage = storage;
  if (storage === undefined) {
    try { sessionStorage = target?.sessionStorage; } catch { sessionStorage = null; }
  }
  const storageKey = `${PENDING_KEY}.${expectedNetwork}`;
  let requestId = null;
  try { requestId = sessionStorage?.getItem(storageKey) || null; } catch { /* Storage can be disabled. */ }
  // Store no account, recipient, amount, memo, instruction, or receipt in browser storage.
  if (requestId && (typeof requestId !== 'string' || requestId.length > 256)) requestId = null;
  let snapshot = Object.freeze({ status: 'disconnected', account: null, network: null, capabilities: null, requestId, error: null });
  const listeners = new Set();
  let disposed = false;
  let busy = false;
  let generation = 0;
  let unsubscribeProvider;
  let boundProvider;
  const submitAttempted = new Set();

  function update(patch) {
    snapshot = Object.freeze({ ...snapshot, ...patch, ...(disposed ? { status: 'disposed', account: null, network: null, capabilities: null } : {}) });
    for (const fn of listeners) { try { fn(snapshot); } catch { /* One observer cannot break wallet work. */ } }
  }
  function setPending(value) {
    requestId = value;
    try {
      if (value) sessionStorage?.setItem(storageKey, value);
      else sessionStorage?.removeItem(storageKey);
    } catch { /* A blocked store does not prevent signing; the caller still receives the ID. */ }
    update({ requestId: value });
  }
  function assertAlive() {
    if (disposed) throw new SapientError('The wallet adapter is disposed.', 'DISPOSED');
  }
  function invalidateConnection() {
    generation += 1;
    update({ status: 'disconnected', account: null, network: null, capabilities: null, error: null });
  }
  function bindProvider() {
    if (boundProvider === provider) return;
    unsubscribeProvider?.();
    boundProvider = provider;
    unsubscribeProvider = typeof provider.on === 'function' ? provider.on('accountsChanged', invalidateConnection) : undefined;
  }
  // Older Sapient versions expose only the window event; newer versions expose both.
  const windowAccountsChanged = () => { if (!unsubscribeProvider) invalidateConnection(); };
  target?.addEventListener?.('tari#accountsChanged', windowAccountsChanged);

  async function resolveProvider() {
    assertAlive();
    if (!provider) provider = await discoverTariProvider({ target });
    if (!provider || typeof provider.request !== 'function') {
      throw new SapientError('Sapient wallet was not found. Install or unlock the extension, then connect.', 'NO_PROVIDER');
    }
    bindProvider();
    return provider;
  }
  function call(method, params) {
    return provider.request(params === undefined ? { method } : { method, params });
  }
  function checkNetwork(network) {
    if (network !== expectedNetwork) throw new SapientError(`Switch Sapient to ${expectedNetwork}. Current network: ${String(network)}.`, 'WRONG_NETWORK');
  }
  async function connection(required = []) {
    await resolveProvider();
    if (!snapshot.account) throw new SapientError('Connect Sapient before requesting a transaction.', 'NOT_CONNECTED');
    const epoch = generation;
    const [accounts, network, caps] = await Promise.all([call('tari_getAccounts'), call('tari_getNetwork'), call('tari_getCapabilities')]);
    if (generation !== epoch || !Array.isArray(accounts) || !accounts.includes(snapshot.account)) {
      invalidateConnection();
      throw new SapientError('The wallet account changed. Connect again before continuing.', 'ACCOUNT_CHANGED');
    }
    checkNetwork(network);
    if (!caps || typeof caps !== 'object') throw new SapientError('The wallet returned invalid capabilities.', 'INVALID_RESPONSE');
    for (const capability of ['transactionRequests', 'supportsPrivateFees', ...required]) {
      if (caps[capability] !== true) throw new SapientError(`This wallet account does not support ${capability}. Update Sapient or choose an account supporting private fees.`, 'UNSUPPORTED_CAPABILITY');
    }
    update({ network, capabilities: Object.freeze({ ...caps }) });
    return epoch;
  }
  function checkEpoch(epoch, signal) {
    assertAlive();
    if (signal?.aborted) throw abortError();
    if (generation !== epoch) throw new SapientError('The wallet connection changed. Reconnect and resume the pending request.', 'ACCOUNT_CHANGED');
  }
  function fail(error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    update({ status: snapshot.account ? 'error' : 'disconnected', error: normalized.message });
    return normalized;
  }

  async function pollPending(epoch, signal, validateResult) {
    const id = requestId;
    const deadline = Date.now() + requestTimeoutMs;
    while (Date.now() <= deadline) {
      checkEpoch(epoch, signal);
      const record = await call('tari_getTransactionRequest', { requestId: id });
      checkEpoch(epoch, signal);
      switch (record?.status) {
        case 'approved': {
          // Never retry an ambiguous submit. The wallet also atomically claims this same ID.
          if (!submitAttempted.has(id)) {
            submitAttempted.add(id);
            update({ status: 'submitting', error: null });
            try { await call('tari_submitTransactionRequest', { requestId: id }); }
            catch (error) { update({ status: 'confirming', error: `Submission response unavailable: ${error?.message || 'unknown response'}. Checking the existing request.` }); }
            checkEpoch(epoch, signal);
            continue; // The persisted wallet record is authoritative, including after a reload.
          }
          update({ status: 'confirming' });
          break;
        }
        case 'submitted': {
          if (!record.result || typeof record.result.transactionId !== 'string' || !record.result.transactionId) {
            throw new SapientError('The wallet reports submission but has no transaction receipt. Keep this request and inspect it in Sapient.', 'INVALID_RECEIPT');
          }
          const result = record.result;
          validateResult?.(result);
          setPending(null);
          submitAttempted.delete(id);
          update({ status: 'submitted', error: null });
          return result;
        }
        case 'rejected':
          setPending(null);
          submitAttempted.delete(id);
          throw new SapientError(record.error || 'The wallet request was rejected.', 'REJECTED');
        case 'failed':
          // Wallet failures can include an unknown network outcome. Never treat this as
          // proof that no spend occurred; retain the ID for inspection/reconciliation.
          throw new SapientError(`${record.error || 'The wallet marked the request failed.'} Inspect the existing request in Sapient before creating another transaction.`, 'TRANSACTION_FAILED');
        case 'pending':
          update({ status: 'awaiting-approval' });
          break;
        case 'submitting':
          update({ status: 'confirming' });
          break;
        default:
          throw new SapientError('The wallet returned an unknown request status. Keep the request ID and inspect Sapient before paying again.', 'INVALID_RESPONSE');
      }
      await delay(pollIntervalMs, signal);
    }
    throw new SapientError('Still waiting for Sapient. The request has been kept; resume it before creating another payment.', 'PENDING_TIMEOUT');
  }

  async function transact(operation, required, { signal } = {}, validateResult) {
    assertAlive();
    if (busy) throw new SapientError('A wallet action is already in progress.', 'BUSY');
    if (requestId) throw new SapientError('Resume the pending wallet request before creating another payment.', 'PENDING_REQUEST');
    busy = true;
    try {
      const epoch = await connection(required);
      checkEpoch(epoch, signal);
      // A lost create response leaves no ID to look up. Keep a privacy-safe marker first;
      // never open another spend request automatically after this ambiguous outcome.
      setPending(UNKNOWN_CREATE);
      const created = await call('tari_createTransactionRequest', operation);
      if (typeof created?.requestId !== 'string' || !created.requestId || created.requestId.length > 256) {
        throw new SapientError('The wallet did not return a request ID. Inspect Sapient before trying again.', 'INVALID_RESPONSE');
      }
      setPending(created.requestId);
      checkEpoch(epoch, signal);
      update({ status: 'awaiting-approval', error: null });
      return await pollPending(epoch, signal, validateResult);
    } catch (error) { throw fail(error); }
    finally { busy = false; }
  }

  const api = {
    getState: () => snapshot,
    subscribe(fn) {
      assertAlive();
      listeners.add(fn);
      fn(snapshot);
      return () => listeners.delete(fn);
    },
    async connect() {
      assertAlive();
      if (busy) throw new SapientError('A wallet action is already in progress.', 'BUSY');
      busy = true;
      update({ status: 'connecting', error: null });
      try {
        await resolveProvider();
        const epoch = generation;
        const accounts = await call('tari_requestAccounts');
        const [network, caps] = await Promise.all([call('tari_getNetwork'), call('tari_getCapabilities')]);
        checkEpoch(epoch);
        checkNetwork(network);
        if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !accounts[0]) throw new SapientError('Sapient did not return a connected account.', 'NOT_CONNECTED');
        if (!caps || typeof caps !== 'object') throw new SapientError('Sapient returned invalid capabilities.', 'INVALID_RESPONSE');
        update({ status: 'connected', account: accounts[0], network, capabilities: Object.freeze({ ...caps }), error: null });
        return snapshot;
      } catch (error) { invalidateConnection(); throw fail(error); }
      finally { busy = false; }
    },
    async disconnect() {
      assertAlive();
      // A disconnect cannot cancel a request already approved or submitted in the wallet.
      invalidateConnection();
      if (provider) await call('tari_disconnect');
    },
    /** Fail closed: the stock provider exposes htlcFund but does not forward the SDK's
     * private-source options. An unknown `source` property must never be invented here. */
    fundMilestone() {
      throw new SapientError('Stock Sapient funds native HTLCs from revealed balances. Private milestone funding is disabled until the wallet exposes verified private-source support.', 'PRIVATE_ESCROW_UNAVAILABLE');
    },
    /** Reveals the reviewer preimage to the wallet/indexer and on-chain during the claim. */
    claimMilestone({ resourceAddress, commitment, conditions, preimageHex, maxFee } = {}, options) {
      validateResource(resourceAddress);
      hex32(commitment, 'Locked output commitment');
      const conditionSnapshot = validateConditions(conditions);
      hex32(preimageHex, 'Reviewer preimage');
      validateFee(maxFee);
      return transact({ kind: 'htlcClaim', resourceAddress, commitment, conditions: conditionSnapshot, preimageHex, ...(maxFee === undefined ? {} : { maxFee }), feeType: 'private', enforceFeeType: true }, ['scriptPathSpend'], options);
    },
    refundMilestone({ resourceAddress, commitment, conditions, amount, outputMask, maxFee } = {}, options) {
      validateResource(resourceAddress);
      hex32(commitment, 'Locked output commitment');
      const conditionSnapshot = validateConditions(conditions);
      positiveUnits(amount, 'Refund amount');
      hex32(outputMask, 'Refund output mask');
      validateFee(maxFee);
      return transact({ kind: 'htlcRefund', resourceAddress, commitment, conditions: conditionSnapshot, amount, outputMask, ...(maxFee === undefined ? {} : { maxFee }), feeType: 'private', enforceFeeType: true }, ['scriptPathSpend'], options);
    },
    async resumePending({ signal } = {}) {
      assertAlive();
      if (busy) throw new SapientError('A wallet action is already in progress.', 'BUSY');
      if (!requestId) throw new SapientError('There is no pending wallet request to resume.', 'NO_PENDING_REQUEST');
      if (requestId === UNKNOWN_CREATE) throw new SapientError('The wallet request was created without a recoverable response. Inspect and reject any unsubmitted request in Sapient before explicitly clearing this local marker.', 'UNKNOWN_CREATE_OUTCOME');
      busy = true;
      try { return await pollPending(await connection(), signal); }
      catch (error) { throw fail(error); }
      finally { busy = false; }
    },
    clearPending() {
      assertAlive();
      if (busy) throw new SapientError('Wait for the active wallet action to finish.', 'BUSY');
      // This only forgets the local ID. It cannot cancel anything in the wallet or on-chain.
      setPending(null);
      update({ status: snapshot.account ? 'connected' : 'disconnected', error: null });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      unsubscribeProvider?.();
      target?.removeEventListener?.('tari#accountsChanged', windowAccountsChanged);
      listeners.clear();
      snapshot = Object.freeze({ ...snapshot, status: 'disposed', account: null, network: null, capabilities: null });
    },
  };
  return Object.freeze(api);
}
