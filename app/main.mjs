import {
  QUORUM_AGREEMENT_SCHEMA, SAPIENT_ESCROW_SCHEMA, requiredApprovals, sha256Hex, NATIVE_TARI_RESOURCE, validateAgreement, agreementId,
  toRawAmount, fromRawAmount,
} from './lib/accord.mjs';
import { createSapientAdapter } from './lib/sapient.mjs';
import { TESTNET_ACCORDS } from './lib/testnet-accords.mjs';
import { MAINNET_ACCORDS } from './lib/mainnet-accords.mjs';
import { networkConfig, readCurrentEpoch } from './lib/networks.mjs';
import { estimateDeadlineEpoch, formatDeadlineRemaining } from './lib/epoch-deadline.mjs';
import { fundingState, refreshEscrow, canApproveEscrow } from './lib/escrow-funding.mjs';
import { createAppUpdater } from './lib/app-updates.mjs';
import { wireFundingCard } from './lib/funding-ui.mjs';
import { createReturnClient } from './lib/escrow-returns.mjs';
import { projectWork, shareReviewLink } from './lib/review-work.mjs';
import { decodeTransactionResponse } from './lib/chain-codec.mjs';
import { reviewerKeyFromWallet } from './lib/wallet-address.mjs';
import { verifyPublishedEscrow } from './lib/escrow-create.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const network = new URLSearchParams(location.search).get('network') === 'esmeralda' ? 'esmeralda' : 'mainnet';
const chain = networkConfig(network);
const unit = chain.unit;
const accords = [...(network === 'mainnet' ? MAINNET_ACCORDS : TESTNET_ACCORDS)];
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
  $('#publish-help').textContent = 'Download the public terms. Publishing from Create is available on Mainnet.';
  $('#publish-accord').hidden = true;
  $('#open-draft').hidden = true;
  $('#save-agreement').className = 'button button-primary';
}
let reviewerIdentity = null;
let identityLookup = null;
let identityGeneration = 0;
let identityConnection = '';
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
const CREATION_KEY = 'ootleaccord.creation.pending';
const PUBLISHED_KEY = 'ootleaccord.created';
const REVIEW_WORK_KEY = `ootleaccord.review.work.${network}`;
const publishedRecords = new Map();
let pendingCreation = network === 'mainnet' ? readStorage('sessionStorage', CREATION_KEY, null) : null;
let publishing = false;
let createdRecord = null;
let epochSnapshot = null;
let refreshingCreateEpoch = false;

function readStorage(kind, key, fallback) {
  try { return JSON.parse(window[kind].getItem(key)) ?? fallback; }
  catch { return fallback; }
}

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
    if (button) button.disabled = button.id === 'publish-accord' && Boolean(pendingCreation);
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
  if (name === 'create') void refreshCreateEpoch();
  if (name === 'review' && wallet.getState().account) void loadWalletIdentity().catch(() => {});
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
  if ($('#project-link').value || $('#work-description').value) return null;
  return bundledWork?.hash === selectedFunding()?.submissionHash ? bundledWork : null;
}
function savedReviewWork() {
  const records = readStorage('localStorage', REVIEW_WORK_KEY, []);
  return Array.isArray(records) ? records : [];
}
function knownReviewWork(deployment) {
  const saved = savedReviewWork().find(record => record?.agreementId === deployment.agreementId);
  if (typeof saved?.website === 'string' && typeof saved.description === 'string') return saved;
  return { website: deployment.submittedWebsite ?? '', description: '' };
}
function rememberReviewWork(agreementId, work) {
  const records = savedReviewWork();
  if (records.some(record => record?.agreementId === agreementId && record.hash === work.hash &&
      record.website === work.url && record.description === (work.description ?? ''))) return;
  const entry = { agreementId, hash: work.hash, website: work.url, description: work.description ?? '' };
  try {
    localStorage.setItem(REVIEW_WORK_KEY, JSON.stringify([entry, ...records.filter(record => record?.agreementId !== agreementId)].slice(0, 12)));
  } catch { /* The current review link still works when browser storage is blocked. */ }
}
function accordWorkLink(deployment, work, view) {
  const url = new URL(shareReviewLink(location.href, network, deployment.agreementId, work.url, work.description, view));
  const published = publishedRecords.get(deployment.agreementId);
  if (published) url.hash += '&' + new URLSearchParams({ published: JSON.stringify(published) });
  return url.href;
}
function reviewAccess(stage = reviewAgreement?.milestones.find(item => item.id === $('#review-stage').value)) {
  const key = reviewerIdentity?.publicKey;
  return {
    creator: Boolean(key && reviewAgreement && key === reviewerKeyFromWallet(reviewAgreement.creatorWalletAddress, network)),
    reviewerIndex: key && stage ? stage.reviewers.findIndex(reviewer => reviewer.publicKey === key) : -1,
  };
}
function approvalUnavailable() {
  const { reviewerIndex } = reviewAccess();
  return reviewerIndex < 0 || (ownReviewVote && ownReviewVote.agreementId === activeAccord?.agreementId && ownReviewVote.account === wallet.getState().account) ||
    !canApproveEscrow(selectedFunding(), selectedWork()?.hash, reviewerIndex);
}
function syncReviewState() {
  if (!reviewAgreement) return;
  const state = selectedFunding();
  const stage = reviewAgreement.milestones.find(s => s.id === $('#review-stage').value);
  const { creator, reviewerIndex } = reviewAccess(stage);
  const reviewer = reviewerIndex >= 0;
  const session = wallet.getState();
  const canEdit = creator && !state.paid && !state.expired && state.approvals === 0;
  const hasLiveState = Boolean(accordCards.get(activeAccord.agreementId)?.live);
  if (hasLiveState) $('#review-submission-status').textContent = state.submissionHash ? 'Work submitted' : 'Work not submitted yet';
  const accessMessage = !session.account || creator || reviewer ? '' : reviewerIdentity ? 'This wallet has no submission or review role on this accord.'
    : identityLookup ? 'Checking your Sapient wallet…' : 'Check your Sapient wallet to see your role.';
  $('#review-access-status').hidden = !accessMessage;
  $('#review-access-status').textContent = accessMessage;
  $('#review-connect').hidden = !session.account || Boolean(reviewerIdentity) || Boolean(identityLookup);
  $('#review-output').hidden = !reviewer;
  $('#review-quorum').hidden = !reviewer;
  $('#review-reviewers').hidden = !reviewer;
  $('#review-terms').hidden = !reviewer;
  $('#review-stage-picker').hidden = (!creator && !reviewer) || reviewAgreement.milestones.length === 1;
  $('#review-options').hidden = !canEdit && !reviewer;
  const required = requiredApprovals(stage.reviewers.length, stage.approvalPercent);
  const amount = state.paid ? fromRawAmount(state.targetUnits) + ` ${unit} paid to the creator` : fromRawAmount(state.fundedUnits) + ' / ' + fromRawAmount(state.targetUnits) + ` ${unit} funded`;
  const status = state.paid ? 'Payout complete.' : state.expired ? 'Review closed.' : !state.fullyFunded ? 'Voting opens at full funding.'
    : !state.submissionHash ? 'Waiting for work from the creator.' : state.approved ? 'Ready for payout.' : 'Voting is open.';
  $('#review-output').textContent = `${amount} · ${status}`;
  $('#review-threshold').textContent = `${stage.approvalPercent}%`;
  $('#review-required-count').textContent = `${required} of ${stage.reviewers.length} reviewers`;
  $('#review-vote-count').textContent = `${state.approvals} of ${required}`;
  const requiredReviewer = required < stage.reviewers.length
    ? stage.reviewers.find(reviewer => reviewer.publicKey === stage.requiredReviewerPublicKey) : undefined;
  $('#review-required-vote').textContent = requiredReviewer
    ? (state.requiredReviewerApproved ? `${requiredReviewer.name} approved` : `${requiredReviewer.name} required`) : '';

  const pending = pendingWork.get(activeAccord.agreementId);
  if (pending && state.submissionHash === pending.hash) pendingWork.delete(activeAccord.agreementId);
  const waiting = pendingWork.has(activeAccord.agreementId);
  const work = selectedWork();
  const matches = Boolean(work && state.submissionHash === work.hash);
  const verifiedWork = hasLiveState && matches && work !== bundledWork;
  const shareable = verifiedWork && (creator || reviewer);
  if (verifiedWork) {
    const card = accordCards.get(activeAccord.agreementId);
    if (card.work?.hash !== work.hash) {
      card.work = work;
      renderAccordWebsite(card);
    }
  }
  const canRecover = creator && hasLiveState && Boolean(state.submissionHash) && !canEdit && !matches;
  $('#work-fields').hidden = !canEdit && !canRecover;
  $('#work-fields-help').textContent = canRecover
    ? 'Re-enter the submitted website and any description to recover the review link.'
    : 'Add a website, a description, or both. Your review link includes what you enter here.';
  const canSubmit = canEdit && !matches;
  const message = creator && waiting ? 'Submitted in Sapient. Check for on-chain confirmation before sharing.'
    : matches ? 'Work verified against the on-chain submission.'
    : state.submissionHash ? (work ? 'This work differs from the registered submission.' : canRecover ? '' : 'Open the review link shared by the developer.')
    : '';
  $('#review-work-status').hidden = (!creator && !reviewer) || !message;
  $('#review-work-status').textContent = message;
  $('#submit-work').hidden = !canSubmit || waiting;
  $('#submit-work').disabled = !work || submittingWork || Boolean(wallet.getState().requestId);
  $('#submit-work').textContent = state.submissionHash ? 'Replace work in Sapient' : 'Submit work in Sapient';
  $('#check-work-submission').hidden = !creator || !waiting;
  $('#project-link').disabled = submittingWork || waiting;
  $('#work-description').disabled = submittingWork || waiting;
  const verifiedWebsite = (creator || reviewer) && matches && work.url;
  $('#open-project').hidden = !verifiedWebsite;
  if (verifiedWebsite) $('#open-project').href = work.url;
  else $('#open-project').removeAttribute('href');
  $('#copy-review-link').hidden = !shareable;
  const verifiedDescription = (creator || reviewer) && matches && (!canEdit || work === bundledWork) ? work.description : '';
  $('#submitted-work').hidden = !verifiedDescription;
  $('#submitted-work-description').textContent = verifiedDescription || '';
  $('#review-fund').hidden = !reviewer || state.fullyFunded || state.expired || state.paid;
  $('#approve-review').hidden = !reviewer || !matches || !state.fullyFunded || state.expired || state.paid || state.approved;
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
function renderAccordWebsite(card) {
  const work = card.work;
  const verified = Boolean(work && card.live?.submissionHash === work.hash);
  if (verified) rememberReviewWork(card.deployment.agreementId, work);
  const link = card.node.querySelector('[data-ui="accord-website"]');
  const website = verified && work.url;
  link.hidden = !website;
  if (website) link.href = website;
  else link.removeAttribute('href');
  card.node.querySelector('[data-ui="copy-accord-work-link"]').hidden = !website;
}
async function loadAccordWebsite(card, { website, description }) {
  if (!website && !description) return;
  const work = await projectWork(website, description);
  if (card.work && card.live?.submissionHash === card.work.hash && card.live.submissionHash !== work.hash) return;
  card.work = work;
  renderAccordWebsite(card);
}
function renderAccordCard(card, state, live = false) {
  const { deployment, node } = card;
  if (live && card.live && (state.version < card.live.version || BigInt(state.epoch) < BigInt(card.live.epoch))) throw new Error('Indexer returned an older checkpoint. Try again later.');
  card.state = state;
  if (live) card.live = state;
  renderAccordWebsite(card);
  const ui = name => node.querySelector('[data-ui="' + name + '"]');
  const stage = deployment.agreement.milestones[0];
  ui('funded-label').textContent = state.paid ? 'Paid to creator' : 'Funded';
  ui('funded-amount').textContent = state.paid ? fromRawAmount(state.targetUnits) + ` ${unit}` : fromRawAmount(state.fundedUnits) + ' / ' + fromRawAmount(state.targetUnits) + ` ${unit}`;
  ui('remaining-amount').textContent = fromRawAmount(state.remainingUnits) + ` ${unit}`;
  ui('funding-progress').value = state.paid ? 100 : Number(BigInt(state.fundedUnits) * 10000n / BigInt(state.targetUnits)) / 100;
  setFundingPanel(card, !ui('funding-panel').hidden);
  const minimum = state.minimumUnits && BigInt(state.minimumUnits) < BigInt(state.remainingUnits) ? ` Minimum ${fromRawAmount(state.minimumUnits)} ${unit}.` : '';
  ui('contribution-limit').textContent = `Maximum ${fromRawAmount(state.remainingUnits)} ${unit}.${minimum}`;
  ui('funding-label').textContent = state.paid ? 'Paid out' : state.expired ? 'Funding closed' : state.fullyFunded ? 'Fully funded' : 'Funding open';
  ui('funding-note').textContent = state.paid ? '' : state.expired ? 'Unpaid contributions can be refunded.'
    : state.fullyFunded ? '' : 'Voting opens at full funding.';
  ui('accord-vote-count').textContent = `${state.approvals} of ${stage.reviewers.length}`;
  const awaitingRequired = !state.expired && state.approvals >= card.requiredApprovals && !state.requiredReviewerApproved && card.requiredReviewer;
  ui('accord-quorum-status').textContent = state.approved || state.paid ? 'Quorum met'
    : awaitingRequired ? `Waiting for ${card.requiredReviewer.name}` : '';
  ui('accord-time-left').textContent = deployment.archivedOnReset ? 'Archived' : state.paid ? 'Paid out'
    : state.expired ? 'Expired' : live ? formatDeadlineRemaining(state.epoch, stage.refundEpoch) : '—';
  card.reviewerVotes.forEach((label, index) => {
    const vote = state.votes?.[index];
    label.textContent = vote === true ? 'Approved' : vote === false ? 'No vote' : '';
    label.classList.toggle('approved', vote === true);
  });
  ui('explore-open-accord').textContent = state.fullyFunded ? 'Review work' : 'View accord';
  ui('explore-checkpoint').textContent = live
    ? `Refreshed from the ${chain.name} indexer · epoch ` + state.epoch + ' · ' + new Date(state.checkedAt).toLocaleTimeString() + '.'
    : 'Recorded checkpoint at chain epoch ' + deployment.recordedEpoch + '. Refresh for current funding and votes.';
  card.controls?.render();
  if (activeAccord?.agreementId === deployment.agreementId) syncReviewState();
}
function addAccord(deployment, verifiedState) {
  if (accordCards.has(deployment.agreementId)) return;
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
  const quorum = requiredApprovals(stage.reviewers.length, stage.approvalPercent);
  const requiredReviewer = quorum < stage.reviewers.length
    ? stage.reviewers.find(reviewer => reviewer.publicKey === stage.requiredReviewerPublicKey) : undefined;
  ui('accord-threshold').textContent = `${stage.approvalPercent}%`;
  ui('accord-required-count').textContent = `${quorum} of ${stage.reviewers.length} reviewers must approve`;
  ui('accord-deadline-epoch').textContent = `Deadline epoch ${stage.refundEpoch}`;
  const reviewerList = ui('accord-reviewers');
  const reviewerVotes = stage.reviewers.map(reviewer => {
    const row = document.createElement('li');
    const name = textElement('span', reviewer.name, 'accord-reviewer-name');
    if (reviewer === requiredReviewer) name.append(' ', textElement('small', 'Required'));
    const vote = textElement('span', '', 'accord-reviewer-vote');
    row.append(name, vote);
    reviewerList.append(row);
    return vote;
  });
  const stock = deployment.agreement.schema === SAPIENT_ESCROW_SCHEMA;
  ui('privacy-note').textContent = stock
    ? 'Contribution amounts, the remaining counter and reviewer votes are public. The deposit uses one-time keys and omits the donor base wallet address. Wallet preparation and transaction history can link activity. Return memos are encrypted to the wallet and require a private view grant.' + (network === 'esmeralda' ? ' Four reviewers are deployer-operated test wallets.' : '')
    : 'Earlier private-output escrow: encrypted transfer values, with contribution sizes inferable from public total changes. Transaction links and timing remain visible. Four reviewers are deployer-operated test wallets.';
  const state = verifiedState ?? { ...fundingState({ targetUnits: stage.targetUnits, fundedUnits: deployment.recordedFundingUnits, paid: deployment.recordedPaid ?? false, epoch: deployment.recordedEpoch, deadline: stage.refundEpoch }), approvals: deployment.recordedApprovals, votes: deployment.recordedVotes,
    requiredReviewerApproved: deployment.recordedRequiredReviewerApproved || false, approved: deployment.recordedApproved ?? false,
    submissionHash: deployment.recordedSubmissionHash ?? deployment.submissionHash };
  const card = { deployment, node, state, live: null, requiredApprovals: quorum, requiredReviewer, reviewerVotes };
  accordCards.set(deployment.agreementId, card);
  renderAccordCard(card, state, Boolean(verifiedState));
  if (!deployment.archivedOnReset) void loadAccordWebsite(card, knownReviewWork(deployment)).catch(() => {});
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
  ui('copy-accord-work-link').addEventListener('click', event => action(event.currentTarget, async () => {
    if (!card.work?.url || card.live?.submissionHash !== card.work.hash) return;
    await navigator.clipboard.writeText(accordWorkLink(deployment, card.work, 'explore'));
    notify('Accord link copied.');
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
  const list = $(!deployment.archivedOnReset && stock ? '#accord-list' : '#earlier-accord-list');
  if (verifiedState) list.prepend(node);
  else list.append(node);
}
accords.forEach(deployment => addAccord(deployment));

// Agreements use reviewer wallet signatures.
$('#resource-address').value = NATIVE_TARI_RESOURCE;
$('#resource-address').readOnly = true;

function deadlineEpoch(input) {
  if (input.value) return estimateDeadlineEpoch(input.value, epochSnapshot);
  if (input.dataset.savedEpoch) return input.dataset.savedEpoch;
  throw new Error('Choose a review deadline.');
}

function showDeadline(article) {
  const input = article.querySelector('[data-field=deadline]');
  const current = article.querySelector('[data-current-epoch]');
  const deadline = article.querySelector('[data-deadline-epoch]');
  const help = article.querySelector('.deadline-preview');
  let epoch = input.dataset.savedEpoch ?? '—';
  let message = input.dataset.savedEpoch ? 'Saved draft deadline. Pick a date to change it.' : '';
  if (input.value) {
    try {
      epoch = deadlineEpoch(input);
      message = 'Estimated from your chosen time. The exact cutoff depends on block production.';
    } catch (error) {
      epoch = '—';
      message = error.message;
    }
  }
  const currentEpoch = epochSnapshot ? String(epochSnapshot.epoch) : '—';
  if (current.textContent !== currentEpoch) current.textContent = currentEpoch;
  if (deadline.textContent !== epoch) deadline.textContent = epoch;
  if (help.textContent !== message) help.textContent = message;
}

async function refreshCreateEpoch() {
  if (reviewRoute() !== 'create' || refreshingCreateEpoch) return;
  refreshingCreateEpoch = true;
  try {
    const epoch = await readCurrentEpoch(network);
    if (epochSnapshot?.epoch !== epoch) epochSnapshot = { epoch, observedAt: Date.now() };
  } catch {
    epochSnapshot = null;
  } finally {
    refreshingCreateEpoch = false;
    $$('.designer-stage').forEach(showDeadline);
  }
}

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
    <label for="${id}-percent">Approval required (%)</label><input id="${id}-percent" data-field="percent" type="number" min="1" max="100" step="1" value="${network === 'mainnet' ? 100 : 60}" aria-describedby="${id}-quorum-preview" required><p id="${id}-quorum-preview" class="field-help quorum-preview" aria-live="polite"></p>
    <label for="${id}-deadline">Review deadline (your local time)</label><input id="${id}-deadline" data-field="deadline" type="datetime-local" aria-describedby="${id}-deadline-preview" required>
    <dl class="deadline-epochs" aria-live="polite">
      <div><dt>Current ${chain.name} epoch</dt><dd><strong data-current-epoch>—</strong></dd></div>
      <div><dt>Deadline epoch</dt><dd><strong data-deadline-epoch>—</strong></dd></div>
    </dl>
    <p id="${id}-deadline-preview" class="field-help deadline-preview" aria-live="polite"></p>`;
  article.querySelector('[data-field=title]').value = title;
  article.querySelector('[data-field=deadline]').addEventListener('input', () => showDeadline(article));
  showDeadline(article);
  if (network === 'mainnet') {
    const goal = article.querySelector('[data-field=target]');
    goal.required = true;
    goal.placeholder = '';
    article.querySelector('.remove-stage').hidden = true;
  }
  function updateQuorum() {
    const preview = article.querySelector('.quorum-preview');
    const rows = [...article.querySelectorAll('[data-reviewer]')];
    const count = rows.length;
    const percent = Number(article.querySelector('[data-field=percent]').value);
    rows.forEach((row, index) => {
      const badge = row.querySelector('[data-required-reviewer]');
      const name = row.querySelector('[data-reviewer-name]');
      badge.hidden = network !== 'mainnet' || index !== 0;
      if (badge.hidden) name.removeAttribute('aria-describedby');
      else name.setAttribute('aria-describedby', badge.id);
    });
    try {
      const votes = requiredApprovals(count, percent);
      const summary = `${votes} of ${count} reviewers must approve`;
      preview.textContent = votes === count ? (count === 1 ? 'The only reviewer must approve.' : `All ${count} reviewers must approve.`) : `${summary}.`;
      if (network === 'mainnet' && votes < count) {
        const requiredName = rows[0].querySelector('[data-reviewer-name]').value.trim() || 'the first reviewer';
        preview.textContent = `${summary}, including ${requiredName}. Payout waits for the required reviewer even if the other reviewers meet the percentage.`;
      }
    } catch { preview.textContent = 'Choose a whole percentage from 1 to 100.'; }
  }
  function addReviewer() {
    if (article.querySelectorAll('[data-reviewer]').length >= 10) return notify('Use at most ten reviewers per milestone.', true);
    const row = document.createElement('div'); row.className = 'reviewer-row';
    reviewerCounter += 1; const prefix = 'reviewer-' + reviewerCounter;
    row.dataset.reviewer = '';
    row.innerHTML = `<div class="reviewer-name-label"><label for="${prefix}-name">Reviewer name or pseudonym</label><span id="${prefix}-required" data-required-reviewer hidden>Required reviewer</span></div>
      <input id="${prefix}-name" data-reviewer-name required maxlength="100">
      <label for="${prefix}-wallet">Reviewer Sapient wallet address</label><textarea id="${prefix}-wallet" data-reviewer-wallet rows="3" required maxlength="240" spellcheck="false"></textarea>
      <button type="button" class="text-button use-wallet">Use my connected Sapient wallet</button><button type="button" class="text-button remove-reviewer">Remove reviewer</button>`;
    row.querySelector('[data-reviewer-wallet]').placeholder = `${chain.walletPrefix}1…`;
    row.querySelector('[data-reviewer-name]').addEventListener('input', updateQuorum);
    row.querySelector('.use-wallet').addEventListener('click', event => action(event.currentTarget, async () => { row.querySelector('[data-reviewer-wallet]').value = (await readReviewerIdentity()).walletAddress; notify('Reviewer address read from Sapient.'); }));
    row.querySelector('.remove-reviewer').addEventListener('click', () => {
      if (article.querySelectorAll('[data-reviewer]').length === 1) return notify('Keep at least one reviewer.', true);
      row.remove();
      updateQuorum();
    });
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
  return article;
}
$('#add-stage').addEventListener('click', () => addDesignerStage());
addDesignerStage('Delivery');

$('#draft-file').addEventListener('change', event => action(null, async () => {
  const [file] = event.target.files;
  if (!file) return;
  if (file.size > 30000) throw new Error('Choose a saved OotleAccord draft.');
  const draft = validateAgreement(JSON.parse(await file.text()));
  if (draft.schema !== QUORUM_AGREEMENT_SCHEMA || draft.network !== 'mainnet' || draft.milestones.length !== 1) {
    throw new Error('Choose a Mainnet draft with one milestone.');
  }
  $('#campaign-title').value = draft.title;
  $('#campaign-description').value = draft.description;
  $('#creator-address').value = draft.creatorWalletAddress;
  $('#designer-stages').replaceChildren();
  const [stage] = draft.milestones;
  const article = addDesignerStage(stage.title);
  article.dataset.id = stage.id;
  for (const [name, value] of Object.entries({ description: stage.description, target: stage.targetUnits ? fromRawAmount(stage.targetUnits) : '', percent: stage.approvalPercent })) {
    article.querySelector(`[data-field=${name}]`).value = value;
  }
  const deadline = article.querySelector('[data-field=deadline]');
  deadline.required = false;
  deadline.dataset.savedEpoch = stage.refundEpoch;
  showDeadline(article);
  for (let index = 0; index < stage.reviewers.length; index++) {
    if (index > 0) article.querySelector('.add-reviewer').click();
    const row = article.querySelectorAll('[data-reviewer]')[index];
    row.querySelector('[data-reviewer-name]').value = stage.reviewers[index].name;
    row.querySelector('[data-reviewer-wallet]').value = stage.reviewers[index].walletAddress;
  }
  article.querySelector('[data-field=percent]').dispatchEvent(new Event('input'));
  $('#open-draft').open = false;
  event.target.value = '';
  agreementDirty = true;
  $('#agreement-output').textContent = 'Draft opened.';
}));

function agreementDraft() {
  const stages = $$('.designer-stage').map(article => {
    const value = name => article.querySelector(`[data-field=${name}]`).value.trim();
    const target = value('target');
    return {
      id: article.dataset.id, title: value('title'), description: value('description'),
      reviewers: [...article.querySelectorAll('[data-reviewer]')].map(row => ({ name: row.querySelector('[data-reviewer-name]').value.trim(), role: 'Independent reviewer', walletAddress: row.querySelector('[data-reviewer-wallet]').value.trim() })), approvalPercent: Number(value('percent')),
      refundEpoch: deadlineEpoch(article.querySelector('[data-field=deadline]')),
      ...(target ? { targetUnits: toRawAmount(target) } : {}),
    };
  });
  return validateAgreement({
    schema: QUORUM_AGREEMENT_SCHEMA, title: $('#campaign-title').value.trim(), description: $('#campaign-description').value.trim(),
    network, resourceAddress: $('#resource-address').value.trim(),
    creatorWalletAddress: $('#creator-address').value.trim(), milestones: stages,
  });
}

function showCreationControls() {
  $('#publish-accord').disabled = Boolean(pendingCreation) || publishing;
  $('#check-published').hidden = !pendingCreation;
  $('#recover-publication').hidden = !pendingCreation || Boolean(pendingCreation.transactionId) || Boolean(wallet.getState().requestId);
  $('#copy-published').hidden = !createdRecord;
}

function rememberCreation(record) {
  pendingCreation = record;
  try {
    if (record) sessionStorage.setItem(CREATION_KEY, JSON.stringify(record));
    else sessionStorage.removeItem(CREATION_KEY);
  } catch { /* Keep the current attempt in this tab when storage is blocked. */ }
  showCreationControls();
}

async function addPublishedAccord(record) {
  const { deployment, state } = await verifyPublishedEscrow(record);
  if (!accordCards.has(deployment.agreementId)) {
    accords.push(deployment);
    addAccord(deployment, state);
    $('#empty-accords').hidden = true;
  }
  const published = { agreement: deployment.agreement, component: deployment.component };
  publishedRecords.set(deployment.agreementId, published);
  try {
    const saved = readStorage('localStorage', PUBLISHED_KEY, []);
    const records = Array.isArray(saved) ? saved.filter(item => item?.component !== published.component) : [];
    localStorage.setItem(PUBLISHED_KEY, JSON.stringify([...records, published].slice(-12)));
  }
  catch { /* The public share link still works when browser storage is blocked. */ }
  return { deployment, record: published };
}

async function confirmPublication(transactionId) {
  const current = pendingCreation;
  if (!current) return;
  if (!/^[a-f0-9]{64}$/.test(transactionId ?? '')) throw new Error('Enter the 64-character transaction ID from Sapient.');
  rememberCreation({ ...current, transactionId });
  $('#agreement-output').textContent = 'Checking publication on Mainnet…';
  try {
    const published = await addPublishedAccord(pendingCreation);
    createdRecord = published.record;
    rememberCreation(null);
    agreementDirty = false;
    $('#agreement-output').textContent = 'Accord published. Open it in Accords or copy the link to share.';
  } catch (error) {
    if (error.code === 'PUBLISH_REJECTED') rememberCreation(null);
    $('#agreement-output').textContent = error.message;
  }
}

$('#use-creator-wallet').addEventListener('click', event => action(event.currentTarget, async () => {
  $('#creator-address').value = (await readReviewerIdentity()).walletAddress;
  agreementDirty = true;
}));
$('#save-agreement').addEventListener('click', event => action(event.currentTarget, async () => {
  if (!$('#agreement-form').reportValidity()) return;
  const agreement = agreementDraft();
  const id = await agreementId(agreement);
  downloadJson(agreement, `ootleaccord-${id.slice(0, 12)}.json`);
  $('#agreement-output').textContent = 'Draft downloaded.';
}));
$('#agreement-form').addEventListener('submit', event => {
  event.preventDefault();
  if (network !== 'mainnet' || pendingCreation || publishing || event.submitter?.id !== 'publish-accord') return;
  action(event.submitter, async () => {
    if (wallet.getState().requestId) throw new Error('Finish the current request in Sapient before publishing.');
    const draft = agreementDraft();
    publishing = true;
    $('#agreement-output').textContent = 'Checking your publishing wallet…';
    showCreationControls();
    try {
      if (!wallet.getState().account) await wallet.connect();
      const result = await wallet.createMainnetEscrow({ draft, requiredReviewer: 0, onPrepared(agreement) {
        rememberCreation({ agreement });
        $('#agreement-output').textContent = 'Review and approve the publish request in Sapient.';
      } });
      await confirmPublication(result.transactionId);
    } catch (error) {
      if (error.code === 'REJECTED' || (pendingCreation && !pendingCreation.requestId)) rememberCreation(null);
      $('#agreement-output').textContent = error.message;
    } finally { publishing = false; showCreationControls(); }
  });
});
$('#check-published').addEventListener('click', event => action(event.currentTarget, async () => {
  if (pendingCreation?.transactionId) await confirmPublication(pendingCreation.transactionId);
  else if (wallet.getState().requestId) $('#wallet-dialog').showModal();
  else {
    $('#recover-publication').open = true;
    $('#publish-tx-id').focus();
  }
}));
$('#recover-published').addEventListener('click', event => action(event.currentTarget, () => confirmPublication($('#publish-tx-id').value.trim())));
$('#copy-published').addEventListener('click', event => action(event.currentTarget, async () => {
  if (!createdRecord) return;
  const url = new URL(location.href);
  url.search = '';
  url.hash = 'explore?' + new URLSearchParams({ published: JSON.stringify(createdRecord) });
  await navigator.clipboard.writeText(url.href);
  notify('Accord link copied.');
}));
showCreationControls();
if (pendingCreation) $('#agreement-output').textContent = 'An accord publication is waiting to be checked.';

function forgetWalletIdentity() {
  identityGeneration++;
  reviewerIdentity = null;
  identityLookup = null;
  $('#reviewer-wallet').value = '';
  $('#reviewer-identity').hidden = true;
}
function loadWalletIdentity() {
  if (reviewerIdentity) return Promise.resolve(reviewerIdentity);
  if (identityLookup) return identityLookup;
  const generation = identityGeneration;
  identityLookup = Promise.resolve().then(async () => {
    const identity = await wallet.getReviewerIdentity();
    if (generation !== identityGeneration) throw new Error('The Sapient wallet changed. Check the connected wallet again.');
    reviewerIdentity = identity;
    return identity;
  }).finally(() => {
    if (generation === identityGeneration) {
      identityLookup = null;
      syncReviewState();
    }
  });
  syncReviewState();
  return identityLookup;
}
async function readReviewerIdentity() {
  if (!wallet.getState().account) await wallet.connect();
  const identity = await loadWalletIdentity();
  $('#reviewer-wallet').value = identity.walletAddress;
  $('#reviewer-identity').hidden = false;
  return identity;
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
  const needsSpecificReviewer = requiredApprovals(stage.reviewers.length, stage.approvalPercent) < stage.reviewers.length;
  const reviewers = stage.reviewers.map(reviewer => {
    const name = needsSpecificReviewer && reviewer.publicKey === stage.requiredReviewerPublicKey ? `${reviewer.name} (required)` : reviewer.name;
    const item = textElement('li', name);
    item.append(textElement('code', reviewer.walletAddress));
    return item;
  });
  $('#review-reviewer-list').replaceChildren(...reviewers);
  $('#review-terms').replaceChildren(textElement('p', stage.title), textElement('p', stage.description, 'field-help'), textElement('p', `Review before chain epoch ${stage.refundEpoch}.`, 'field-help'));
}
$('#review-stage').addEventListener('change', () => { renderReviewTerms(); syncReviewState(); });
async function setReviewWork() {
  const read = ++workRead;
  const website = $('#project-link');
  const description = $('#work-description');
  chosenWork = null;
  website.setCustomValidity('');
  description.setCustomValidity('');
  syncReviewState();
  if (!website.value.trim() && !description.value.trim()) return;
  try {
    const work = await projectWork(website.value, description.value);
    if (read !== workRead) return;
    chosenWork = work;
    syncReviewState();
  } catch (error) {
    if (read !== workRead) return;
    const field = error instanceof RangeError ? description : website;
    field.setCustomValidity(error.message);
  }
}
async function loadAccord(deployment = activeAccord, projectLink = '', description = '') {
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
  bundledWork = hash ? { hash, description: deployment.work } : null;
  if (!projectLink && !description) {
    ({ website: projectLink, description } = knownReviewWork(deployment));
  }
  $('#project-link').value = projectLink;
  $('#project-link').setCustomValidity('');
  $('#work-description').value = description;
  $('#work-description').setCustomValidity('');
  $('#review-options').open = false;
  $('#review-reviewers').open = false;
  $('#review-form').hidden = false;
  $('#review-stage').replaceChildren(...terms.milestones.map(s => new Option(s.title, s.id)));
  $('#review-submission-status').textContent = 'Checking submission status…';
  $('#review-heading').textContent = terms.title;
  $('#review-error').hidden = true;
  renderReviewTerms();
  syncReviewState();
  if (projectLink || description) await setReviewWork();
  void refreshReview(deployment).catch(() => {
    if (activeAccord === deployment && !accordCards.get(deployment.agreementId)?.live) {
      $('#review-submission-status').textContent = 'Submission status unavailable.';
    }
  });
  return true;
}
function routeParams() {
  const query = location.hash.indexOf('?');
  return new URLSearchParams(query < 0 ? '' : location.hash.slice(query + 1));
}
async function openPublishedRoute(params) {
  const encoded = params.get('published');
  if (!encoded || encoded.length > 20000 || network !== 'mainnet') throw new Error('Open a valid published accord link on Mainnet.');
  let record;
  try { record = JSON.parse(encoded); } catch { throw new Error('This published accord link is invalid.'); }
  const { deployment } = await addPublishedAccord(record);
  return deployment;
}
function openReviewRoute() {
  const params = routeParams();
  if (params.has('published')) {
    const hash = location.hash;
    void action(null, async () => {
      const deployment = await openPublishedRoute(params);
      if (location.hash === hash) await loadAccord(deployment, params.get('work') || '', params.get('description') || '');
    });
    return;
  }
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
  void action(null, () => loadAccord(deployment, params.get('work') || '', params.get('description') || ''));
}
function checkSharedRoute() {
  if (reviewRoute() === 'review') openReviewRoute();
  if (reviewRoute() !== 'explore') return;
  const params = routeParams();
  if (params.has('published') || params.has('work')) void action(null, async () => {
    const deployment = params.has('published') ? await openPublishedRoute(params)
      : accords.find(accord => accord.agreementId === params.get('accord') && !accord.archivedOnReset);
    if (!deployment) throw new Error('This accord link is unavailable on this network.');
    await loadAccordWebsite(accordCards.get(deployment.agreementId), {
      website: params.get('work') ?? '', description: params.get('description') ?? '',
    });
  });
}
$$('[data-view]').forEach(button => button.addEventListener('click', () => {
  showView(button.dataset.view);
  if (button.dataset.view === 'review' && !reviewAgreement) openReviewRoute();
}));
window.addEventListener('hashchange', () => {
  showView(reviewRoute());
  checkSharedRoute();
});
showView(reviewRoute(), { focus: false });
checkSharedRoute();
if (network === 'mainnet') {
  const saved = readStorage('localStorage', PUBLISHED_KEY, []);
  if (Array.isArray(saved)) void Promise.allSettled(saved.slice(-12).map(addPublishedAccord));
}
$('#review-fund').addEventListener('click', () => {
  const card = accordCards.get(activeAccord?.agreementId);
  if (!card) return;
  showView('explore', { focus: false });
  setFundingPanel(card, true);
  card.node.querySelector('[data-ui="contribution-amount"]').focus();
});
$('#review-form').addEventListener('submit', event => event.preventDefault());
$('#review-connect').addEventListener('click', event => action(event.currentTarget, loadWalletIdentity));
$('#approve-review').addEventListener('click', event => {
  action(event.currentTarget, async () => {
    if (!reviewAgreement) throw new Error('Open an accord first.');
    const workHash = selectedWork()?.hash;
    if (!workHash) throw new Error('Open the review link shared by the developer.');
    const deployment = activeAccord;
    const agreement = reviewAgreement;
    const stageId = $('#review-stage').value;
    if (approvalUnavailable()) throw new Error('This accord is not ready for approval. Refresh its balance and wait for full funding.');
    approvingWork = true;
    try {
      if (activeAccord !== deployment || selectedWork()?.hash !== workHash || reviewAccess().reviewerIndex < 0) {
        throw new Error('The selected work or Sapient reviewer changed. Check both before approving.');
      }
      const result = await wallet.approveMilestone({ agreement, deployment, stageId, submissionHash: workHash, maxFee: toRawAmount($('#review-fee').value.trim()) });
      ownReviewVote = { agreementId: deployment.agreementId, account: wallet.getState().account };
      walletSubmission(result, $('#review-output'));
      try { await refreshReview(deployment); }
      catch { /* The successful vote stays disabled even while the public checkpoint catches up. */ }
    } finally { approvingWork = false; }
  }, { reviewError: true });
});

for (const field of [$('#project-link'), $('#work-description')]) {
  field.addEventListener('input', () => void setReviewWork());
  field.addEventListener('blur', () => field.reportValidity());
}

$('#copy-review-link').addEventListener('click', event => action(event.currentTarget, async () => {
  const { creator, reviewerIndex } = reviewAccess();
  if (!creator && reviewerIndex < 0) return;
  const work = selectedWork();
  if (!work || work === bundledWork || work.hash !== selectedFunding()?.submissionHash) throw new Error('Confirm the work submission before sharing.');
  await navigator.clipboard.writeText(accordWorkLink(activeAccord, work, 'review'));
  notify('Review link copied.');
}));

async function refreshReview(deployment) {
  const state = await refreshEscrow(deployment);
  renderAccordCard(accordCards.get(deployment.agreementId), state, true);
  return state;
}
$('#submit-work').addEventListener('click', event => action(event.currentTarget, async () => {
  if (!reviewAccess().creator) return;
  const work = selectedWork();
  const deployment = activeAccord;
  const agreement = reviewAgreement;
  if (!agreement || !work || work === bundledWork) throw new Error('Enter a website or work description first.');
  if (submittingWork || pendingWork.has(deployment.agreementId)) return;
  const stageId = $('#review-stage').value;
  const maxFee = toRawAmount($('#review-fee').value.trim());
  submittingWork = true;
  syncReviewState();
  try {
    const live = await refreshReview(deployment);
    if (live.submissionHash === work.hash) return;
    if (live.paid || live.expired || live.approvals > 0) throw new Error('Work submission is closed for this accord.');
    if (activeAccord !== deployment || selectedWork()?.hash !== work.hash || !reviewAccess().creator) {
      throw new Error('The selected work or Sapient creator changed. Check both before submitting.');
    }
    const result = await wallet.submitWork({ agreement, stageId, submissionHash: work.hash, maxFee });
    pendingWork.set(deployment.agreementId, { id: result.transactionId, hash: work.hash });
    try { await refreshReview(deployment); } catch { /* Keep the pending submission available to check. */ }
  } finally { submittingWork = false; }
}, { reviewError: true }));

$('#check-work-submission').addEventListener('click', event => action(event.currentTarget, async () => {
  if (!reviewAccess().creator) return;
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
$('#wallet-resume').addEventListener('click', event => {
  const requestId = wallet.getState().requestId;
  const isPublication = Boolean(requestId && pendingCreation?.requestId === requestId);
  action(event.currentTarget, async () => {
    try {
      const result = await wallet.resumePending();
      if (!isPublication) return walletSubmission(result);
      $('#wallet-dialog').close();
      await confirmPublication(result.transactionId);
      showView('create');
    } catch (error) {
      if (isPublication && error.code === 'REJECTED') rememberCreation(null);
      throw error;
    }
  }, { reviewError: !isPublication });
});
wallet.subscribe(state => {
  const connected = Boolean(state.account);
  if (ownReviewVote && ownReviewVote.account !== state.account) ownReviewVote = null;
  const connection = connected ? `${state.network}:${state.account}` : '';
  if (connection !== identityConnection) {
    const previousConnection = identityConnection;
    identityConnection = connection;
    forgetWalletIdentity();
    if (connected && reviewRoute() === 'review') void loadWalletIdentity().catch(() => {});
    if (!connected && previousConnection) queueMicrotask(restoreWallet);
  }
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
  if (publishing && pendingCreation && !pendingCreation.transactionId && state.requestId && state.requestId !== pendingCreation.requestId) {
    rememberCreation({ ...pendingCreation, requestId: state.requestId });
  }
  showCreationControls();
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
  void wallet.restoreConnection().then(state => {
    if (state.account && reviewRoute() === 'review') return loadWalletIdentity();
  }).catch(() => {});
}
restoreWallet();
window.addEventListener('pageshow', restoreWallet);
window.addEventListener('focus', restoreWallet);
window.addEventListener('tari#initialized', restoreWallet);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    restoreWallet();
    void refreshCreateEpoch();
  }
});
setInterval(() => {
  if (document.visibilityState === 'visible') void refreshCreateEpoch();
}, 30000);

window.addEventListener('pagehide', () => { forgetWalletIdentity(); syncReviewState(); });

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
    !$('#project-link').value && !$('#work-description').value &&
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
