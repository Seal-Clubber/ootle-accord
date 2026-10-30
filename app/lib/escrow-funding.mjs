import { ESCROW_AGREEMENT_SCHEMA, rawUnits, toRawAmount, fromRawAmount, validateAgreement, requiredApprovals } from './accord.mjs';
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

export function canApproveEscrow(state, submissionHash) {
  return Boolean(state?.fullyFunded && !state.paid && !state.expired && !state.approved &&
    typeof submissionHash === 'string' && /^[a-f0-9]{64}$/.test(submissionHash) && state.submissionHash === submissionHash);
}

export function parseEscrowSubstate(response, deployment, epoch) {
  const agreement = validateAgreement(deployment.agreement);
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
  return Object.freeze({ ...funding, version: response.version, epoch: uint(epoch), approvals,
    requiredReviewerApproved: s[11][requiredIndex], approved: approvals >= requiredApprovals(stage.reviewers.length, stage.approvalPercent) && s[11][requiredIndex],
    submissionHash: s[10] });
}

/** Explicit user refresh only. No address, balance, or transaction data is read from Sapient. */
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
