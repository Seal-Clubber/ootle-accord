import {
  QUORUM_AGREEMENT_SCHEMA, requiredApprovals, sha256Hex, NATIVE_TARI_RESOURCE, validateAgreement, agreementId,
  toRawAmount, fromRawAmount,
} from './lib/accord.mjs';
import { createSapientAdapter } from './lib/sapient.mjs';
import { TESTNET_ESCROW as TESTNET_DEMO } from './lib/testnet-escrow.mjs';
import { fundingState, refreshEscrow } from './lib/escrow-funding.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const wallet = createSapientAdapter();
let reviewerIdentity = null;
let reviewAgreement = null;
let stageCounter = 0;
let reviewerCounter = 0;
let submissionHash = null;
let feedbackTimer;

function notify(message, error = false) {
  clearTimeout(feedbackTimer);
  const output = $('#feedback');
  output.textContent = message;
  output.classList.toggle('error', error);
  output.hidden = false;
  if (!error) feedbackTimer = setTimeout(() => { output.hidden = true; }, 10000);
}

async function action(button, work, { reviewError = false } = {}) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  if (reviewError) $('#review-error').hidden = true;
  try { return await work(); }
  catch (error) {
    const message = error?.message || 'This action could not be completed.';
    if (reviewError) {
      if ($('#wallet-dialog').open) $('#wallet-dialog').close();
      showView('review', { focus: false });
      $('#review-error-message').textContent = message;
      $('#review-error').hidden = false;
      $('#review-error').focus({ preventScroll: true });
      $('#review-error').scrollIntoView({ block: 'nearest' });
    } else notify(message, true);
  }
  finally { if (button) button.disabled = false; }
}

function showView(name, { focus = true } = {}) {
  const names = ['explore', 'create', 'review'];
  if (!names.includes(name)) name = 'explore';
  for (const section of $$('.view')) section.hidden = section.id !== `view-${name}`;
  for (const item of $$('.nav-item')) {
    const active = item.dataset.view === name;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  if (focus) {
    $('#main').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}
$$('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
showView(location.hash.slice(1), { focus: false });

function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function textElement(tag, content, className) {
  const el = document.createElement(tag);
  el.textContent = content;
  if (className) el.className = className;
  return el;
}

const deployedStage = TESTNET_DEMO.agreement.milestones[0];
const deployedRequired = requiredApprovals(deployedStage.reviewers.length, deployedStage.approvalPercent);
$('#deployed-title').textContent = TESTNET_DEMO.agreement.title;
$('#explore-reviewer-count').textContent = String(deployedStage.reviewers.length);
$('#explore-threshold').textContent = `${deployedStage.approvalPercent}% · ${deployedRequired} of ${deployedStage.reviewers.length}`;
$('#explore-approvals').textContent = `${TESTNET_DEMO.recordedApprovals} of ${deployedRequired} required`;
$('#explore-checkpoint').textContent = `Deployment verified. Approvals shown are the recorded checkpoint at chain epoch ${TESTNET_DEMO.recordedEpoch}, not a live vote count.`;
$('#explore-component').textContent = TESTNET_DEMO.component;
let escrowState = fundingState({ targetUnits: deployedStage.targetUnits, fundedUnits: TESTNET_DEMO.recordedFundingUnits, epoch: TESTNET_DEMO.recordedEpoch, deadline: deployedStage.refundEpoch });
let chainSnapshot = null;
function approvalUnavailable() { return chainSnapshot && (chainSnapshot.paid || chainSnapshot.expired || chainSnapshot.approved || chainSnapshot.submissionHash !== submissionHash); }
function renderFunding(state, live = false) {
  if (live && chainSnapshot && (state.version < chainSnapshot.version || BigInt(state.epoch) < BigInt(chainSnapshot.epoch))) throw new Error('Indexer returned an older checkpoint. Try again later.');
  escrowState = state;
  $('#funded-amount').textContent = `${fromRawAmount(state.fundedUnits)} / ${fromRawAmount(state.targetUnits)} tTARI`;
  $('#remaining-amount').textContent = `${fromRawAmount(state.remainingUnits)} tTARI`;
  $('#funding-progress').value = Number(BigInt(state.fundedUnits) * 10000n / BigInt(state.targetUnits)) / 100;
  const closed = state.remainingUnits === '0';
  $('#funding-max').disabled = closed;
  $('#contribution-amount').disabled = closed;
  $('#contribution-amount').max = fromRawAmount(state.remainingUnits);
  $('#contribution-amount').value = closed ? '0' : '';
  $('#funding-label').textContent = state.paid ? 'PAID' : state.expired ? 'FUNDING CLOSED' : state.fullyFunded ? 'FULLY FUNDED' : 'FUNDING OPEN';
  $('#funding-note').textContent = state.paid ? 'Payout completed.' : state.expired ? 'The deadline has passed. Unpaid pledges are eligible for private refunds.' : state.fullyFunded ? 'Goal reached. Further funding is blocked by the escrow.' : 'Max fills the remaining capacity. Sapient private escrow funding is not available in this build.';
  if (live) {
    chainSnapshot = state;
    $('#explore-approvals').textContent = `${state.approvals} of ${deployedRequired} required`;
    $('#explore-checkpoint').textContent = `Refreshed from the Esmeralda indexer · epoch ${state.epoch} · ${new Date(state.checkedAt).toLocaleTimeString()}.`;
    $('#review-output').textContent = state.paid ? 'Payout completed.' : `${state.approvals} of ${deployedRequired} approvals. ${state.requiredReviewerApproved ? 'Your required vote is recorded.' : 'Waiting for the community reviewer’s required approval.'}`;
    $('#approve-review').disabled = !reviewAgreement || Boolean(approvalUnavailable());
  }
}
renderFunding(escrowState);
$('#funding-max').addEventListener('click', () => { $('#contribution-amount').value = fromRawAmount(escrowState.remainingUnits); });
$('#refresh-funding').addEventListener('click', event => action(event.currentTarget, async () => {
  renderFunding(await refreshEscrow(TESTNET_DEMO), true);
  notify('Balance and approvals refreshed from Esmeralda.');
}));

// Agreements use reviewer wallet signatures.
$('#resource-address').value = NATIVE_TARI_RESOURCE;
$('#resource-address').readOnly = true;
function addDesignerStage(title = '') {
  if ($$('.designer-stage').length >= 8) return notify('An agreement supports up to eight milestones.', true);
  stageCounter += 1;
  const id = `stage-${stageCounter}`;
  const article = document.createElement('fieldset');
  article.className = 'designer-stage';
  article.dataset.id = id;
  article.innerHTML = `<legend class="sr-only">Milestone ${stageCounter}</legend><div class="section-heading"><h3>Milestone ${String(stageCounter).padStart(2, '0')}</h3><button type="button" class="text-button remove-stage">Remove</button></div>
    <label for="${id}-title">Milestone title</label><input id="${id}-title" data-field="title" required maxlength="100">
    <label for="${id}-description">Deliverable & acceptance criteria</label><textarea id="${id}-description" data-field="description" rows="2" maxlength="2000" required></textarea>
    <label for="${id}-target">Public stage target (TARI)</label><input id="${id}-target" data-field="target" inputmode="decimal" placeholder="Optional planning target">
    <div data-reviewers></div><button type="button" class="text-button add-reviewer">＋ Add reviewer</button>
    <label for="${id}-percent">Approval required (%)</label><input id="${id}-percent" data-field="percent" type="number" min="1" max="100" step="1" value="60" required><p class="field-help quorum-preview"></p>
    <label for="${id}-epoch">Review deadline (chain epoch)</label><input id="${id}-epoch" data-field="epoch" required inputmode="numeric" maxlength="16" placeholder="Future Esmeralda epoch">`;
  article.querySelector('[data-field=title]').value = title;
  function updateQuorum() {
    try { const count = article.querySelectorAll('[data-reviewer]').length; const percent = Number(article.querySelector('[data-field=percent]').value); article.querySelector('.quorum-preview').textContent = requiredApprovals(count, percent) + ' of ' + count + ' designated reviewers must approve the same work. Non-voters remain in the denominator.'; }
    catch { article.querySelector('.quorum-preview').textContent = 'Choose a whole percentage from 1 to 100.'; }
  }
  function addReviewer() {
    if (article.querySelectorAll('[data-reviewer]').length >= 10) return notify('Use at most ten reviewers per milestone.', true);
    const row = document.createElement('div'); row.dataset.reviewer = ''; row.className = 'reviewer-row';
    reviewerCounter += 1; const prefix = 'reviewer-' + reviewerCounter;
    row.innerHTML = '<label for="' + prefix + '-name">Reviewer name or pseudonym</label><input id="' + prefix + '-name" data-reviewer-name required maxlength="100"><label for="' + prefix + '-wallet">Reviewer Sapient wallet address</label><textarea id="' + prefix + '-wallet" data-reviewer-wallet rows="3" required maxlength="240" placeholder="otl_esm_1…" spellcheck="false"></textarea><button type="button" class="text-button use-wallet">Use my connected Sapient wallet</button><button type="button" class="text-button remove-reviewer">Remove reviewer</button>';
    row.querySelector('.use-wallet').addEventListener('click', event => action(event.currentTarget, async () => { row.querySelector('[data-reviewer-wallet]').value = (await readReviewerIdentity()).walletAddress; notify('Reviewer address read from Sapient.'); }));
    row.querySelector('.remove-reviewer').addEventListener('click', () => { if (article.querySelectorAll('[data-reviewer]').length === 1) return notify('Keep at least one reviewer.', true); row.remove(); updateQuorum(); });
    article.querySelector('[data-reviewers]').append(row); updateQuorum();
  }
  article.querySelector('.add-reviewer').addEventListener('click', addReviewer);
  article.querySelector('[data-field=percent]').addEventListener('input', updateQuorum);
  addReviewer();
  article.querySelector('.remove-stage').addEventListener('click', () => {
    if ($$('.designer-stage').length === 1) return notify('Keep at least one milestone in the agreement.', true);
    article.remove();
  });
  $('#designer-stages').append(article);
}
$('#add-stage').addEventListener('click', () => addDesignerStage());
addDesignerStage('Delivery');

$('#agreement-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, async () => {
    $('#agreement-output').textContent = '';
    const stages = $$('.designer-stage').map(article => {
      const value = name => article.querySelector(`[data-field=${name}]`).value.trim();
      const target = value('target');
      return {
        id: article.dataset.id, title: value('title'), description: value('description'),
        reviewers: [...article.querySelectorAll('[data-reviewer]')].map(row => ({ name: row.querySelector('[data-reviewer-name]').value.trim(), role: 'Independent reviewer', walletAddress: row.querySelector('[data-reviewer-wallet]').value.trim() })), approvalPercent: Number(value('percent')),
        refundEpoch: value('epoch'),
        ...(target ? { targetUnits: toRawAmount(target) } : {}),
      };
    });
    const agreement = validateAgreement({
      schema: QUORUM_AGREEMENT_SCHEMA, title: $('#campaign-title').value.trim(), description: $('#campaign-description').value.trim(),
      network: 'esmeralda', resourceAddress: $('#resource-address').value.trim(),
      creatorWalletAddress: $('#creator-address').value.trim(), milestones: stages,
    });
    const id = await agreementId(agreement);
    downloadJson(agreement, `ootleaccord-${id.slice(0, 12)}.json`);
    $('#agreement-output').textContent = `Agreement saved. ID: ${id}. No contract was deployed or funded.`;
    notify('Public agreement saved. Share the file and confirm each reviewer wallet with its owner.');
  });
});

async function readReviewerIdentity() {
  if (!wallet.getState().account) await wallet.connect();
  reviewerIdentity = await wallet.getReviewerIdentity();
  $('#reviewer-wallet').value = reviewerIdentity.walletAddress;
  $('#reviewer-identity').hidden = false;
  return reviewerIdentity;
}
$('#reviewer-connect').addEventListener('click', event => action(event.currentTarget, async () => {
  await readReviewerIdentity();
  notify('Public reviewer address read from Sapient.');
}));
$('#copy-reviewer-wallet').addEventListener('click', event => action(event.currentTarget, async () => {
  if (!reviewerIdentity) throw new Error('Connect the reviewer wallet first.');
  await navigator.clipboard.writeText(reviewerIdentity.walletAddress);
  notify('Public reviewer wallet address copied.');
}));
function renderReviewTerms() {
  const stage = reviewAgreement?.milestones.find(s => s.id === $('#review-stage').value);
  if (!stage) return $('#review-terms').replaceChildren();
  const list = document.createElement('ol');
  for (const reviewer of stage.reviewers) {
    const item = textElement('li', reviewer.name);
    item.append(textElement('code', reviewer.walletAddress));
    list.append(item);
  }
  const reviewers = document.createElement('details');
  reviewers.append(textElement('summary', `${stage.reviewers.length} reviewers`), list);
  $('#review-terms').replaceChildren(textElement('p', `${requiredApprovals(stage.reviewers.length, stage.approvalPercent)} of ${stage.reviewers.length} approvals required · ${stage.approvalPercent}%`), textElement('p', 'The community reviewer’s vote is required before the creator can release the 10 tTARI.'), textElement('p', stage.title), textElement('p', stage.description, 'field-help'), textElement('p', `Review before chain epoch ${stage.refundEpoch}.`, 'field-help'), reviewers);
}
$('#review-stage').addEventListener('change', renderReviewTerms);
async function loadTestnetDemo() {
  $('#approve-review').disabled = true;
  reviewAgreement = validateAgreement(TESTNET_DEMO.agreement);
  if (await agreementId(reviewAgreement) !== TESTNET_DEMO.agreementId) throw new Error('Demo agreement identity mismatch.');
  $('#review-work').value = '';
  $('#review-stage').replaceChildren(...reviewAgreement.milestones.map(s => new Option(s.title, s.id)));
  $('#review-stage-picker').hidden = reviewAgreement.milestones.length === 1;
  submissionHash = await sha256Hex(new TextEncoder().encode(TESTNET_DEMO.work));
  if (submissionHash !== TESTNET_DEMO.submissionHash) { submissionHash = null; throw new Error('Demo work fingerprint mismatch.'); }
  $('#work-fingerprint').textContent = 'Bundled demo work fingerprint: ' + submissionHash;
  $('#demo-work-text').textContent = TESTNET_DEMO.work;
  $('#demo-work-details').hidden = false;
  $('#demo-work-details').open = true;
  $('#review-heading').textContent = reviewAgreement.title;
  $('#load-testnet-demo').hidden = true;
  $('#review-contract').textContent = TESTNET_DEMO.component;
  $('#review-agreement-id').textContent = TESTNET_DEMO.agreementId;
  $('#review-output').textContent = `10 tTARI locked · ${TESTNET_DEMO.recordedApprovals} of ${deployedRequired} approvals · waiting for the community reviewer. Saved checkpoint at epoch ${TESTNET_DEMO.recordedEpoch}; refresh in Accords for current status.`;
  $('#approve-review').disabled = Boolean(approvalUnavailable());
  if (chainSnapshot) renderFunding(chainSnapshot, true);
  renderReviewTerms();
}
$('#load-testnet-demo').addEventListener('click', event => action(event.currentTarget, loadTestnetDemo));
$('#explore-open-accord').addEventListener('click', event => action(event.currentTarget, async () => {
  await loadTestnetDemo();
  showView('review');
}));
$('#download-demo-work').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([TESTNET_DEMO.work], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'ootleaccord-demo-work.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#review-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, async () => {
    if (!reviewAgreement) throw new Error('Open an accord first.');
    if (!submissionHash) throw new Error('Choose the work file that the creator submitted.');
    if (!wallet.getState().account) await wallet.connect();
    const result = await wallet.approveMilestone({ agreement: reviewAgreement, stageId: $('#review-stage').value, submissionHash, maxFee: toRawAmount($('#review-fee').value.trim()) });
    walletSubmission(result, $('#review-output'));
  }, { reviewError: true });
});

$('#review-work').addEventListener('change', event => action(null, async () => {
  submissionHash = null; $('#work-fingerprint').textContent = '';
  $('#approve-review').disabled = true;
  $('#demo-work-details').hidden = true;
  const file = event.target.files[0];
  if (!file || file.size > 10 * 1024 * 1024) throw new Error('Choose a work file up to 10 MB.');
  submissionHash = await sha256Hex(await file.arrayBuffer());
  $('#work-fingerprint').textContent = 'Work fingerprint: ' + submissionHash + '. The file stays on this device.';
  $('#approve-review').disabled = !reviewAgreement || Boolean(approvalUnavailable());
}));
$('#submit-work').addEventListener('click', event => action(event.currentTarget, async () => {
  if (!reviewAgreement || !submissionHash) throw new Error('Open an accord and choose its work file first.');
  const result = await wallet.submitWork({ agreement: reviewAgreement, stageId: $('#review-stage').value, submissionHash, maxFee: toRawAmount($('#review-fee').value.trim()) });
  walletSubmission(result, $('#review-output'));
}, { reviewError: true }));

$('#copy-review-error').addEventListener('click', event => action(event.currentTarget, async () => {
  await navigator.clipboard.writeText($('#review-error-message').textContent);
  notify('Error copied. Paste it into the chat.');
}));

$('#clear-failed-request').addEventListener('click', event => action(event.currentTarget, async () => {
  if (!$('#failed-request-checked').checked) throw new Error('Check the previous request in Sapient first, then tick the confirmation.');
  if (!wallet.getState().account) await wallet.connect();
  await wallet.dismissFailedRequest({ confirmed: true });
  $('#failed-request-checked').checked = false;
  $('#review-error').hidden = true;
  $('#review-output').textContent = 'Previous failed request cleared from this app. Press Approve in Sapient to create a fresh approval. No transaction was sent by clearing it.';
  notify('Failed request cleared. You can create a new approval.');
}, { reviewError: true }));

function walletSubmission(result, output) {
  const message = `Wallet reports submission: ${result.transactionId}. This page has not independently verified chain acceptance. Check the transaction in Sapient.`;
  if (output) output.textContent = message;
  notify(message);
}
// Permission and transaction prompts require user actions. Startup only restores an
// existing origin grant using passive account/network/capability reads.
$('#wallet-open').addEventListener('click', () => $('#wallet-dialog').showModal());
$('#wallet-close').addEventListener('click', () => $('#wallet-dialog').close());
$('#wallet-connect').addEventListener('click', event => action(event.currentTarget, async () => {
  await wallet.connect();
  notify('Sapient connected on Esmeralda. No funds moved and no balance access was requested.');
}));
$('#wallet-disconnect').addEventListener('click', event => action(event.currentTarget, async () => {
  await wallet.disconnect();
  notify('Wallet disconnected. Existing requests are still held by Sapient.');
}));
$('#wallet-resume').addEventListener('click', event => action(event.currentTarget, async () => walletSubmission(await wallet.resumePending()), { reviewError: true }));
wallet.subscribe(state => {
  const connected = Boolean(state.account);
  if (!connected) { reviewerIdentity = null; $('#reviewer-wallet').value = ''; $('#reviewer-identity').hidden = true; }
  $('#wallet-open').textContent = connected ? 'Sapient connected' : state.status === 'restoring' ? 'Checking Sapient…' : state.status === 'connecting' ? 'Connecting…' : 'Connect Sapient';
  $('#wallet-connect').hidden = connected;
  $('#wallet-disconnect').hidden = !connected;
  $('#wallet-resume').hidden = !state.requestId;
  $('#failed-request-recovery').hidden = !state.requestId || state.requestId.startsWith('ootleaccord:');
  if (!state.requestId) $('#failed-request-checked').checked = false;
  const caps = state.capabilities;
  const lines = connected ? [
    `Network: ${state.network}`, `Status: ${state.status}`,
    `Account: ${state.account}`,
    `Private fees: ${caps?.supportsPrivateFees ? 'supported' : 'unavailable'}`,
    'Private funding: unavailable',
  ] : [`Status: ${state.status}`, 'Connect to submit work or approve.'];
  if (state.requestId) lines.push(`Existing request: ${state.requestId}`);
  if (state.error) lines.push(state.error);
  $('#wallet-info').textContent = lines.join('\n');
});

// Reconciliation is deliberately manual; forgetting an ID does not cancel its wallet request.
const reconcile = document.createElement('details');
reconcile.id = 'wallet-reconcile';
reconcile.innerHTML = '<summary>Reconcile an unresolved request</summary><p class="field-help">Inspect the existing transaction and approval popup in Sapient first. Reject any unsubmitted request. Forgetting this local ID cannot cancel a transaction or prove it failed.</p><label class="checkbox-label"><input type="checkbox" id="reconcile-checked"> I have checked Sapient and reconciled the existing request.</label><button type="button" id="wallet-forget" class="button button-outline">Forget local request ID</button>';
$('#wallet-dialog').append(reconcile);
$('#wallet-forget').addEventListener('click', event => action(event.currentTarget, () => {
  if (!$('#reconcile-checked').checked) throw new Error('Inspect and reconcile the existing request in Sapient before forgetting it here.');
  wallet.clearPending();
  $('#reconcile-checked').checked = false;
  notify('Local request ID forgotten. This did not cancel anything in Sapient or on the chain.');
}));
wallet.subscribe(state => { reconcile.hidden = !state.requestId; });

function restoreWallet() {
  // All expected missing/locked/disconnected cases are reflected in the snapshot.
  // Never request permission or retry a transaction from lifecycle events.
  void wallet.restoreConnection().catch(() => {});
}
restoreWallet();
window.addEventListener('pageshow', restoreWallet);
window.addEventListener('focus', restoreWallet);
window.addEventListener('tari#initialized', restoreWallet);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') restoreWallet();
});

window.addEventListener('pagehide', () => {
  reviewerIdentity = null;
  $('#reviewer-wallet').value = '';
  $('#reviewer-identity').hidden = true;
});
