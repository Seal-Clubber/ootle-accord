import { ESCROW_AGREEMENT_SCHEMA, SAPIENT_ESCROW_SCHEMA, rawUnits, toRawAmount, fromRawAmount, validateAgreement, requiredApprovals } from './accord.mjs';
import { reviewerKeyFromWallet } from './wallet-address.mjs';
import { REVIEW_DEPLOYMENTS } from './review-deployments.mjs';

const INDEXER = 'https://ootle-indexer-a.tari.com';
const uint = value => {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new Error('Indexer returned an unsafe integer.');
  return rawUnits(typeof value === 'number' ? String(value) : value, 'Chain value', { allowZero: true });
};
const key = value => value?.['@cbor'] === 'bytes' && /^[a-f0-9]{64}$/.test(value.hex) ? value.hex : null;

export function fundingState({ targetUnits, fundedUnits, paid = false, epoch, deadline }) {
  const target = BigInt(rawUnits(targetUnits, 'Funding goal'));
  const funded = BigInt(rawUnits(fundedUnits, 'Escrow funding', { allowZero: true }));
  if (funded > target || typeof paid !== 'boolean' || (paid && funded !== 0n)) throw new Error('Invalid escrow balance.');
  const expired = BigInt(uint(epoch)) >= BigInt(rawUnits(deadline, 'Deadline'));
  return Object.freeze({ targetUnits: String(target), fundedUnits: String(funded), remainingUnits: paid || expired ? '0' : String(target - funded), paid, expired, fullyFunded: !paid && funded === target });
}

/** Max is the exact remaining campaign capacity; fees and wallet affordability are separate. */
export function contributionAmount(value, state) {
  const amount = toRawAmount(value);
  if (state.paid || state.expired || BigInt(amount) > BigInt(state.remainingUnits)) throw new Error(`Maximum contribution is ${fromRawAmount(state.remainingUnits)} tTARI.`);
  return amount;
}

export function canApproveEscrow(state, submissionHash, reviewerIndex = null) {
  return Boolean(state?.fullyFunded && !state.paid && !state.expired && !state.approved &&
    (reviewerIndex === null || (Number.isInteger(reviewerIndex) && state.votes?.[reviewerIndex] === false)) &&
    typeof submissionHash === 'string' && /^[a-f0-9]{64}$/.test(submissionHash) && state.submissionHash === submissionHash);
}

export function parseEscrowSubstate(response, deployment, epoch) {
  const agreement = validateAgreement(deployment.agreement);
  if (agreement.schema === SAPIENT_ESCROW_SCHEMA) return parseStockEscrowSubstate(response, deployment, epoch);
  if (agreement.schema !== ESCROW_AGREEMENT_SCHEMA || agreement.milestones.length !== 1) throw new Error('Unsupported escrow agreement.');
  const stage = agreement.milestones[0];
  const c = response?.state?.up?.substate?.Component;
  const s = c?.body?.state;
  const requiredIndex = stage.reviewers.findIndex(r => r.publicKey === stage.requiredReviewerPublicKey);
  if (response.verified !== true || !Number.isSafeInteger(response.version) || response.version < (deployment.recordedVersion ?? 0) ||
      c?.header?.template_address !== deployment.templateAddress || c.header.owner_rule !== 'None' ||
      !Array.isArray(s) || s.length !== 17 || s[0] !== deployment.agreementId || s[1] !== stage.id ||
      key(s[2]) !== reviewerKeyFromWallet(agreement.creatorWalletAddress) || key(s[3]) !== stage.payoutPublicKey ||
      !Array.isArray(s[4]) || s[4].length !== stage.reviewers.length || s[4].some((k, i) => key(k) !== stage.reviewers[i].publicKey) ||
      s[5] !== stage.approvalPercent || s[6] !== requiredIndex || uint(s[7]) !== stage.targetUnits || uint(s[8]) !== stage.refundEpoch ||
      !Array.isArray(s[11]) || s[11].length !== stage.reviewers.length || s[11].some(v => typeof v !== 'boolean') || typeof s[16] !== 'boolean' ||
      typeof s[10] !== 'string' || (s[10] !== '' && !/^[a-f0-9]{64}$/.test(s[10]))) {
    throw new Error('Chain response does not match the verified escrow terms.');
  }
  const funding = fundingState({ targetUnits: stage.targetUnits, fundedUnits: uint(s[9]), paid: s[16], epoch: uint(epoch), deadline: stage.refundEpoch });
  const approvals = s[11].filter(Boolean).length;
  return Object.freeze({ ...funding, version: response.version, epoch: uint(epoch), approvals, votes: Object.freeze([...s[11]]),
    requiredReviewerApproved: s[11][requiredIndex], approved: approvals >= requiredApprovals(stage.reviewers.length, stage.approvalPercent) && s[11][requiredIndex],
    submissionHash: s[10] });
}

function chainBytes(value, length) {
  const bytes = typeof value === 'string' ? value : value?.['@cbor'] === 'bytes' ? value.hex : null;
  if (typeof bytes !== 'string' || !/^[a-f0-9]+$/.test(bytes) || (length && bytes.length !== length * 2) || bytes.length > 1024) throw new Error('Malformed private return encoding.');
  return bytes;
}
function chainVault(value) {
  if (value?.['@cbor'] !== 'tag' || value.tag !== 132) throw new Error('Malformed escrow vault.');
  return 'vault_' + chainBytes(value.value,32);
}
export function parseStockEscrowSubstate(response, deployment, epoch) {
  const agreement = validateAgreement(deployment.agreement);
  const stage = agreement.milestones[0];
  const component = response?.state?.up?.substate?.Component;
  const s = component?.body?.state;
  const requiredIndex = stage.reviewers.findIndex(r => r.publicKey === stage.requiredReviewerPublicKey);
  if (agreement.schema !== SAPIENT_ESCROW_SCHEMA || agreement.milestones.length !== 1 || response.verified !== true ||
      !Number.isSafeInteger(response.version) || response.version < (deployment.recordedVersion ?? 0) ||
      component?.header?.template_address !== deployment.templateAddress || component.header.owner_rule !== 'None' ||
      !Array.isArray(s) || s.length !== 22 || s[0] !== deployment.agreementId || s[1] !== stage.id || key(s[2]) !== reviewerKeyFromWallet(agreement.creatorWalletAddress) ||
      key(s[3]) !== stage.payoutPublicKey || key(s[4]) !== stage.payoutNonce ||
      !Array.isArray(s[5]) || s[5].length !== stage.reviewers.length || s[5].some((k,i) => key(k) !== stage.reviewers[i].publicKey) ||
      s[6] !== stage.approvalPercent || s[7] !== requiredIndex || uint(s[8]) !== stage.targetUnits || uint(s[9]) !== stage.refundEpoch ||
      typeof s[11] !== 'string' || (s[11] !== '' && !/^[a-f0-9]{64}$/.test(s[11])) ||
      !Array.isArray(s[12]) || s[12].length !== stage.reviewers.length || s[12].some(v => typeof v !== 'boolean') || typeof s[19] !== 'boolean') throw new Error('Chain response does not match the verified stock-Sapient escrow terms.');
  const payoutBinding = Object.freeze({ value: stage.targetUnits, key: stage.payoutPublicKey, nonce: stage.payoutNonce });
  const principalVault = chainVault(s[13]), feeVault = chainVault(s[14]);
  if (principalVault !== deployment.principalVault || feeVault !== deployment.feeVault) throw new Error('The escrow vaults changed.');
  const [keys,nonces,amounts,refunded] = s.slice(15,19);
  const receipts = s[20];
  if (![keys,nonces,amounts,refunded,receipts].every(Array.isArray) || keys.length > 16 || [nonces,amounts,refunded,receipts].some(a => a.length !== keys.length) || refunded.some(v => typeof v !== 'boolean')) throw new Error('Malformed escrow pledges.');
  const refundBindings = keys.map((k,i) => Object.freeze({ value: uint(amounts[i]), key: chainBytes(k,32), nonce: chainBytes(nonces[i],32) }));
  const receiptCommitments = receipts.map(r => chainBytes(r,32));
  const payoutReceiptCommitment = chainBytes(s[21],32);
  if (refundBindings.some(n => n.value === '0') || new Set(refundBindings.map(n => n.key)).size !== keys.length || new Set(refundBindings.map(n => n.nonce)).size !== keys.length || new Set(receiptCommitments).size !== keys.length) throw new Error('Invalid or duplicate pledge returns.');
  const funded = uint(s[10]);
  const unpaid = refundBindings.reduce((total,n,i) => total + (refunded[i] ? 0n : BigInt(n.value)),0n);
  if (s[19] ? funded !== '0' || unpaid !== BigInt(stage.targetUnits) || refunded.some(Boolean) : unpaid !== BigInt(funded)) throw new Error('Escrow balance does not match its unpaid pledges.');
  const state = fundingState({ targetUnits: stage.targetUnits, fundedUnits: funded, paid: s[19], epoch: uint(epoch), deadline: stage.refundEpoch });
  const approvals = s[12].filter(Boolean).length;
  return Object.freeze({ ...state, remainingUnits: keys.length >= 16 ? '0' : state.remainingUnits,
    version: response.version, epoch: uint(epoch), approvals, votes: Object.freeze([...s[12]]), requiredReviewerApproved: s[12][requiredIndex],
    approved: approvals >= requiredApprovals(stage.reviewers.length, stage.approvalPercent) && s[12][requiredIndex], submissionHash: s[11],
    payoutBinding, refundBindings: Object.freeze(refundBindings), refunded: Object.freeze([...refunded]), principalVault, feeVault,
    receiptCommitments: Object.freeze(receiptCommitments), payoutReceiptCommitment });
}

/** Public-chain refresh only. No address, balance, or transaction data is read from Sapient. */
export async function refreshEscrow(deployment, fetcher = globalThis.fetch) {
  const stage = deployment.agreement.milestones[0];
  if (REVIEW_DEPLOYMENTS.esmeralda?.[`${deployment.agreementId}:${stage.id}`] !== deployment.component) throw new Error('Escrow deployment is not verified.');
  const options = { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(20000) };
  const responses = await Promise.all([fetcher(`${INDEXER}/network`, options), fetcher(`${INDEXER}/substates/${deployment.component}`, options)]);
  if (responses.some(r => !r.ok)) throw new Error('Could not refresh the Esmeralda balance.');
  const [network, substate] = await Promise.all(responses.map(r => r.json()));
  if (network.network !== 'esmeralda' || network.network_byte !== 38) throw new Error('Indexer is on the wrong network.');
  return Object.freeze({ ...parseEscrowSubstate(substate, deployment, network.epoch), checkedAt: Date.now() });
}
