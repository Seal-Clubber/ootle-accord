import { networkConfig } from './networks.mjs';
import { SAPIENT_ESCROW_SCHEMA, fromRawAmount } from './accord.mjs';
import { contributionAmount } from './escrow-funding.mjs';
import { selectFundingCoins } from './stock-funding.mjs';

const FEE = '100000';
const working = state => ['connecting','awaiting-approval','submitting','confirming','restoring'].includes(state.status);

/** Private coin summaries and decrypted receipts live only in this closure. */
export function wireFundingCard({ card, wallet, returns, refresh, notify, activity, openWallet }) {
  const { node, deployment } = card;
  const network = deployment.agreement.network;
  const unit = networkConfig(network).unit;
  const ui = name => node.querySelector(`[data-ui="${name}"]`);
  const stock = deployment.agreement.schema === SAPIENT_ESCROW_SCHEMA;
  const actions = Object.fromEntries(['check', 'prepare', 'pay', 'confirm', 'again', 'recover'].map(name => [name, ui('funding-' + name)]));
  let quote = null, busy = false, account = wallet.getState().account;
  let next = 'check', balanceChecked = false, preparationStatus = 'If needed', preparedAmount = null, payment = null;
  let receipts = [];
  const message = (text, error = false, area = 'funding-status') => {
    ui(area).textContent = text; ui(area).classList.toggle('error-text', error);
  };
  const amount = () => contributionAmount(ui('contribution-amount').value.trim(), card.state, network);
  const pendingForCard = () => returns?.getPending()?.component === deployment.component;
  function step(name, status, current = false) {
    const item = ui('funding-step-' + name);
    const label = item.querySelector('[data-step-status]');
    label.textContent = status;
    label.hidden = !status;
    if (current) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  }
  function update() {
    const state = card.state, session = wallet.getState();
    const closed = deployment.archivedOnReset || state.remainingUnits === '0' || state.paid || state.expired;
    const blocked = busy || working(session) || Boolean(session.requestId);
    const active = session.requestId && !busy ? 'recover' : next;
    const finishing = next === 'confirm' || next === 'again';
    ui('funding-amount-fields').hidden = finishing;
    ui('funding-intro').hidden = finishing;
    ui('funding-max').disabled = closed || blocked;
    ui('contribution-amount').disabled = closed || blocked;
    for (const [name, button] of Object.entries(actions)) {
      button.hidden = !stock || active !== name || (closed && name !== 'confirm' && name !== 'recover');
      button.disabled = name === 'recover' ? busy : blocked;
    }
    step('access', balanceChecked ? 'Done' : '', next === 'check' && !balanceChecked);
    step('prepare', preparationStatus, next === 'prepare');
    step('deposit', next === 'again' ? 'Confirmed' : next === 'confirm' ? 'Submitted' : '', next === 'pay' || next === 'confirm');
    ui('returns-panel').hidden = !stock || deployment.archivedOnReset;
    ui('returns-find').disabled = blocked;
    ui('returns-check').hidden = !pendingForCard();
    ui('returns-check').disabled = blocked;
    for (const button of ui('returns-list').querySelectorAll('button')) button.disabled = blocked || Boolean(returns?.getPending()) || button.dataset.eligible !== 'true';
  }
  async function run(work, area = 'funding-status') {
    if (busy) return;
    const focused = document.activeElement;
    busy = true; activity(1); update();
    try { await work(); }
    catch (error) { message(error?.message || 'This action could not be completed.', true, area); }
    finally {
      busy = false; activity(-1); update();
      if (Object.values(actions).includes(focused) && (!document.activeElement || document.activeElement === document.body || document.activeElement === focused)) {
        Object.values(actions).find(button => !button.hidden && !button.disabled)?.focus();
      }
    }
  }
  async function connected() { if (!wallet.getState().account) await wallet.connect(); }
  function resetPlan(text = '') {
    quote = null;
    balanceChecked = false;
    preparationStatus = 'If needed';
    next = 'check';
    message(text);
    update();
  }
  async function inspect() {
    amount();
    quote = null;
    await refresh();
    const value = amount();
    if (!wallet.getState().account) message('Connect Sapient to continue.');
    await connected();
    message('Allow Sapient to share your private coin amounts with this tab if prompted.');
    const coins = await wallet.inspectFundingCoins();
    const selected = selectFundingCoins(coins, value, FEE);
    const exact = coins.some(coin => coin.amount === value);
    const display = fromRawAmount(value) + ` ${unit}`;
    balanceChecked = true;
    preparationStatus = preparedAmount === value ? 'Done' : exact ? 'Already prepared' : 'If needed';
    if (!selected.source) {
      const canPrepare = !exact && coins.some(coin => BigInt(coin.amount) > BigInt(value) + BigInt(FEE));
      next = canPrepare ? 'prepare' : 'check';
      if (canPrepare) preparationStatus = '';
      actions.prepare.textContent = `Prepare ${display} in Sapient`;
      message(canPrepare ? `Approve a private transfer of ${display} to your own wallet to prepare the deposit.` : exact
        ? `Sapient needs a separate private coin larger than 0.1 ${unit} for the deposit fee. Check again once it’s available.`
        : `Sapient needs a private coin large enough to prepare ${display} and cover fees. Check again once it’s available.`);
      return;
    }
    quote = { ...selected, amount: value, expectedTotal: card.state.fundedUnits, account: wallet.getState().account };
    next = 'pay';
    actions.pay.textContent = `Fund ${display} in Sapient`;
    message('Your deposit is ready. The contribution amount will be public.');
  }
  function confirmPayment() {
    if (next !== 'confirm' || !card.live?.receiptCommitments?.includes(payment.receiptCommitment)) return false;
    next = 'again';
    const display = fromRawAmount(payment.amount) + ` ${unit}`;
    message(`Your ${display} contribution is confirmed. Find your encrypted refund memo in Sapient.`);
    if (ui('funding-panel').hidden || node.closest('[hidden]')) notify(`Funded ${display}.`);
    return true;
  }
  async function checkPayment() {
    message('Deposit submitted. Checking the escrow…');
    try { await refresh(); } catch { /* Indexing can lag. Keep this confirmation step available. */ }
    if (next === 'confirm' && !confirmPayment()) {
      message(`Waiting for confirmation. Check again here or look up the transaction in Sapient. ${payment.transactionId}`);
    }
  }
  ui('funding-check').addEventListener('click', () => run(inspect));
  ui('contribution-amount').addEventListener('input', () => resetPlan());
  ui('funding-max').addEventListener('click', () => { ui('contribution-amount').value = fromRawAmount(card.state.remainingUnits); resetPlan(); });
  ui('funding-prepare').addEventListener('click', () => run(async () => {
    const value = amount();
    await refresh();
    if (value !== amount()) throw new Error('Check the contribution amount again.');
    await connected();
    message('Approve the private transfer to your own wallet in Sapient.');
    const result = await wallet.prepareFundingCoin({ amount: value, maxFee: FEE });
    preparedAmount = value;
    preparationStatus = 'Done';
    next = 'check';
    if (!result.registered) { message('Preparation submitted. Scan incoming payments in Sapient, then check your balance here.'); return; }
    await inspect();
  }));
  ui('funding-pay').addEventListener('click', () => run(async () => {
    const approved = quote;
    if (!approved || approved.amount !== amount() || approved.expectedTotal !== card.state.fundedUnits || approved.account !== wallet.getState().account) {
      resetPlan('Check your balance again before funding.');
      return;
    }
    quote = null;
    message('Approve the final deposit in Sapient.');
    try {
      const result = await wallet.fundEscrow({ deployment, amount: approved.amount, expectedTotal: approved.expectedTotal,
        sourceCommitment: approved.source.commitment, feeCommitment: approved.fee.commitment, maxFee: FEE });
      payment = { ...result, amount: approved.amount };
      next = 'confirm';
    } catch (error) {
      next = 'check';
      throw error;
    }
    await checkPayment();
  }));
  actions.confirm.addEventListener('click', () => run(checkPayment));
  actions.again.addEventListener('click', () => {
    payment = null;
    preparedAmount = null;
    ui('contribution-amount').value = '';
    resetPlan();
    ui('contribution-amount').focus();
  });
  actions.recover.addEventListener('click', openWallet);
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
      const label = document.createElement('p'); label.textContent = fromRawAmount(receipt.binding.value) + ` ${unit} · ` + (payout ? 'Creator payout' : 'Your contribution');
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
      account = session.account;
      preparedAmount = null;
      receipts = [];
      ui('returns-list').replaceChildren();
      if (!payment) resetPlan();
      message('', false, 'returns-status');
    }
    update();
  });
  return Object.freeze({
    render() {
      if (quote && quote.expectedTotal !== card.state.fundedUnits) resetPlan('The remaining amount changed. Check your contribution again.');
      confirmPayment();
      ui('contribution-amount').max = fromRawAmount(card.state.remainingUnits);
      showReturns(); update();
    },
    dispose() { quote = null; receipts = []; unsubscribe(); },
  });
}
