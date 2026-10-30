// Provider contract: chironbuilds/tari-wallet/src/lib/messages.ts and
// docs/integration/provider-api.md. Wallet keys remain in Sapient. Explicit
// funding/return actions request private view access; no private data is persisted.
import { QUORUM_AGREEMENT_SCHEMA, ESCROW_AGREEMENT_SCHEMA, SAPIENT_ESCROW_SCHEMA, NATIVE_TARI_RESOURCE, validateAgreement, agreementId, rawUnits } from './accord.mjs';
import { cborReviewerIndex, cborSubmissionHash } from './review-args.mjs';
import { reviewerKeyFromWallet } from './wallet-address.mjs';
import { REVIEW_DEPLOYMENTS, REVIEW_DEPENDENCIES } from './review-deployments.mjs';
import { fundingCoins, selectFundingCoins, assertLivePrivateCoin } from './stock-funding.mjs';
import { makeFundingReturn, makeFundingArgs, restoreMemoReceipt } from './stock-client.mjs';
import { refreshEscrow, canApproveEscrow } from './escrow-funding.mjs';

const UINT64_MAX = (1n << 64n) - 1n;
const RESOURCE = /^resource_[a-f0-9]{64}$/i;
const PENDING_KEY = 'ootleaccord.sapient.pending.v1';
const UNKNOWN_CREATE = 'ootleaccord:unknown-create-outcome';

/** Checked against the actual provider call, not just the SDK's broader capabilities. */
export const SAPIENT_PRIVACY_REPORT = Object.freeze({
  // Native HTLC funding is a different protocol; it remains disabled here.
  fundingSource: 'revealed',
  privateFundingSupported: false,
  stockEscrowFundingSupported: true,
  stockEscrowAmountVisibility: 'public',
  stockEscrowDepositIdentity: 'one-time keys',
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

function reviewInputs(network, component) {
  return [component, ...(REVIEW_DEPENDENCIES[network]?.[component] ?? [])]
    .map(substate_id => ({ substate_id, version: null }));
}

function isSpentNativeInput(error) {
  // Review calls carry no donor inputs. A spent native-TARI UTXO here belongs
  // to the wallet-built fee lane. Do not classify a bare 404 or a wrong network.
  return new RegExp(`Input substate utxo_${'01'.repeat(32)}_[a-f0-9]{64} \\(v[0-9]+\\) is down\\b`, 'i')
    .test(error?.message ?? '');
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
 * restoreConnection() only reads an existing origin grant; it never prompts or signs.
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
  restoreTimeoutMs = 5000,
  fundingCrypto = { makeFundingReturn, makeFundingArgs },
  escrowReader = refreshEscrow,
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
  let restorePromise = null;
  let disconnectPromise = null;
  let allowRestore = true;
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
  async function call(method, params) {
    try {
      return await provider.request(params === undefined ? { method } : { method, params });
    } catch (error) {
      // EIP-1193 providers may reject with a plain { code, message } object.
      // Preserve that message and the failing provider method; String(object)
      // would otherwise hide the useful error behind "[object Object]".
      const message = typeof error?.message === 'string' && error.message ? error.message : String(error);
      const providerCode = typeof error?.code === 'number' || typeof error?.code === 'string' ? error.code : null;
      const unsupported = (providerCode === 4200 || providerCode === -32601) &&
        (message === `Unsupported method: ${method}` || message === `Unknown method: ${method}`);
      const details = `Sapient ${method}${providerCode === null ? '' : ` (${providerCode})`}: ${message}`;
      const normalized = new SapientError(unsupported ? `${details}. Update Sapient and reload this page; this wallet API method is unavailable.` : details,
        unsupported ? 'WALLET_METHOD_UNAVAILABLE' : 'WALLET_REQUEST_FAILED', error);
      normalized.providerMethod = method;
      normalized.providerCode = providerCode;
      throw normalized;
    }
  }
  function checkNetwork(network) {
    if (network !== expectedNetwork) throw new SapientError(`Switch Sapient to ${expectedNetwork}. Current network: ${String(network)}.`, 'WRONG_NETWORK');
  }
  async function connection(required = [], requirePrivateFees = true) {
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
    for (const capability of [...(requirePrivateFees ? ['transactionRequests', 'supportsPrivateFees'] : []), ...required]) {
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
          throw new SapientError(`${record.error || 'The wallet marked the request failed.'} A failed request cannot be resumed. Check it in Sapient, then use Clear failed request to make a new approval.`, 'TRANSACTION_FAILED');
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

  async function transact(operation, required, { signal, expectedGeneration } = {}, validateResult) {
    assertAlive();
    if (restorePromise) await restorePromise;
    assertAlive();
    if (expectedGeneration !== undefined) checkEpoch(expectedGeneration, signal);
    if (busy) throw new SapientError('A wallet action is already in progress.', 'BUSY');
    if (requestId) throw new SapientError('A previous Sapient request needs attention. Resume it if it is still pending, or use Clear failed request after checking that Sapient marks it failed or rejected.', 'PENDING_REQUEST');
    busy = true;
    try {
      const epoch = await connection(required);
      if (expectedGeneration !== undefined) checkEpoch(expectedGeneration, signal);
      checkEpoch(epoch, signal);
      // A lost create response leaves no ID to look up. Keep a privacy-safe marker first;
      // never open another spend request automatically after this ambiguous outcome.
      setPending(UNKNOWN_CREATE);
      let created;
      try { created = await call('tari_createTransactionRequest', operation); }
      catch (error) {
        // A confirmed unsupported create method cannot have created a request.
        // Every ambiguous error still retains the duplicate-spend guard.
        if (error.code === 'WALLET_METHOD_UNAVAILABLE' && error.providerMethod === 'tari_createTransactionRequest') setPending(null);
        throw error;
      }
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
    restoreConnection() {
      assertAlive();
      if (restorePromise) return restorePromise;
      if (busy || !allowRestore) return Promise.resolve(snapshot);
      busy = true;
      const epoch = generation;
      const previousAccount = snapshot.account;
      if (!previousAccount) update({ status: 'restoring', error: null });
      const lookup = (async () => {
        try {
          await resolveProvider();
          checkEpoch(epoch);
          // Passive lookup: never substitute tari_requestAccounts here.
          const accounts = await call('tari_getAccounts');
          checkEpoch(epoch);
          if (!Array.isArray(accounts)) throw new SapientError('Sapient returned invalid connected accounts.', 'INVALID_RESPONSE');
          if (!accounts.length) { invalidateConnection(); return snapshot; }
          if (typeof accounts[0] !== 'string' || !accounts[0]) throw new SapientError('Sapient returned an invalid connected account.', 'INVALID_RESPONSE');
          if (previousAccount && !accounts.includes(previousAccount)) {
            invalidateConnection();
            return snapshot;
          }
          const [network, caps] = await Promise.all([call('tari_getNetwork'), call('tari_getCapabilities')]);
          checkEpoch(epoch);
          checkNetwork(network);
          if (!caps || typeof caps !== 'object') throw new SapientError('Sapient returned invalid capabilities.', 'INVALID_RESPONSE');
          update({ status: 'connected', account: previousAccount || accounts[0], network, capabilities: Object.freeze({ ...caps }), error: null });
          return snapshot;
        } catch (error) {
          // A disconnect, account-change event or disposal wins over an older lookup.
          if (disposed || generation !== epoch) return snapshot;
          invalidateConnection();
          if (error?.code !== 'NO_PROVIDER') fail(error);
          return snapshot;
        }
      })();
      let timer;
      const timeout = new Promise(resolve => {
        timer = setTimeout(() => {
          if (!disposed && generation === epoch) {
            invalidateConnection();
            update({ error: 'Sapient did not respond to the connection check. Unlock or reconnect the wallet.' });
          }
          resolve(snapshot);
        }, restoreTimeoutMs);
      });
      restorePromise = Promise.race([lookup, timeout]).finally(() => {
        clearTimeout(timer);
        busy = false;
        restorePromise = null;
      });
      return restorePromise;
    },
    async connect() {
      assertAlive();
      // A user's Connect click can arrive while the startup lookup is still waiting
      // for injection. Finish that passive lookup before requesting permission.
      if (restorePromise) await restorePromise;
      if (disconnectPromise) await disconnectPromise;
      assertAlive();
      if (busy) throw new SapientError('A wallet action is already in progress.', 'BUSY');
      busy = true;
      update({ status: 'connecting', error: null });
      const epoch = generation;
      try {
        await resolveProvider();
        checkEpoch(epoch);
        const accounts = await call('tari_requestAccounts');
        const [network, caps] = await Promise.all([call('tari_getNetwork'), call('tari_getCapabilities')]);
        checkEpoch(epoch);
        checkNetwork(network);
        if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !accounts[0]) throw new SapientError('Sapient did not return a connected account.', 'NOT_CONNECTED');
        if (!caps || typeof caps !== 'object') throw new SapientError('Sapient returned invalid capabilities.', 'INVALID_RESPONSE');
        allowRestore = true;
        update({ status: 'connected', account: accounts[0], network, capabilities: Object.freeze({ ...caps }), error: null });
        return snapshot;
      } catch (error) { invalidateConnection(); throw fail(error); }
      finally { busy = false; }
    },
    async disconnect() {
      assertAlive();
      if (disconnectPromise) return disconnectPromise;
      allowRestore = false;
      // A disconnect cannot cancel a request already approved or submitted in the wallet.
      invalidateConnection();
      disconnectPromise = (async () => { if (provider) await call('tari_disconnect'); })().finally(() => { disconnectPromise = null; });
      return disconnectPromise;
    },
    /** Fail closed: the stock provider exposes htlcFund but does not forward the SDK's
     * private-source options. An unknown `source` property must never be invented here. */
    fundMilestone() {
      throw new SapientError('Stock Sapient funds native HTLCs from revealed balances. Private milestone funding is disabled until the wallet exposes verified private-source support.', 'PRIVATE_ESCROW_UNAVAILABLE');
    },
    /** Explicit, separate read grant. Coin summaries stay in memory on this page. */
    async inspectFundingCoins() {
      assertAlive();
      if (restorePromise) await restorePromise;
      if (busy || requestId) throw new SapientError('Finish the existing wallet request before reading funding coins.', 'BUSY');
      busy = true;
      try {
        const epoch = await connection(['privateBalanceView', 'stealthRedeemPrivateFee', 'walletAddress']);
        let grant = await call('tari_getViewAccess');
        if (grant?.granted !== true) grant = await call('tari_requestViewAccess');
        checkEpoch(epoch);
        if (grant?.granted !== true) throw new SapientError('Reading private coins was declined. No payment was created.', 'VIEW_ACCESS_DECLINED');
        const records = await call('tari_getShieldedOutputs', { resourceAddress: NATIVE_TARI_RESOURCE });
        checkEpoch(epoch);
        const coins = fundingCoins(records);
        const live = [];
        // Bound liveness reads. A transient failure excludes a coin only from
        // this quote; never mark a private holding spent based on a read error.
        for (const coin of coins.slice(0, 64)) {
          try {
            const publicKey = assertLivePrivateCoin(await call('tari_getSubstate', { substateId: `utxo_${NATIVE_TARI_RESOURCE.slice(9)}_${coin.commitment}` }));
            live.push(Object.freeze({ ...coin, publicKey }));
          } catch { /* unreadable, non-key or spent: don't select it */ }
          checkEpoch(epoch);
        }
        return Object.freeze(live);
      } catch (error) { throw fail(error); }
      finally { busy = false; }
    },
    async prepareFundingCoin({ amount, maxFee = '100000' } = {}, options) {
      positiveUnits(amount, 'Contribution'); validateFee(maxFee);
      if (!snapshot.account) throw new SapientError('Connect Sapient first.', 'NOT_CONNECTED');
      const epoch = await connection(['privateSpend', 'walletAddress']);
      const address = await call('tari_getWalletAddress');
      reviewerKeyFromWallet(address);
      checkEpoch(epoch, options?.signal);
      const result = await transact({ kind: 'sendPrivately', resourceAddress: NATIVE_TARI_RESOURCE,
        recipientWalletAddress: address, amount, maxFee, minimumValuePromise: '0',
        feeType: 'private', enforceFeeType: true }, ['privateSpend','walletAddress'], { ...options, expectedGeneration: epoch }, result => {
        hex32(result.recipientCommitment, 'Prepared coin commitment');
      });
      // A transfer to yourself must be registered as an incoming private coin.
      // Bookkeeping failure is not a failed payment and must never cause a resend.
      let registered = false;
      try { checkEpoch(epoch); await call('tari_claimPrivatePayment', { resourceAddress: NATIVE_TARI_RESOURCE, commitment: result.recipientCommitment }); registered = true; }
      catch { /* wallet scan can recover it; preserve the successful receipt */ }
      return Object.freeze({ ...result, registered });
    },
    async fundEscrow({ deployment, amount, expectedTotal, sourceCommitment, feeCommitment, maxFee = '100000' } = {}, options) {
      assertAlive();
      if (restorePromise) await restorePromise;
      if (!snapshot.account) throw new SapientError('Connect Sapient first.', 'NOT_CONNECTED');
      const operationGeneration = generation;
      const terms = validateAgreement(deployment?.agreement);
      if (terms.schema !== SAPIENT_ESCROW_SCHEMA || terms.milestones.length !== 1) throw new SapientError('This escrow does not support stock Sapient deposits.', 'UNSUPPORTED_FUNDING_PROTOCOL');
      const id = await agreementId(terms);
      const stage = terms.milestones[0];
      if (id !== deployment.agreementId || REVIEW_DEPLOYMENTS[expectedNetwork]?.[`${id}:${stage.id}`] !== deployment.component) throw new SapientError('This escrow is not deployed and verified.', 'FUNDING_NOT_DEPLOYED');
      positiveUnits(amount, 'Contribution'); validateFee(maxFee);
      rawUnits(expectedTotal, 'Funding counter', { allowZero: true });
      hex32(sourceCommitment, 'Contribution coin'); hex32(feeCommitment, 'Fee coin');
      if (sourceCommitment === feeCommitment) throw new SapientError('Contribution and fee must use different private coins.', 'INVALID_FUNDING_COINS');
      const state = await escrowReader(deployment);
      checkEpoch(operationGeneration, options?.signal);
      if (state.paid || state.expired || state.fundedUnits !== expectedTotal || BigInt(amount) > BigInt(state.remainingUnits) || BigInt(state.remainingUnits) === 0n) throw new SapientError('Funding changed or closed. Refresh the remaining amount before paying.', 'FUNDING_CHANGED');
      const coins = await api.inspectFundingCoins();
      checkEpoch(operationGeneration, options?.signal);
      const selected = selectFundingCoins(coins, amount, maxFee);
      // Check the specific approved choices, rather than silently substitute coins.
      const source = coins.find(c => c.commitment === sourceCommitment);
      const fee = coins.find(c => c.commitment === feeCommitment);
      if (!selected.source || source?.amount !== amount || !fee || BigInt(fee.amount) <= BigInt(maxFee)) throw new SapientError(selected.reason || 'Selected private coins changed. Refresh before paying.', 'INVALID_FUNDING_COINS');
      const epoch = await connection(['stealthRedeemPrivateFee','walletAddress']);
      const address = await call('tari_getWalletAddress'); reviewerKeyFromWallet(address);
      checkEpoch(epoch, options?.signal);
      const note = await fundingCrypto.makeFundingReturn(address, amount);
      const payload = await fundingCrypto.makeFundingArgs(note, expectedTotal, address, amount, id, source.publicKey);
      checkEpoch(epoch, options?.signal);
      const result = await transact({ kind: 'redeemStealthOutputWithPrivateFee', resourceAddress: NATIVE_TARI_RESOURCE,
        commitmentHex: sourceCommitment, revealedAmount: amount,
        followUpInstructions: [{ CallMethod: { call: { Address: deployment.component }, method: 'fund', args: payload.args } }],
        feeResourceAddress: NATIVE_TARI_RESOURCE, feeCommitmentHex: feeCommitment, maxFee,
        relatedComponents: [deployment.component] }, ['stealthRedeemPrivateFee'], { ...options, expectedGeneration: operationGeneration }, result => {
          hex32(result.transactionId, 'Funding transaction'); hex32(result.feeChangeCommitment, 'Private fee change');
        });
      let feeChangeRegistered = false;
      try { checkEpoch(epoch); await call('tari_claimPrivatePayment', { resourceAddress: NATIVE_TARI_RESOURCE, commitment: result.feeChangeCommitment }); feeChangeRegistered = true; }
      catch { /* the successful funding receipt remains authoritative */ }
      let receiptRegistered = false;
      try { checkEpoch(epoch); await call('tari_claimPrivatePayment', { resourceAddress: NATIVE_TARI_RESOURCE, commitment: payload.receiptCommitment }); receiptRegistered = true; }
      catch { /* The live zero-value receipt remains recoverable from the chain. */ }
      return Object.freeze({ ...result, receiptCommitment: payload.receiptCommitment, feeChangeRegistered, receiptRegistered });
    },
    async loadReturnReceipts(deployment) {
      assertAlive(); if (restorePromise) await restorePromise;
      if (busy || requestId) throw new SapientError('Finish the existing wallet request before reading return memos.', 'BUSY');
      const id = await agreementId(deployment?.agreement);
      const stage = deployment.agreement.milestones[0];
      if (deployment.agreement.schema !== SAPIENT_ESCROW_SCHEMA || id !== deployment.agreementId || REVIEW_DEPLOYMENTS[expectedNetwork]?.[`${id}:${stage.id}`] !== deployment.component) throw new SapientError('This escrow is not verified.', 'FUNDING_NOT_DEPLOYED');
      busy = true;
      try {
        const epoch = await connection(['privateBalanceView','walletAddress'], false);
        let grant = await call('tari_getViewAccess'); if (grant?.granted !== true) grant = await call('tari_requestViewAccess');
        checkEpoch(epoch); if (grant?.granted !== true) throw new SapientError('Memo access was declined.', 'VIEW_ACCESS_DECLINED');
        const chain = await escrowReader(deployment); checkEpoch(epoch);
        for (const commitment of [chain.payoutReceiptCommitment,...chain.receiptCommitments]) {
          try { await call('tari_claimPrivatePayment', { resourceAddress: NATIVE_TARI_RESOURCE, commitment }); }
          catch { /* Already known, foreign or unreadable: never submit a transaction. */ }
          checkEpoch(epoch);
        }
        const address = await call('tari_getWalletAddress'); reviewerKeyFromWallet(address); checkEpoch(epoch);
        const records = await call('tari_getShieldedOutputs', { resourceAddress: NATIVE_TARI_RESOURCE }); checkEpoch(epoch);
        if (!Array.isArray(records) || records.length > 512) throw new SapientError('Invalid private memo list.', 'INVALID_RESPONSE');
        const receipts = [];
        for (const record of records) {
          if (record.amount !== '0' || typeof record.memo !== 'string' || !record.memo.startsWith('ootleaccord:v5:') || record.memo.length > 253) continue;
          try {
            const restored = await restoreMemoReceipt(record.memo,address,id); checkEpoch(epoch);
            const binding = restored.binding;
            const index = restored.kind === 'payout' ? null : chain.refundBindings.findIndex(b => b.key === binding.key && b.nonce === binding.nonce && b.value === binding.value);
            const expected = index === null ? chain.payoutBinding : chain.refundBindings[index];
            if (expected && expected.key === binding.key && expected.nonce === binding.nonce && expected.value === binding.value) receipts.push(Object.freeze({ ...restored, index }));
          } catch { /* A different or malformed memo does not authorize a return. */ }
        }
        checkEpoch(epoch);
        return Object.freeze({ state: chain, receipts: Object.freeze(receipts) });
      } catch (error) { throw fail(error); }
      finally { busy = false; }
    },
    async registerPrivateReturn(commitment) {
      hex32(commitment, 'Private return commitment');
      if (busy || requestId) throw new SapientError('Finish the existing wallet request first.', 'BUSY');
      busy = true;
      try {
        const epoch = await connection(['privateBalanceView'], false);
        const grant = await call('tari_getViewAccess'); checkEpoch(epoch);
        if (grant?.granted !== true) throw new SapientError('Grant memo access before registering a return.', 'VIEW_ACCESS_DECLINED');
        const result = await call('tari_claimPrivatePayment', { resourceAddress: NATIVE_TARI_RESOURCE, commitment });
        checkEpoch(epoch); return result;
      } finally { busy = false; }
    },
    async getReviewerIdentity() {
      assertAlive();
      if (restorePromise) await restorePromise;
      assertAlive();
      if (busy) throw new SapientError('A wallet action is already in progress.', 'BUSY');
      busy = true;
      try {
        const epoch = await connection(['walletAddress'], false);
        const walletAddress = await call('tari_getWalletAddress');
        checkEpoch(epoch);
        return Object.freeze({ walletAddress, publicKey: reviewerKeyFromWallet(walletAddress) });
      } catch (error) { throw fail(error); }
      finally { busy = false; }
    },
    async approveMilestone({ agreement, deployment, stageId, submissionHash, maxFee } = {}, options) {
      const approvalGeneration = generation;
      const terms = validateAgreement(agreement);
      if (![QUORUM_AGREEMENT_SCHEMA, ESCROW_AGREEMENT_SCHEMA, SAPIENT_ESCROW_SCHEMA].includes(terms.schema)) throw new SapientError('Open a percentage-quorum agreement.', 'UNSUPPORTED_REVIEW_PROTOCOL');
      const stage = terms.milestones.find(item => item.id === stageId);
      if (!stage) throw new SapientError('Choose a milestone from this agreement.', 'INVALID_STAGE');
      const hashArg = cborSubmissionHash(submissionHash);
      validateFee(maxFee);
      const id = await agreementId(terms);
      const component = REVIEW_DEPLOYMENTS[expectedNetwork]?.[`${id}:${stageId}`];
      if (!component) throw new SapientError('The wallet approval contract for this milestone has not been deployed and verified. No approval transaction was created.', 'REVIEW_NOT_DEPLOYED');
      const identity = await api.getReviewerIdentity();
      const index = stage.reviewers.findIndex(reviewer => reviewer.publicKey === identity.publicKey);
      if (index < 0) throw new SapientError('Connect one of the designated reviewer wallets.', 'WRONG_REVIEWER');
      if (terms.schema === SAPIENT_ESCROW_SCHEMA) {
        if (deployment?.component !== component || deployment?.agreementId !== id || await agreementId(deployment.agreement) !== id) throw new SapientError('Open the verified escrow before approving.', 'REVIEW_NOT_DEPLOYED');
        const live = await escrowReader(deployment);
        checkEpoch(approvalGeneration, options?.signal);
        if (live.paid) throw new SapientError('The payout is already complete. No approval transaction was created.', 'ALREADY_PAID');
        if (live.votes?.[index] === true) throw new SapientError('Your approval is already recorded. No additional wallet request or fee is needed.', 'ALREADY_APPROVED');
        if (!canApproveEscrow(live, submissionHash, index)) throw new SapientError('This work is not ready for another approval. Refresh the accord first.', 'REVIEW_NOT_READY');
      }
      try {
        return await transact({ kind: 'instructions', instructions: [{ CallMethod: { call: { Address: component }, method: 'approve', args: [cborReviewerIndex(index), hashArg] } }], inputs: reviewInputs(expectedNetwork, component), ...(maxFee === undefined ? {} : { maxFee }), feeType: 'private', enforceFeeType: true }, [], { ...options, expectedGeneration: approvalGeneration });
      } catch (error) {
        if (!isSpentNativeInput(error)) throw error;
        throw fail(new SapientError('Sapient tried to use an already-spent private tTARI output for the approval fee.\n\nOpen Sapient’s home screen and let its private-coin refresh finish. Check the failed request in Sapient, then use Clear failed request before approving again. If the same error remains, update Sapient.\n\nWallet details: ' + error.message, 'SPENT_PRIVATE_FEE_INPUT', error));
      }
    },
    async submitWork({ agreement, stageId, submissionHash, maxFee } = {}, options) {
      const terms = validateAgreement(agreement);
      if (![QUORUM_AGREEMENT_SCHEMA, ESCROW_AGREEMENT_SCHEMA, SAPIENT_ESCROW_SCHEMA].includes(terms.schema)) throw new SapientError('Open a percentage-quorum agreement.', 'UNSUPPORTED_REVIEW_PROTOCOL');
      const hashArg = cborSubmissionHash(submissionHash);
      validateFee(maxFee);
      if (!terms.milestones.some(stage => stage.id === stageId)) throw new SapientError('Choose a milestone from this agreement.', 'INVALID_STAGE');
      const id = await agreementId(terms);
      const component = REVIEW_DEPLOYMENTS[expectedNetwork]?.[`${id}:${stageId}`];
      if (!component) throw new SapientError('This milestone has no verified deployment. No transaction was created.', 'REVIEW_NOT_DEPLOYED');
      const identity = await api.getReviewerIdentity();
      if (identity.publicKey !== reviewerKeyFromWallet(terms.creatorWalletAddress)) throw new SapientError('Connect the project creator’s wallet.', 'WRONG_CREATOR');
      return transact({ kind: 'instructions', instructions: [{ CallMethod: { call: { Address: component }, method: 'submit_work', args: [hashArg] } }], inputs: reviewInputs(expectedNetwork, component), ...(maxFee === undefined ? {} : { maxFee }), feeType: 'private', enforceFeeType: true }, [], options);
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
      if (restorePromise) await restorePromise;
      assertAlive();
      if (busy) throw new SapientError('A wallet action is already in progress.', 'BUSY');
      if (!requestId) throw new SapientError('There is no pending wallet request to resume.', 'NO_PENDING_REQUEST');
      if (requestId === UNKNOWN_CREATE) throw new SapientError('The wallet request was created without a recoverable response. Inspect and reject any unsubmitted request in Sapient before explicitly clearing this local marker.', 'UNKNOWN_CREATE_OUTCOME');
      busy = true;
      try { return await pollPending(await connection(), signal); }
      catch (error) { throw fail(error); }
      finally { busy = false; }
    },
    async dismissFailedRequest({ confirmed = false } = {}) {
      assertAlive();
      if (restorePromise) await restorePromise;
      assertAlive();
      if (busy) throw new SapientError('Wait for the active wallet action to finish.', 'BUSY');
      if (confirmed !== true) throw new SapientError('Check the previous request in Sapient and confirm that it failed or was rejected.', 'RECONCILIATION_REQUIRED');
      if (!requestId) throw new SapientError('There is no previous request to clear.', 'NO_PENDING_REQUEST');
      if (requestId === UNKNOWN_CREATE) throw new SapientError('The previous request has no recoverable ID. Inspect Sapient and use the manual reconciliation controls in its app panel.', 'UNKNOWN_CREATE_OUTCOME');
      const id = requestId;
      busy = true;
      try {
        // Read-only status check. This does not require private fee coins,
        // request private view access, or resubmit the old transaction.
        const epoch = await connection([], false);
        const record = await call('tari_getTransactionRequest', { requestId: id });
        checkEpoch(epoch);
        if (requestId !== id) throw new SapientError('The previous request changed. Inspect it again.', 'REQUEST_CHANGED');
        if (record?.status !== 'failed' && record?.status !== 'rejected') {
          throw new SapientError('Sapient has not confirmed this request as failed or rejected. Keep its ID and use Resume request to inspect its outcome.', 'REQUEST_NOT_FAILED');
        }
        // The user has reconciled the outcome and the wallet confirms a terminal
        // status. Forget only our ID; never imply cancellation or submit again.
        setPending(null);
        submitAttempted.delete(id);
        update({ status: snapshot.account ? 'connected' : 'disconnected', error: null });
        return Object.freeze({ cleared: true, previousStatus: record.status });
      } catch (error) { throw fail(error); }
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
