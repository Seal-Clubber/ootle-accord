import { SAPIENT_ESCROW_SCHEMA, fromRawAmount } from './accord.mjs';
import { contributionAmount } from './escrow-funding.mjs';
import { selectFundingCoins } from './stock-funding.mjs';

const FEE = '100000';
const working = state => ['connecting','awaiting-approval','submitting','confirming','restoring'].includes(state.status);

/** Private coin summaries and decrypted receipts live only in this closure. */
export function wireFundingCard({ card, wallet, returns, refresh, notify, activity }) {
  const { node, deployment } = card;
  const ui = name => node.querySelector(`[data-ui="${name}"]`);
  const stock = deployment.agreement.schema === SAPIENT_ESCROW_SCHEMA;
  let quote = null, busy = false, account = wallet.getState().account;
  let receipts = [];
  const message = (text, error = false, area = 'funding-status') => {
    ui(area).textContent = text; ui(area).classList.toggle('error-text', error);
  };
  const amount = () => contributionAmount(ui('contribution-amount').value.trim(), card.state);
  const pendingForCard = () => returns?.getPending()?.component === deployment.component;
  function update() {
    const state = card.state, session = wallet.getState();
    const closed = state.remainingUnits === '0' || state.paid || state.expired;
    const blocked = busy || working(session) || Boolean(session.requestId);
    ui('funding-check').hidden = !stock;
    ui('funding-check').disabled = closed || blocked;
    ui('funding-max').disabled = closed || busy;
    ui('contribution-amount').disabled = closed || busy;
    let valid = false;
    try { valid = quote?.amount === amount() && quote.expectedTotal === state.fundedUnits && quote.account === session.account; } catch { /* incomplete input */ }
    ui('funding-pay').disabled = closed || blocked || !valid;
    ui('funding-pay').hidden = !stock;
    ui('funding-prepare').disabled = closed || blocked;
    ui('returns-panel').hidden = !stock;
    ui('returns-find').disabled = blocked;
    ui('returns-check').hidden = !pendingForCard();
    ui('returns-check').disabled = blocked;
    for (const button of ui('returns-list').querySelectorAll('button')) button.disabled = blocked || Boolean(returns?.getPending()) || button.dataset.eligible !== 'true';
  }
  async function run(work, area = 'funding-status') {
    if (busy) return;
    busy = true; activity(1); update();
    try { await work(); }
    catch (error) { message(error?.message || 'This action could not be completed.', true, area); }
    finally { busy = false; activity(-1); update(); }
  }
  async function connected() { if (!wallet.getState().account) await wallet.connect(); }
  function clearQuote() { quote = null; ui('funding-prepare').hidden = true; update(); }
  async function inspect() {
    amount(); clearQuote(); await refresh();
    const value = amount();
    await connected();
    message('Checking private coins in Sapient…');
    const coins = await wallet.inspectFundingCoins();
    const selected = selectFundingCoins(coins, value, FEE);
    if (!selected.source) {
      ui('funding-prepare').hidden = coins.some(c => BigInt(c.amount) > BigInt(value) + BigInt(FEE)) ? false : true;
      ui('funding-prepare').textContent = 'Prepare ' + fromRawAmount(value) + ' tTARI in Sapient';
      message(selected.reason); return;
    }
    quote = { ...selected, amount: value, expectedTotal: card.state.fundedUnits, account: wallet.getState().account };
    message('Ready to fund ' + fromRawAmount(value) + ' tTARI. Sapient will ask you to approve the deposit.');
  }
  ui('funding-check').addEventListener('click', () => run(inspect));
  ui('contribution-amount').addEventListener('input', () => { clearQuote(); message('Check coins after choosing your amount.'); });
  ui('funding-max').addEventListener('click', () => { ui('contribution-amount').value = fromRawAmount(card.state.remainingUnits); clearQuote(); message('Check coins to fund the remaining ' + fromRawAmount(card.state.remainingUnits) + ' tTARI.'); });
  ui('funding-prepare').addEventListener('click', () => run(async () => {
    const value = amount(); clearQuote(); await connected();
    message('Approve the private transfer to yourself in Sapient. This prepares the exact contribution; it does not fund the accord yet.');
    const result = await wallet.prepareFundingCoin({ amount: value, maxFee: FEE });
    if (!result.registered) { message('Sapient submitted the preparation. Scan incoming payments in Sapient, then check coins here. Transaction: ' + result.transactionId); return; }
    await inspect();
  }));
  ui('funding-pay').addEventListener('click', () => run(async () => {
    const approved = quote;
    if (!approved || approved.amount !== amount() || approved.account !== wallet.getState().account) throw new Error('Check your coins and contribution again before paying.');
    clearQuote();
    message('Approve the contribution in Sapient. The amount is public; the deposit uses one-time keys.');
    const result = await wallet.fundEscrow({ deployment, amount: approved.amount, expectedTotal: approved.expectedTotal,
      sourceCommitment: approved.source.commitment, feeCommitment: approved.fee.commitment, maxFee: FEE });
    message('Sapient submitted the contribution. Checking the escrow…');
    try {
      await refresh();
      if (!card.live.receiptCommitments?.includes(result.receiptCommitment)) throw new Error('not yet indexed');
      message('Contribution confirmed. Your encrypted refund memo is recoverable in Sapient.');
      notify('Funded ' + fromRawAmount(approved.amount) + ' tTARI. The escrow balance is confirmed.');
    } catch { message('Sapient reports submission: ' + result.transactionId + '. Confirmation is still pending. Refresh the balance; do not submit this contribution again.'); }
  }));
  async function returnResult(result) {
    if (result.status !== 'committed') { message('Return submitted. Check its status before trying again. Transaction: ' + result.id, false, 'returns-status'); return; }
    await refresh();
    try { await wallet.registerPrivateReturn(result.commitment); message('Return confirmed and registered in Sapient.', false, 'returns-status'); }
    catch { message('Return confirmed. Scan incoming payments in Sapient to display it. Commitment: ' + result.commitment, false, 'returns-status'); }
    receipts = []; ui('returns-list').replaceChildren();
  }
  function showReturns() {
    ui('returns-list').replaceChildren();
    const state = card.state;
    for (const receipt of receipts) {
      const payout = receipt.index === null;
      const eligible = !state.paid && (payout ? state.fullyFunded && state.approved && !state.expired : state.expired && state.refunded[receipt.index] === false);
      const row = document.createElement('div'); row.className = 'return-row';
      const label = document.createElement('p'); label.textContent = fromRawAmount(receipt.binding.value) + ' tTARI · ' + (payout ? 'Creator payout' : 'Your contribution');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'button button-outline';
      button.textContent = payout ? state.paid ? 'Payout completed' : 'Receive payout in Sapient' : state.refunded[receipt.index] || state.paid ? 'Contribution resolved' : 'Refund to Sapient';
      button.dataset.eligible = String(eligible);
      button.addEventListener('click', () => run(async () => {
        await connected();
        message('Checking the fixed return destination and network eligibility…', false, 'returns-status');
        await returnResult(await returns.submit(deployment, receipt.receipt, receipt.index));
      }, 'returns-status'));
      row.append(label, button); ui('returns-list').append(row);
    }
    update();
  }
  ui('returns-find').addEventListener('click', () => run(async () => {
    if (!returns) throw new Error('Return tracking is unavailable in this browser.');
    await connected(); message('Reading your encrypted return memos in Sapient…', false, 'returns-status');
    const found = await wallet.loadReturnReceipts(deployment); await refresh(); receipts = found.receipts; showReturns();
    message(!receipts.length ? 'No return memos for this accord were found in the connected wallet.' : card.state.paid
      ? 'This accord has paid out. Its contributions are settled; no refund is due.' : card.state.expired
      ? 'Unpaid, unrefunded contributions can be returned to their fixed Sapient destinations.'
      : 'Your memos are recovered. Refunds open at chain epoch ' + deployment.agreement.milestones[0].refundEpoch + ' if the contribution remains unpaid. Creator payout requires full funding and the required approvals.', false, 'returns-status');
  }, 'returns-status'));
  ui('returns-check').addEventListener('click', () => run(async () => {
    await connected(); await returnResult(await returns.check());
  }, 'returns-status'));
  const unsubscribe = wallet.subscribe(session => {
    if (session.account !== account) {
      account = session.account; quote = null; receipts = []; ui('returns-list').replaceChildren(); ui('funding-prepare').hidden = true;
      message(''); message('', false, 'returns-status');
    }
    update();
  });
  return Object.freeze({
    render() {
      if (quote && quote.expectedTotal !== card.state.fundedUnits) { clearQuote(); message('The remaining amount changed. Check your contribution again.'); }
      ui('contribution-amount').max = fromRawAmount(card.state.remainingUnits);
      showReturns(); update();
    },
    dispose() { quote = null; receipts = []; unsubscribe(); },
  });
}
