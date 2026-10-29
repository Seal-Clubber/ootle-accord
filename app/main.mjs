import {
  WALLET_AGREEMENT_SCHEMA, NATIVE_TARI_RESOURCE, validateAgreement, agreementId,
  toRawAmount, fromRawAmount, verifyReviewerSecret,
} from './lib/accord.mjs';
import {
  decryptRecovery, encryptRecovery, createClaimHandoff, validateClaimHandoff,
} from './lib/recovery.mjs';
import { createSapientAdapter } from './lib/sapient.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const wallet = createSapientAdapter();
let reviewerIdentity = null;
let reviewAgreement = null;
let recovery = null;
let stageCounter = 0;
let feedbackTimer;

function notify(message, error = false) {
  clearTimeout(feedbackTimer);
  const output = $('#feedback');
  output.textContent = message;
  output.classList.toggle('error', error);
  output.hidden = false;
  feedbackTimer = setTimeout(() => { output.hidden = true; }, error ? 18000 : 10000);
}

async function action(button, work) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try { return await work(); }
  catch (error) { notify(error?.message || 'This action could not be completed.', true); }
  finally { if (button) button.disabled = false; }
}

function showView(name, { focus = true } = {}) {
  const names = ['explore', 'create', 'review', 'recover'];
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

async function readJson(file, limit = 262144) {
  if (!file) throw new Error('Choose a JSON file first.');
  if (file.size > limit) throw new Error('This file exceeds the supported size (256 KB).');
  try { return JSON.parse(await file.text()); }
  catch { throw new Error('This file is not valid JSON.'); }
}

function textElement(tag, content, className) {
  const el = document.createElement(tag);
  el.textContent = content;
  if (className) el.className = className;
  return el;
}

// The demonstration is deliberately separate from the protocol/wallet code. It has no network
// calls, real commitments, keys or exportable funding records; every amount lives in memory.
const demoStages = [
  { id: 'discovery', title: 'Research & plan', description: 'Agree on the scope, interview community organizers, and publish a practical plan.', target: '7200', reviewer: 'Community reviewer', refundEpoch: 24 },
  { id: 'build', title: 'Build the toolkit', description: 'Deliver the guides, templates, and a documented open-source release.', target: '9600', reviewer: 'Technical reviewer', refundEpoch: 48 },
  { id: 'review', title: 'Independent review', description: 'Review accessibility, test the materials, and publish the findings.', target: '7200', reviewer: 'Independent reviewer', refundEpoch: 72 },
];
let demoEpoch = 1;
let demoPledges = [];
const demoApproved = new Set();
function selectedDemoStage() { return demoStages.find(stage => stage.id === $('#demo-stage').value); }
function renderDemo() {
  $('#demo-epoch').textContent = String(demoEpoch);
  $('#demo-stages').replaceChildren(...demoStages.map((stage, index) => {
    const row = textElement('div', '', 'milestone');
    const body = textElement('div', '', 'milestone-body');
    body.append(textElement('h3', stage.title), textElement('p', stage.description));
    const released = demoApproved.has(stage.id);
    const expired = demoEpoch >= stage.refundEpoch;
    body.append(textElement('span', `${stage.reviewer} · refund epoch ${stage.refundEpoch} · ${released ? 'claimed in sandbox' : expired ? 'refund window open' : 'awaiting review'}`, 'milestone-status'));
    row.append(textElement('span', String(index + 1).padStart(2, '0'), 'milestone-number'), body, textElement('span', `${Number(stage.target).toLocaleString('en-US')} TARI`, 'milestone-budget'));
    return row;
  }));
  const stage = selectedDemoStage();
  const entries = demoPledges.filter(pledge => pledge.stageId === stage.id);
  const total = entries.reduce((amount, pledge) => amount + BigInt(pledge.amount), 0n);
  const state = demoApproved.has(stage.id) ? 'claimed by the creator' : entries.every(pledge => pledge.status === 'refunded') ? 'refunded to you' : 'locked for this milestone';
  $('#demo-receipt').textContent = entries.length ? `Only on this device: ${fromRawAmount(total.toString())} TARI across ${entries.length} simulated pledge${entries.length === 1 ? '' : 's'}, ${state}. This local receipt is not a real recovery file.` : 'Your simulated pledge will appear here. Individual amounts stay off the campaign display.';
}
$('#demo-pledge-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, () => {
    const stage = selectedDemoStage();
    if (demoEpoch >= stage.refundEpoch) throw new Error('This milestone is past its simulated claim deadline. Reset the sandbox to explore a new pledge.');
    if (demoApproved.has(stage.id)) throw new Error('This milestone has already been claimed in the sandbox. Choose another stage or reset it.');
    const amount = toRawAmount($('#demo-amount').value.trim());
    demoPledges.push({ stageId: stage.id, amount, status: 'locked' });
    renderDemo();
    notify(`Simulated ${fromRawAmount(amount)} TARI locked for “${stage.title}”. No funds moved.`);
  });
});
$('#demo-stage').addEventListener('change', renderDemo);
$$('[data-amount]').forEach(button => button.addEventListener('click', () => {
  $('#demo-amount').value = button.dataset.amount;
  $$('[data-amount]').forEach(item => item.classList.toggle('selected', item === button));
}));
$('#demo-amount').addEventListener('input', () => $$('[data-amount]').forEach(item => item.classList.toggle('selected', item.dataset.amount === $('#demo-amount').value)));
$('#demo-approve').addEventListener('click', event => action(event.currentTarget, () => {
  const stage = selectedDemoStage();
  if (demoEpoch >= stage.refundEpoch) throw new Error('Approval is too late: the simulated claim window has closed. Eligible pledges can be refunded.');
  const locked = demoPledges.filter(pledge => pledge.stageId === stage.id && pledge.status === 'locked');
  if (!locked.length) throw new Error('Simulate a pledge for this milestone first.');
  demoApproved.add(stage.id);
  locked.forEach(pledge => { pledge.status = 'claimed'; });
  renderDemo();
  notify('Reviewer approval and creator claim simulated. Already claimed funds cannot be refunded.');
}));
$('#demo-expire').addEventListener('click', () => {
  const stage = selectedDemoStage();
  demoEpoch = Math.max(demoEpoch, stage.refundEpoch);
  renderDemo();
  notify(`Simulated epoch ${demoEpoch}. Unclaimed pledges for this milestone are now eligible for refund.`);
});
$('#demo-refund').addEventListener('click', event => action(event.currentTarget, () => {
  const stage = selectedDemoStage();
  if (demoEpoch < stage.refundEpoch) throw new Error(`Refunds are not eligible yet. This milestone’s simulated refund epoch is ${stage.refundEpoch}.`);
  const eligible = demoPledges.filter(pledge => pledge.stageId === stage.id && pledge.status === 'locked');
  if (!eligible.length) throw new Error('There are no eligible unpaid pledges for this milestone. Claimed funds cannot be refunded.');
  eligible.forEach(pledge => { pledge.status = 'refunded'; });
  renderDemo();
  notify('Eligible local pledges refunded in the sandbox. No creator or reviewer permission was needed.');
}));
$('#demo-reset').addEventListener('click', () => { demoEpoch = 1; demoPledges = []; demoApproved.clear(); renderDemo(); notify('Sandbox reset. No real transactions were changed.'); });
renderDemo();

// New agreements use reviewer wallet signatures; v1 recovery remains legacy-only.
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
    <div class="form-grid"><div><label for="${id}-reviewer">Independent reviewer</label><input id="${id}-reviewer" data-field="reviewer" required maxlength="100" placeholder="Name or pseudonym"></div><div><label for="${id}-target">Public stage target (TARI)</label><input id="${id}-target" data-field="target" inputmode="decimal" placeholder="Optional planning target"></div></div>
    <label for="${id}-wallet">Reviewer’s Sapient wallet address</label><textarea id="${id}-wallet" data-field="wallet" rows="3" required maxlength="240" spellcheck="false" placeholder="otl_esm_1…"></textarea><button type="button" class="text-button use-reviewer-wallet">Use my connected Sapient wallet</button>
    <label for="${id}-epoch">Refund epoch (chain number)</label><input id="${id}-epoch" data-field="epoch" required inputmode="numeric" maxlength="16" placeholder="Confirm a future epoch on Esmeralda">`;
  article.querySelector('[data-field=title]').value = title;
  article.querySelector('.use-reviewer-wallet').addEventListener('click', event => action(event.currentTarget, async () => {
    const identity = await readReviewerIdentity();
    article.querySelector('[data-field=wallet]').value = identity.walletAddress;
    notify('Reviewer wallet copied from Sapient. No approval was signed.');
  }));
  article.querySelector('.remove-stage').addEventListener('click', () => {
    if ($$('.designer-stage').length === 1) return notify('Keep at least one milestone in the agreement.', true);
    article.remove();
  });
  $('#designer-stages').append(article);
}
$('#add-stage').addEventListener('click', () => addDesignerStage());
addDesignerStage('Build & deliver');
addDesignerStage('Independent review');
$('#agreement-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, async () => {
    $('#agreement-output').textContent = '';
    const stages = $$('.designer-stage').map(article => {
      const value = name => article.querySelector(`[data-field=${name}]`).value.trim();
      const target = value('target');
      return {
        id: article.dataset.id, title: value('title'), description: value('description'),
        reviewer: { name: value('reviewer'), role: 'Independent reviewer', walletAddress: value('wallet') },
        refundEpoch: value('epoch'),
        ...(target ? { targetUnits: toRawAmount(target) } : {}),
      };
    });
    const agreement = validateAgreement({
      schema: WALLET_AGREEMENT_SCHEMA, title: $('#campaign-title').value.trim(), description: $('#campaign-description').value.trim(),
      network: 'esmeralda', resourceAddress: $('#resource-address').value.trim(),
      creatorWalletAddress: $('#creator-address').value.trim(), milestones: stages,
    });
    const id = await agreementId(agreement);
    downloadJson(agreement, `ootleaccord-${id.slice(0, 12)}.json`);
    $('#agreement-output').textContent = `Public agreement exported. Agreement ID: ${id}. Compare this ID with your community before using the terms. No escrow was deployed or funded.`;
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
  notify('Reviewer address read from Sapient. No secrets were generated and no approval was signed.');
}));
$('#copy-reviewer-wallet').addEventListener('click', event => action(event.currentTarget, async () => {
  if (!reviewerIdentity) throw new Error('Connect the reviewer wallet first.');
  await navigator.clipboard.writeText(reviewerIdentity.walletAddress);
  notify('Public reviewer wallet address copied.');
}));
$('#review-agreement').addEventListener('change', event => action(null, async () => {
  reviewAgreement = null;
  $('#review-stage').replaceChildren(new Option('Import an agreement first', ''));
  $('#review-output').textContent = '';
  const agreement = validateAgreement(await readJson(event.target.files[0]));
  if (agreement.schema !== WALLET_AGREEMENT_SCHEMA) throw new Error('This is a legacy secret-based agreement. Import a v2 wallet-review agreement.');
  reviewAgreement = agreement;
  $('#review-stage').replaceChildren(...agreement.milestones.map(stage => new Option(stage.title, stage.id)));
  $('#review-output').textContent = 'Agreement: ' + agreement.title + '. ID: ' + await agreementId(agreement) + '. Compare these terms with the community before approval.';
}));
$('#review-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, async () => {
    if (!reviewAgreement) throw new Error('Import a wallet-review agreement first.');
    const result = await wallet.approveMilestone({ agreement: reviewAgreement, stageId: $('#review-stage').value, maxFee: toRawAmount($('#review-fee').value.trim()) });
    walletSubmission(result, $('#review-output'));
  });
});

function requireConnected() {
  if (!wallet.getState().account) {
    $('#wallet-dialog').showModal();
    throw new Error('Connect the appropriate Sapient wallet first, then request the action again.');
  }
}
function walletSubmission(result, output) {
  const message = `Wallet reports submission: ${result.transactionId}. This page has not independently verified chain acceptance. Check the transaction in Sapient.`;
  if (output) output.textContent = message;
  notify(message);
}
$('#claim-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, async () => {
    $('#claim-output').textContent = '';
    const handoff = await validateClaimHandoff(await readJson($('#claim-file').files[0]));
    const stage = handoff.agreement.milestones.find(item => item.id === handoff.stageId);
    const preimageHex = $('#claim-secret').value.trim();
    if (!await verifyReviewerSecret(preimageHex, stage.hashLockHex)) throw new Error('This reviewer secret does not match the milestone’s public hashlock.');
    const maxFee = toRawAmount($('#claim-fee').value.trim());
    requireConnected();
    const result = await wallet.claimMilestone({
      resourceAddress: handoff.agreement.resourceAddress, commitment: handoff.commitment,
      conditions: handoff.conditions, preimageHex, maxFee,
    });
    $('#claim-secret').value = '';
    walletSubmission(result, $('#claim-output'));
  });
});

function clearRecovery({ announce = true } = {}) {
  recovery = null;
  $('#recovery-result').hidden = true;
  $('#recovery-name').textContent = '';
  $('#recovery-facts').replaceChildren();
  $('#recovery-password').value = '';
  $('#new-password').value = '';
  $('#recovery-file').value = '';
  if (announce) notify('Recovery file locked and cleared from this page.');
}
$('#recovery-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, async () => {
    recovery = null;
    $('#recovery-result').hidden = true;
    try {
      recovery = await decryptRecovery(await readJson($('#recovery-file').files[0]), $('#recovery-password').value);
    } finally { $('#recovery-password').value = ''; }
    const stage = recovery.agreement.milestones.find(item => item.id === recovery.stageId);
    $('#recovery-name').textContent = recovery.agreement.title;
    const facts = [
      ['Milestone', stage.title], ['Private amount', `${fromRawAmount(recovery.amount)} TARI`],
      ['Refund epoch', stage.refundEpoch], ['Network', recovery.network],
      ['Agreement ID', recovery.agreementId], ['Locked commitment', recovery.commitment],
      ['Recorded status', 'Wallet-submitted · chain acceptance not verified'],
    ];
    $('#recovery-facts').replaceChildren(...facts.flatMap(([label, value]) => [textElement('dt', label), textElement('dd', value)]));
    $('#recovery-result').hidden = false;
    notify('Recovery decrypted locally. Its contents have not been checked against the chain.');
  });
});
$('#lock-recovery').addEventListener('click', () => clearRecovery());
$('#request-refund').addEventListener('click', event => action(event.currentTarget, async () => {
  if (!recovery) throw new Error('Open your encrypted recovery file first.');
  requireConnected();
  const maxFee = toRawAmount($('#refund-fee').value.trim());
  const result = await wallet.refundMilestone({
    resourceAddress: recovery.agreement.resourceAddress, commitment: recovery.commitment,
    conditions: recovery.conditions, amount: recovery.amount, outputMask: recovery.outputMask, maxFee,
  });
  walletSubmission(result);
}));
$('#export-handoff').addEventListener('click', event => action(event.currentTarget, async () => {
  if (!recovery) throw new Error('Open a recovery file first.');
  const handoff = await createClaimHandoff(recovery);
  downloadJson(handoff, `ootleaccord-${recovery.commitment.slice(0, 12)}.claim.json`);
  notify('Creator handoff saved without your refund mask or amount field. Deliver it privately; its conditions still reveal keys.');
}));
$('#reencrypt-backup').addEventListener('click', event => action(event.currentTarget, async () => {
  if (!recovery) throw new Error('Open a recovery file first.');
  const password = $('#new-password').value;
  $('#new-password').value = '';
  const envelope = await encryptRecovery(recovery, password);
  downloadJson(envelope, `ootleaccord-${recovery.commitment.slice(0, 12)}.accord-vault.json`);
  notify('Recovery encrypted with a fresh salt and IV. Retain your password separately.');
}));

// Wallet actions never run on page load. No balance/view-access request is made.
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
$('#wallet-resume').addEventListener('click', event => action(event.currentTarget, async () => walletSubmission(await wallet.resumePending())));
wallet.subscribe(state => {
  const connected = Boolean(state.account);
  if (!connected) { reviewerIdentity = null; $('#reviewer-wallet').value = ''; $('#reviewer-identity').hidden = true; }
  $('#wallet-open').textContent = connected ? 'Sapient connected ↗' : 'Connect Sapient ↗';
  $('#wallet-connect').hidden = connected;
  $('#wallet-disconnect').hidden = !connected;
  $('#wallet-resume').hidden = !state.requestId;
  const caps = state.capabilities;
  const lines = connected ? [
    `Network: ${state.network}`, `Status: ${state.status}`,
    `Account: ${state.account}`,
    `Private fees: ${caps?.supportsPrivateFees ? 'supported' : 'unavailable'}`,
    `Native claim/refund: ${caps?.scriptPathSpend ? 'supported by wallet' : 'unavailable'}`,
    'Private escrow funding: disabled (stock provider limitation)',
  ] : [`Status: ${state.status}`, 'Connecting is optional for the sandbox and agreement tools.'];
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

window.addEventListener('pagehide', () => {
  reviewerIdentity = null;
  recovery = null;
  $('#reviewer-wallet').value = '';
  $('#reviewer-identity').hidden = true;
  $('#claim-secret').value = '';
  clearRecovery({ announce: false });
});
