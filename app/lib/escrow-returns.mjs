import { refreshEscrow } from './escrow-funding.mjs';
import { makePublicAction } from './stock-client.mjs';

const HOST = 'https://ootle-indexer-a.tari.com';
const KEY = 'ootleaccord.return.pending.v1';
const HEX = /^[a-f0-9]{64}$/;
const options = () => ({ credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(25000) });

/** The receipt secret stays in memory. Only public transaction identifiers are saved. */
export function createReturnClient({ storage = globalThis.sessionStorage, fetcher = globalThis.fetch, readEscrow = refreshEscrow, buildAction = makePublicAction } = {}) {
  let busy = false;
  let pending = null;
  try {
    const value = storage?.getItem(KEY);
    if (value) {
      const p = JSON.parse(value);
      if (!HEX.test(p.id) || !HEX.test(p.commitment) || !/^component_[a-f0-9]{64}$/.test(p.component)) throw new Error('Invalid return request');
      pending = Object.freeze({ id: p.id, commitment: p.commitment, component: p.component });
    }
  } catch { throw new Error('The saved return request could not be read. Reconcile it before making another return.'); }
  async function post(path, transaction) {
    const response = await fetcher(HOST + path, { ...options(), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction }) });
    const body = await response.json();
    if (!response.ok || body.error) throw new Error(body.error?.message || 'The indexer response was unavailable. Check the existing return before trying again.');
    return body;
  }
  async function check() {
    if (!pending) throw new Error('There is no return transaction to check.');
    const current = pending;
    const response = await fetcher(`${HOST}/transactions/${current.id}/result`, options());
    if (!response.ok) throw new Error('The return has not been located yet. Its transaction ID has been kept; check again later.');
    const body = await response.json();
    const final = body.result?.Finalized;
    if (!final || final.final_decision === null) return { status: 'pending', ...current };
    const diff = final.execution_result?.finalize?.result?.Accept;
    if (final.final_decision === 'Commit') {
      if (!diff?.up_substates?.some(([id]) => id === `utxo_${'01'.repeat(32)}_${current.commitment}`)) throw new Error('The committed receipt does not contain the expected private return. Keep this transaction ID for inspection.');
      storage?.removeItem(KEY); pending = null;
      return { status: 'committed', ...current };
    }
    if (typeof final.final_decision !== 'object' || !('Abort' in final.final_decision)) throw new Error('Unknown return outcome. Its transaction ID has been kept.');
    storage?.removeItem(KEY); pending = null;
    throw new Error('The return transaction was rejected. Refresh the escrow before making another attempt.');
  }
  return Object.freeze({
    getPending: () => pending,
    async submit(deployment, receipt, refundIndex) {
      if (busy || pending) throw new Error('Check the existing return transaction before creating another one.');
      busy = true;
      try {
        const state = await readEscrow(deployment);
        const allowed = refundIndex === null
          ? state.fullyFunded && state.approved && !state.expired && !state.paid
          : Number.isInteger(refundIndex) && state.expired && !state.paid && state.refunded[refundIndex] === false;
        if (!allowed) throw new Error(refundIndex === null ? 'Payout needs full funding and all required approvals before the deadline.' : 'This contribution is not eligible for a refund yet.');
        const dry = await buildAction(deployment, state, receipt, refundIndex, true);
        const simulation = await post('/transactions/dry-run', dry.transaction);
        if (!simulation.result?.finalize?.result?.Accept) throw new Error('The return did not pass the network check. No transaction was submitted.');
        const current = await readEscrow(deployment);
        if (current.version !== state.version || current.expired !== state.expired) throw new Error('The escrow changed. Refresh before returning funds.');
        const tx = await buildAction(deployment, current, receipt, refundIndex, false);
        if (!HEX.test(tx.transactionId) || !HEX.test(tx.returnCommitment)) throw new Error('The return builder produced an invalid identifier.');
        const request = Object.freeze({ id: tx.transactionId, commitment: tx.returnCommitment, component: deployment.component });
        if (!storage) throw new Error('Session storage is required to track a return safely.');
        storage.setItem(KEY, JSON.stringify(request));
        pending = request; // Save before broadcast; an ambiguous response must never cause a new return.
        const submitted = await post('/transactions', tx.transaction);
        if (submitted.transaction_id !== request.id) throw new Error('The indexer returned a different transaction ID. Check the saved return before continuing.');
        return await check();
      } finally { busy = false; }
    },
    async check() {
      if (busy) throw new Error('A return check is already in progress.');
      busy = true;
      try { return await check(); } finally { busy = false; }
    },
  });
}
