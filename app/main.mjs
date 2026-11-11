import {
  QUORUM_AGREEMENT_SCHEMA, SAPIENT_ESCROW_SCHEMA, requiredApprovals, sha256Hex, NATIVE_TARI_RESOURCE, validateAgreement, agreementId,
  toRawAmount, fromRawAmount,
} from './lib/accord.mjs';
import { createSapientAdapter } from './lib/sapient.mjs';
import { TESTNET_ACCORDS } from './lib/testnet-accords.mjs';
import { MAINNET_ACCORDS } from './lib/mainnet-accords.mjs';
import { networkConfig } from './lib/networks.mjs';
import { fundingState, refreshEscrow, canApproveEscrow } from './lib/escrow-funding.mjs';
import { createAppUpdater } from './lib/app-updates.mjs';
import { wireFundingCard } from './lib/funding-ui.mjs';
import { createReturnClient } from './lib/escrow-returns.mjs';
import { projectWork, shareReviewLink } from './lib/review-work.mjs';
import { decodeTransactionResponse } from './lib/chain-codec.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const network = new URLSearchParams(location.search).get('network') === 'esmeralda' ? 'esmeralda' : 'mainnet';
const chain = networkConfig(network);
const unit = chain.unit;
const accords = network === 'mainnet' ? MAINNET_ACCORDS : TESTNET_ACCORDS;
const wallet = createSapientAdapter({ expectedNetwork: network });
let returns;
try { returns = createReturnClient({ network }); } catch { /* Funding remains usable if return tracking storage is blocked. */ }
if (network === 'mainnet') {
  $('#earlier-accords').hidden = true;
  $('#empty-accords').hidden = accords.length > 0;
  $('#add-stage').hidden = true;
  $('#creator-address').placeholder = `${chain.walletPrefix}1…`;
  $('label[for="review-fee"]').textContent = `Maximum fee (${unit})`;
} else {
  $('.network').textContent = 'Esmeralda testnet';
  $('#empty-accords').hidden = true;
  $('#mainnet-template').hidden = true;
  $('#switch-network').href = './?network=mainnet#explore';
  $('#switch-network').textContent = 'Open Ootle Mainnet';
}
let reviewerIdentity = null;
let ownReviewVote = null;
let reviewAgreement = null;
let stageCounter = 0;
let reviewerCounter = 0;
let chosenWork = null;
let bundledWork = null;
let workRead = 0;
let submittingWork = false;
let approvingWork = false;
const pendingWork = new Map();
let feedbackTimer;
let failedReviewRequestId = null;
let activeActions = 0;
let agreementDirty = false;
let updater;

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
  activeActions += 1;
  if (button) button.disabled = true;
  if (reviewError) $('#review-error').hidden = true;
  try { return await work(); }
  catch (error) {
    const message = error?.message || 'This action could not be completed.';
    if (reviewError) {
      const currentRequestId = wallet.getState().requestId;
      failedReviewRequestId = currentRequestId && !currentRequestId.startsWith('ootleaccord:') ? currentRequestId : null;
      $('#failed-request-recovery').hidden = !failedReviewRequestId;
      if ($('#wallet-dialog').open) $('#wallet-dialog').close();
      showView('review', { focus: false });
      $('#review-error-message').textContent = message;
      $('#review-error').hidden = false;
      $('#review-error').focus({ preventScroll: true });
      $('#review-error').scrollIntoView({ block: 'nearest' });
    } else notify(message, true);
  }
  finally {
    activeActions -= 1;
    if (button) button.disabled = false;
    if (['approve-review', 'submit-work', 'check-work-submission'].includes(button?.id)) syncReviewState();
  }
}

const reviewRoute = () => location.hash.slice(1).split('?')[0];
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
  if (reviewRoute() !== name) history.replaceState(null, '', `#${name}`);
  if (focus) {
    $('#main').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

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

let activeAccord = accords[0];
const accordCards = new Map();
let reviewLoad = 0;
function selectedFunding() { return accordCards.get(activeAccord?.agreementId)?.state; }
function selectedWork() {
  if (chosenWork) return chosenWork;
  if ($('#project-link').value || $('#review-work').files.length) return null;
  return bundledWork?.hash === selectedFunding()?.submissionHash ? bundledWork : null;
}
function approvalUnavailable() {
  const stage = reviewAgreement?.milestones[0];
  const index = reviewerIdentity ? stage?.reviewers.findIndex(r => r.publicKey === reviewerIdentity.publicKey) : null;
  return (ownReviewVote && ownReviewVote.agreementId === activeAccord?.agreementId && ownReviewVote.account === wallet.getState().account) ||
    !canApproveEscrow(selectedFunding(), selectedWork()?.hash, index);
}
function syncReviewState() {
  if (!reviewAgreement) return;
  const state = selectedFunding();
  const stage = reviewAgreement.milestones.find(s => s.id === $('#review-stage').value);
  const required = requiredApprovals(stage.reviewers.length, stage.approvalPercent);
  const amount = state.paid ? fromRawAmount(state.targetUnits) + ` ${unit} paid to the creator` : fromRawAmount(state.fundedUnits) + ' / ' + fromRawAmount(state.targetUnits) + ` ${unit} funded`;
  const status = state.paid ? 'Payout complete.' : state.expired ? 'Review closed.' : !state.fullyFunded ? 'Voting opens at full funding.'
    : !state.submissionHash ? 'Waiting for work from the creator.' : `${state.approvals} of ${required} required approvals recorded.`;
  $('#review-output').textContent = `${amount} · ${status}`;

  const pending = pendingWork.get(activeAccord.agreementId);
  if (pending && state.submissionHash === pending.hash) pendingWork.delete(activeAccord.agreementId);
  const waiting = pendingWork.has(activeAccord.agreementId);
  const work = selectedWork();
  const matches = Boolean(work && state.submissionHash === work.hash);
  const canSubmit = !state.paid && !state.expired && state.approvals === 0 && !matches;
  const message = waiting ? 'Submitted in Sapient. Check for on-chain confirmation before sharing.'
    : matches ? (work.url ? 'Link verified against the submission.' : 'File verified against the submission.')
    : state.submissionHash ? (work ? 'This work differs from the registered submission.' : 'Open the review link or choose the file shared by the creator.')
    : '';
  $('#review-work-status').hidden = !message;
  $('#review-work-status').textContent = message;
  $('#submit-work').hidden = !canSubmit || waiting;
  $('#submit-work').disabled = !work || submittingWork || Boolean(wallet.getState().requestId);
  $('#submit-work').textContent = state.submissionHash ? 'Replace work in Sapient' : 'Submit work in Sapient';
  $('#check-work-submission').hidden = !waiting;
  $('#project-link').disabled = submittingWork || waiting;
  $('#review-work').disabled = submittingWork || waiting;
  $('#open-project').hidden = !matches || !work.url;
  if (matches && work.url) $('#open-project').href = work.url;
  else $('#open-project').removeAttribute('href');
  $('#copy-review-link').hidden = !matches || !work.url;
  $('#demo-work-details').hidden = !matches || work !== bundledWork;
  $('#review-fund').hidden = state.fullyFunded || state.expired || state.paid;
  $('#approve-review').hidden = !matches || !state.fullyFunded || state.expired || state.paid || state.approved;
  $('#approve-review').disabled = approvingWork || Boolean(wallet.getState().requestId) || approvalUnavailable();
}
function setFundingPanel(card, open) {
  const button = card.node.querySelector('[data-ui="fund-accord"]');
  const panel = card.node.querySelector('[data-ui="funding-panel"]');
  const closed = card.state.remainingUnits === '0' || card.state.expired || card.state.paid;
  panel.hidden = !open;
  button.disabled = !open && (closed || card.deployment.archivedOnReset);
  button.setAttribute('aria-expanded', String(open));
  button.textContent = open ? 'Close funding' : card.deployment.archivedOnReset ? 'Archived' : closed ? 'Funding closed' : 'Fund this accord';
}
function renderAccordCard(card, state, live = false) {
  const { deployment, node } = card;
  if (live && card.live && (state.version < card.live.version || BigInt(state.epoch) < BigInt(card.live.epoch))) throw new Error('Indexer returned an older checkpoint. Try again later.');
  card.state = state;
  if (live) card.live = state;
  const ui = name => node.querySelector('[data-ui="' + name + '"]');
  const stage = deployment.agreement.milestones[0];
  const required = requiredApprovals(stage.reviewers.length, stage.approvalPercent);
  ui('funded-label').textContent = state.paid ? 'Paid to creator' : 'Funded';
  ui('funded-amount').textContent = state.paid ? fromRawAmount(state.targetUnits) + ` ${unit}` : fromRawAmount(state.fundedUnits) + ' / ' + fromRawAmount(state.targetUnits) + ` ${unit}`;
  ui('remaining-amount').textContent = fromRawAmount(state.remainingUnits) + ` ${unit}`;
  ui('funding-progress').value = state.paid ? 100 : Number(BigInt(state.fundedUnits) * 10000n / BigInt(state.targetUnits)) / 100;
  setFundingPanel(card, !ui('funding-panel').hidden);
  const minimum = state.minimumUnits && BigInt(state.minimumUnits) < BigInt(state.remainingUnits) ? ` Minimum ${fromRawAmount(state.minimumUnits)} ${unit}.` : '';
  ui('contribution-limit').textContent = `Maximum ${fromRawAmount(state.remainingUnits)} ${unit}.${minimum}`;
  ui('funding-label').textContent = state.paid ? 'Paid out' : state.expired ? 'Funding closed' : state.fullyFunded ? 'Fully funded' : 'Funding open';
  ui('funding-note').textContent = state.paid ? '' : state.expired ? 'Unpaid contributions can be refunded.' : state.fullyFunded
    ? `${state.approvals} of ${required} required approvals recorded.` : `Review opens at full funding. ${required} of ${stage.reviewers.length} reviewers must approve.`;
  ui('explore-approvals').textContent = `${stage.approvalPercent}% quorum. ${state.approvals} of ${required} required votes recorded. The community reviewer’s vote is required.`;
  ui('explore-open-accord').textContent = state.fullyFunded ? 'Review work' : 'View accord';
  ui('explore-checkpoint').textContent = live
    ? `Refreshed from the ${chain.name} indexer · epoch ` + state.epoch + ' · ' + new Date(state.checkedAt).toLocaleTimeString() + '.'
    : 'Recorded checkpoint at chain epoch ' + deployment.recordedEpoch + '. Refresh for current funding and votes.';
  card.controls?.render();
  if (activeAccord?.agreementId === deployment.agreementId) syncReviewState();
}
for (const deployment of accords) {
  const stage = deployment.agreement.milestones[0];
  const node = $('#accord-card-template').content.firstElementChild.cloneNode(true);
  const ui = name => node.querySelector('[data-ui="' + name + '"]');
  ui('deployed-title').textContent = deployment.agreement.title;
  ui('deployed-title').id = 'accord-title-' + deployment.agreementId.slice(0,12);
  node.setAttribute('aria-labelledby', ui('deployed-title').id);
  ui('explore-component').textContent = deployment.component;
  ui('receipts').href = deployment.receiptsPath || './docs/private-escrow-testnet.md';
  ui('contribution-amount').id = 'contribute-' + deployment.agreementId.slice(0,12);
  ui('contribution-label').htmlFor = ui('contribution-amount').id;
  ui('contribution-label').textContent = `Contribution (${unit})`;
  ui('funding-fee').textContent = `Preparation and deposit each use a private fee of up to 0.1 ${unit}.`;
  ui('funding-panel').id = 'funding-' + deployment.agreementId.slice(0,12);
  ui('fund-accord').setAttribute('aria-controls', ui('funding-panel').id);
  const stock = deployment.agreement.schema === SAPIENT_ESCROW_SCHEMA;
  ui('privacy-note').textContent = stock
    ? 'Contribution amounts, the remaining counter and reviewer votes are public. The deposit uses one-time keys and omits the donor base wallet address. Wallet preparation and transaction history can link activity. Return memos are encrypted to the wallet and require a private view grant.' + (network === 'esmeralda' ? ' Four reviewers are deployer-operated test wallets.' : '')
    : 'Earlier private-output escrow: encrypted transfer values, with contribution sizes inferable from public total changes. Transaction links and timing remain visible. Four reviewers are deployer-operated test wallets.';
  const state = { ...fundingState({ targetUnits: stage.targetUnits, fundedUnits: deployment.recordedFundingUnits, paid: deployment.recordedPaid ?? false, epoch: deployment.recordedEpoch, deadline: stage.refundEpoch }), approvals: deployment.recordedApprovals, votes: deployment.recordedVotes,
    requiredReviewerApproved: deployment.recordedRequiredReviewerApproved || false, approved: deployment.recordedApproved ?? false,
    submissionHash: deployment.recordedSubmissionHash ?? deployment.submissionHash };
  const card = { deployment, node, state, live: null };
  accordCards.set(deployment.agreementId, card);
  renderAccordCard(card, state);
  card.controls = wireFundingCard({ card, wallet, returns, notify,
    activity: delta => { activeActions += delta; },
    openWallet: () => $('#wallet-dialog').showModal(),
    refresh: async () => { const fresh = await refreshEscrow(deployment); renderAccordCard(card, fresh, true); return fresh; },
  });
  card.controls.render();
  ui('fund-accord').addEventListener('click', () => {
    const panel = ui('funding-panel');
    setFundingPanel(card, panel.hidden);
    if (!panel.hidden) ui('contribution-amount').focus({ preventScroll: true });
  });
  ui('refresh-funding').addEventListener('click', event => action(event.currentTarget, async () => {
    renderAccordCard(card, await refreshEscrow(deployment), true);
    notify(`Balance and approvals refreshed from ${chain.name}.`);
  }));
  ui('explore-open-accord').addEventListener('click', event => action(event.currentTarget, async () => {
    if (await loadAccord(deployment)) showView('review');
  }));
  if (deployment.archivedOnReset) {
    ui('funding-label').textContent = 'Archived';
    ui('funding-note').textContent = 'Historical record from before the Esmeralda reset.';
    ui('explore-checkpoint').textContent = 'This contract is no longer on the current testnet. Its receipts remain available.';
    ui('fund-accord').disabled = true;
    ui('fund-accord').textContent = 'Archived';
    ui('refresh-funding').disabled = true;
    ui('explore-open-accord').disabled = true;
    ui('explore-open-accord').textContent = 'Archived after reset';
  }
  $(!deployment.archivedOnReset && stock ? '#accord-list' : '#earlier-accord-list').append(node);
}

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
    <label for="${id}-target">Public stage target (${unit})</label><input id="${id}-target" data-field="target" inputmode="decimal" placeholder="Optional planning target">
    <div data-reviewers></div><button type="button" class="text-button add-reviewer">＋ Add reviewer</button>
    <label for="${id}-percent">Approval required (%)</label><input id="${id}-percent" data-field="percent" type="number" min="1" max="100" step="1" value="60" required><p class="field-help quorum-preview"></p>
    <label for="${id}-epoch">Review deadline (chain epoch)</label><input id="${id}-epoch" data-field="epoch" required inputmode="numeric" maxlength="16" placeholder="Future ${chain.name} epoch">`;
  article.querySelector('[data-field=title]').value = title;
  if (network === 'mainnet') {
    const goal = article.querySelector('[data-field=target]');
    goal.required = true;
    goal.placeholder = '';
    article.querySelector('.remove-stage').hidden = true;
  }
  function updateQuorum() {
    try { const count = article.querySelectorAll('[data-reviewer]').length; const percent = Number(article.querySelector('[data-field=percent]').value); article.querySelector('.quorum-preview').textContent = requiredApprovals(count, percent) + ' of ' + count + ' designated reviewers must approve the same work. Non-voters remain in the denominator.'; }
    catch { article.querySelector('.quorum-preview').textContent = 'Choose a whole percentage from 1 to 100.'; }
  }
  function addReviewer() {
    if (article.querySelectorAll('[data-reviewer]').length >= 10) return notify('Use at most ten reviewers per milestone.', true);
    const row = document.createElement('div'); row.dataset.reviewer = ''; row.className = 'reviewer-row';
    reviewerCounter += 1; const prefix = 'reviewer-' + reviewerCounter;
    row.innerHTML = '<label for="' + prefix + '-name">Reviewer name or pseudonym</label><input id="' + prefix + '-name" data-reviewer-name required maxlength="100"><label for="' + prefix + '-wallet">Reviewer Sapient wallet address</label><textarea id="' + prefix + '-wallet" data-reviewer-wallet rows="3" required maxlength="240" spellcheck="false"></textarea><button type="button" class="text-button use-wallet">Use my connected Sapient wallet</button><button type="button" class="text-button remove-reviewer">Remove reviewer</button>';
    row.querySelector('[data-reviewer-wallet]').placeholder = `${chain.walletPrefix}1…`;
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
      network, resourceAddress: $('#resource-address').value.trim(),
      creatorWalletAddress: $('#creator-address').value.trim(), milestones: stages,
    });
    const id = await agreementId(agreement);
    downloadJson(agreement, `ootleaccord-${id.slice(0, 12)}.json`);
    agreementDirty = false;
    $('#agreement-output').textContent = `Agreement saved. ID: ${id}. No contract was deployed or funded.`;
    notify('Public agreement saved. Share the file and confirm each reviewer wallet with its owner.');
  });
});

async function readReviewerIdentity() {
  if (!wallet.getState().account) await wallet.connect();
  reviewerIdentity = await wallet.getReviewerIdentity();
  $('#reviewer-wallet').value = reviewerIdentity.walletAddress;
  $('#reviewer-identity').hidden = false;
  syncReviewState();
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
  $('#review-terms').replaceChildren(textElement('p', `${requiredApprovals(stage.reviewers.length, stage.approvalPercent)} of ${stage.reviewers.length} approvals required · ${stage.approvalPercent}%`), textElement('p', 'The community reviewer’s vote is required before the creator can release the ' + fromRawAmount(stage.targetUnits) + ` ${unit}.`), textElement('p', stage.title), textElement('p', stage.description, 'field-help'), textElement('p', `Review before chain epoch ${stage.refundEpoch}.`, 'field-help'), reviewers);
}
$('#review-stage').addEventListener('change', renderReviewTerms);
async function setProjectLink({ showError = false } = {}) {
  const read = ++workRead;
  const value = $('#project-link').value.trim();
  chosenWork = null;
  $('#review-work').value = '';
  $('#project-link').setCustomValidity('');
  syncReviewState();
  if (!value) return;
  try {
    const work = await projectWork(value);
    if (read !== workRead) return;
    chosenWork = work;
    syncReviewState();
  } catch (error) {
    if (read !== workRead) return;
    $('#project-link').setCustomValidity(error.message);
    if (showError) $('#project-link').reportValidity();
  }
}
async function loadAccord(deployment = activeAccord, projectLink = '') {
  if (!deployment) throw new Error('No verified accord is available on this network yet.');
  const load = ++reviewLoad;
  $('#approve-review').disabled = true;
  const terms = validateAgreement(deployment.agreement);
  const hasWork = typeof deployment.work === 'string' && deployment.work.length > 0;
  const [id, hash] = await Promise.all([agreementId(terms), hasWork ? sha256Hex(new TextEncoder().encode(deployment.work)) : null]);
  if (load !== reviewLoad) return false;
  if (id !== deployment.agreementId || (hasWork && hash !== deployment.submissionHash)) throw new Error('Accord identity or work fingerprint mismatch.');
  activeAccord = deployment;
  reviewAgreement = terms;
  ++workRead;
  chosenWork = null;
  bundledWork = hash ? { hash } : null;
  $('#project-link').value = projectLink;
  $('#project-link').setCustomValidity('');
  $('#review-work').value = '';
  $('#review-options').open = false;
  $('#review-form').hidden = false;
  $('#review-stage').replaceChildren(...terms.milestones.map(s => new Option(s.title, s.id)));
  $('#review-stage-picker').hidden = terms.milestones.length === 1;
  $('#demo-work-text').textContent = deployment.work ?? '';
  $('#demo-work-details').open = false;
  $('#review-heading').textContent = terms.title;
  $('#review-error').hidden = true;
  renderReviewTerms();
  syncReviewState();
  if (projectLink) await setProjectLink({ showError: true });
  void refreshReview(deployment).catch(() => { /* Keep the last known state if the indexer is unavailable. */ });
  return true;
}
function openReviewRoute() {
  const params = new URLSearchParams(location.hash.slice('#review'.length));
  const id = params.get('accord');
  const deployment = id ? accords.find(item => item.agreementId === id && !item.archivedOnReset) : activeAccord;
  if (!deployment) {
    ++reviewLoad;
    ++workRead;
    reviewAgreement = null;
    $('#review-form').hidden = true;
    $('#review-heading').textContent = 'This accord is unavailable on this network.';
    return;
  }
  void action(null, () => loadAccord(deployment, params.get('work') || ''));
}
$$('[data-view]').forEach(button => button.addEventListener('click', () => {
  showView(button.dataset.view);
  if (button.dataset.view === 'review' && !reviewAgreement) openReviewRoute();
}));
window.addEventListener('hashchange', () => {
  showView(reviewRoute());
  if (reviewRoute() === 'review') openReviewRoute();
});
showView(reviewRoute(), { focus: false });
if (reviewRoute() === 'review') openReviewRoute();
$('#review-fund').addEventListener('click', () => {
  const card = accordCards.get(activeAccord?.agreementId);
  if (!card) return;
  showView('explore', { focus: false });
  setFundingPanel(card, true);
  card.node.querySelector('[data-ui="contribution-amount"]').focus();
});
$('#download-demo-work').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([activeAccord.work], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'ootleaccord-demo-work.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#review-form').addEventListener('submit', event => event.preventDefault());
$('#approve-review').addEventListener('click', event => {
  action(event.currentTarget, async () => {
    if (!reviewAgreement) throw new Error('Open an accord first.');
    const workHash = selectedWork()?.hash;
    if (!workHash) throw new Error('Open the project link or file shared by the creator.');
    const deployment = activeAccord;
    const agreement = reviewAgreement;
    const stageId = $('#review-stage').value;
    if (approvalUnavailable()) throw new Error('This accord is not ready for approval. Refresh its balance and wait for full funding.');
    approvingWork = true;
    try {
      if (!wallet.getState().account) await wallet.connect();
      if (activeAccord !== deployment || selectedWork()?.hash !== workHash) throw new Error('The selected work changed. Review it before approving.');
      const result = await wallet.approveMilestone({ agreement, deployment, stageId, submissionHash: workHash, maxFee: toRawAmount($('#review-fee').value.trim()) });
      ownReviewVote = { agreementId: deployment.agreementId, account: wallet.getState().account };
      walletSubmission(result, $('#review-output'));
      try { await refreshReview(deployment); }
      catch { /* The successful vote stays disabled even while the public checkpoint catches up. */ }
    } finally { approvingWork = false; }
  }, { reviewError: true });
});

$('#project-link').addEventListener('input', () => void setProjectLink());
$('#project-link').addEventListener('blur', event => event.currentTarget.reportValidity());
$('#review-work').addEventListener('change', event => action(null, async () => {
  const read = ++workRead;
  chosenWork = null;
  $('#project-link').value = '';
  $('#project-link').setCustomValidity('');
  syncReviewState();
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a work file up to 10 MB.');
  const hash = await sha256Hex(await file.arrayBuffer());
  if (read !== workRead) return;
  chosenWork = { hash };
  syncReviewState();
}));

$('#copy-review-link').addEventListener('click', event => action(event.currentTarget, async () => {
  const work = selectedWork();
  if (!work?.url || work.hash !== selectedFunding()?.submissionHash) throw new Error('Confirm the project submission before sharing.');
  await navigator.clipboard.writeText(shareReviewLink(location.href, network, activeAccord.agreementId, work.url));
  notify('Review link copied. Send it to your reviewers.');
}));

async function refreshReview(deployment) {
  const state = await refreshEscrow(deployment);
  renderAccordCard(accordCards.get(deployment.agreementId), state, true);
  return state;
}
$('#submit-work').addEventListener('click', event => action(event.currentTarget, async () => {
  const work = selectedWork();
  const deployment = activeAccord;
  const agreement = reviewAgreement;
  if (!agreement || !work) throw new Error('Enter the project link first.');
  if (submittingWork || pendingWork.has(deployment.agreementId)) return;
  const stageId = $('#review-stage').value;
  const maxFee = toRawAmount($('#review-fee').value.trim());
  submittingWork = true;
  syncReviewState();
  try {
    const live = await refreshReview(deployment);
    if (live.submissionHash === work.hash) return;
    if (live.paid || live.expired || live.approvals > 0) throw new Error('Work submission is closed for this accord.');
    if (!wallet.getState().account) await wallet.connect();
    if (activeAccord !== deployment || selectedWork()?.hash !== work.hash) throw new Error('The selected work changed. Open the accord and try again.');
    const result = await wallet.submitWork({ agreement, stageId, submissionHash: work.hash, maxFee });
    pendingWork.set(deployment.agreementId, { id: result.transactionId, hash: work.hash });
    try { await refreshReview(deployment); } catch { /* Keep the pending submission available to check. */ }
  } finally { submittingWork = false; }
}, { reviewError: true }));

$('#check-work-submission').addEventListener('click', event => action(event.currentTarget, async () => {
  const deployment = activeAccord;
  const pending = pendingWork.get(deployment.agreementId);
  if (!pending) return;
  const state = await refreshReview(deployment);
  if (state.submissionHash === pending.hash) return;
  if (!/^[a-f0-9]{64}$/.test(pending.id)) throw new Error('Check the submitted transaction in Sapient.');
  const response = await fetch(`${chain.indexer}/transactions/${pending.id}/result`, {
    credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  if (response.ok) {
    const result = await decodeTransactionResponse(await response.json());
    const final = result.result?.Finalized;
    const diff = final?.execution_result?.finalize?.result;
    if (final?.final_decision && (final.final_decision !== 'Commit' || diff?.AcceptFeeRejectRest || diff?.Reject)) {
      pendingWork.delete(deployment.agreementId);
      throw new Error('The transaction did not register the work. Check the result in Sapient before retrying.');
    }
  }
  notify('The submission is still waiting for confirmation.');
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
  $('#review-output').textContent = 'Previous failed request cleared from this app. Check the accord’s current status; an approval already recorded on-chain does not need to be repeated. No transaction was sent by clearing it.';
  notify('Failed request cleared. Check the accord’s current status.');
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
  notify(`Sapient connected on ${chain.name}.`);
}));
$('#wallet-disconnect').addEventListener('click', event => action(event.currentTarget, async () => {
  await wallet.disconnect();
  notify('Wallet disconnected. Existing requests are still held by Sapient.');
}));
$('#wallet-resume').addEventListener('click', event => action(event.currentTarget, async () => walletSubmission(await wallet.resumePending()), { reviewError: true }));
wallet.subscribe(state => {
  const connected = Boolean(state.account);
  if (ownReviewVote && ownReviewVote.account !== state.account) ownReviewVote = null;
  if (!connected) { reviewerIdentity = null; $('#reviewer-wallet').value = ''; $('#reviewer-identity').hidden = true; }
  $('#wallet-open').textContent = connected ? 'Sapient connected' : state.status === 'restoring' ? 'Checking Sapient…' : state.status === 'connecting' ? 'Connecting…' : 'Connect Sapient';
  $('#wallet-status').textContent = state.requestId ? 'A Sapient request needs your attention.' : state.error || (connected ? `Connected on ${chain.name}.` : `Connect Sapient on ${chain.name} to continue.`);
  $('#wallet-connect').hidden = connected;
  $('#wallet-disconnect').hidden = !connected;
  $('#wallet-resume').hidden = !state.requestId;
  $('#wallet-install').hidden = connected;
  if (state.requestId !== failedReviewRequestId) {
    failedReviewRequestId = null;
    $('#failed-request-checked').checked = false;
  }
  $('#failed-request-recovery').hidden = !failedReviewRequestId;
  const caps = state.capabilities;
  const lines = connected ? [
    `Network: ${state.network}`, `Status: ${state.status}`,
    `Account: ${state.account}`,
    `Private fees: ${caps?.supportsPrivateFees ? 'supported' : 'unavailable'}`,
    `Escrow deposits: ${caps?.stealthRedeemPrivateFee ? 'supported · public contribution amounts' : 'unavailable for this wallet version/account'}`,
  ] : [`Status: ${state.status}`, 'Connect to submit work or approve.'];
  if (state.requestId) lines.push(`Existing request: ${state.requestId}`);
  if (state.error) lines.push(state.error);
  $('#wallet-info').textContent = lines.join('\n');
  syncReviewState();
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

// New builds appear automatically while browsing Accords. Defer during wallet
// actions, pending requests, editing, or review so an update cannot interrupt them.
$('#agreement-form').addEventListener('input', () => { agreementDirty = true; });
$('#agreement-form').addEventListener('click', event => {
  if (event.target.closest('.remove-stage,.remove-reviewer,.add-reviewer,#add-stage,.use-wallet')) agreementDirty = true;
});
function updateSafe() {
  const state = wallet.getState();
  return document.visibilityState === 'visible' && activeActions === 0 && !state.requestId &&
    !returns?.getPending() &&
    !['connecting', 'awaiting-approval', 'submitting', 'confirming'].includes(state.status) && !$('#wallet-dialog').open;
}
updater = createAppUpdater({
  currentVersion: $('meta[name="ootleaccord-build"]')?.content,
  getUrl: () => location.href,
  canReload: manual => updateSafe() && (manual || (location.hash === '#explore' && !agreementDirty &&
    !$('#project-link').value && !$('#review-work').files.length &&
    !$$('[data-ui="funding-panel"]').some(panel => !panel.hidden) &&
    !$$('[data-ui="returns-panel"]').some(panel => panel.open) && !returns?.getPending() &&
    !document.activeElement?.matches('input,textarea,select,[contenteditable]'))),
  navigate: url => location.replace(url),
  onUpdate: version => { $('#app-update').hidden = !version; },
});
$('#app-update-apply').addEventListener('click', () => {
  if (!updateSafe()) return notify('Finish the current wallet request and close the Sapient panel before updating.', true);
  // Explicit updates preserve the current route; the notice explains draft loss.
  updater.apply({ manual: true });
});
function checkAppUpdate() { if (document.visibilityState === 'visible') void updater.check(); }
checkAppUpdate();
window.addEventListener('focus', checkAppUpdate);
window.addEventListener('pageshow', checkAppUpdate);
document.addEventListener('visibilitychange', checkAppUpdate);
setInterval(checkAppUpdate, 30000);

// Refresh public chain state without touching Sapient or overwriting contribution inputs.
let refreshingAccords = false;
async function refreshAccords() {
  if (document.visibilityState !== 'visible' || refreshingAccords || activeActions > 0) return;
  refreshingAccords = true;
  try {
    await Promise.allSettled([...accordCards.values()].map(async card => {
      if (card.deployment.archivedOnReset) return;
      const fresh = await refreshEscrow(card.deployment);
      renderAccordCard(card, fresh, true);
    }));
  } finally { refreshingAccords = false; }
}
void refreshAccords();
window.addEventListener('focus', refreshAccords);
document.addEventListener('visibilitychange', refreshAccords);
setInterval(refreshAccords, 30000);
