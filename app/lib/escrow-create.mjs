import { agreementId, deepFreeze, NATIVE_TARI_RESOURCE, QUORUM_AGREEMENT_SCHEMA, requiredApprovals, SAPIENT_ESCROW_SCHEMA, validateAgreement } from './accord.mjs';
import { decodeSubstateResponse, decodeTransactionResponse } from './chain-codec.mjs';
import { chainVault, parseStockEscrowSubstate } from './escrow-funding.mjs';
import { networkConfig, readCurrentEpoch } from './networks.mjs';
import { registerVerifiedMainnet } from './review-deployments.mjs';
import { loadStockCrypto } from './stock-client.mjs';
import { constructorArgs, makeReturnNote, publicReturnBinding } from './stock-crypto/accord_sapient_client.js';
import { reviewerKeyFromWallet } from './wallet-address.mjs';

export const MAINNET_ESCROW_TEMPLATE = 'template_151ae04f4b80eda9a45d37f0ae8c2c8b005eb6df6715c2a9eb14df68b6e4bbf3';
const RESERVE = 1_600_000n;
const MAX_FEE = 100_000n;
const HEX32 = /^[a-f0-9]{64}$/;
const COMPONENT = /^component_[a-f0-9]{64}$/;
const config = networkConfig('mainnet');

async function get(path, fetcher) {
  const response = await fetcher(config.indexer + path, {
    credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Mainnet data is unavailable. Check again in a moment.');
  return response.json();
}

function mainnetRequiredReviewer(stage, selectedIndex) {
  if (requiredApprovals(stage.reviewers.length, stage.approvalPercent) === stage.reviewers.length) return 0;
  if (!Number.isInteger(selectedIndex) || !stage.reviewers[selectedIndex]) throw new Error('Choose the required reviewer before publishing.');
  return selectedIndex;
}

export async function prepareMainnetEscrow(draft, selectedReviewer, account, publisherKey, fetcher = globalThis.fetch) {
  const terms = validateAgreement(draft);
  const [stage] = terms.milestones;
  if (terms.schema !== QUORUM_AGREEMENT_SCHEMA || terms.network !== 'mainnet' || terms.milestones.length !== 1 || !stage.targetUnits) {
    throw new Error('Publish one Mainnet milestone with a funding goal.');
  }
  const requiredReviewer = mainnetRequiredReviewer(stage, selectedReviewer);
  if (!COMPONENT.test(account) || !HEX32.test(publisherKey)) {
    throw new Error('Connect a Mainnet Sapient wallet to publish.');
  }
  const developerKey = reviewerKeyFromWallet(terms.creatorWalletAddress, 'mainnet');
  const [epoch, response] = await Promise.all([readCurrentEpoch('mainnet', fetcher), get('/substates/' + account, fetcher).then(decodeSubstateResponse)]);
  if (BigInt(stage.refundEpoch) <= BigInt(epoch)) throw new Error(`Choose a deadline after the current Mainnet epoch (${epoch}).`);
  const component = response.state?.up?.substate?.Component;
  const vaultEntry = component?.body?.state?.[0]?.entries?.find(([key]) => key.tag === 131 && key.value?.hex === NATIVE_TARI_RESOURCE.slice(9));
  if (response.verified !== true || component?.header?.owner_rule?.ByPublicKey !== publisherKey) {
    throw new Error('Could not verify the connected Sapient account on Mainnet.');
  }
  if (!vaultEntry) {
    throw new Error('The publishing wallet needs at least 1.7 public TARI for the return reserve and fee limit.');
  }
  const vault = chainVault(vaultEntry[1]);
  const funds = await get('/substates/' + vault, fetcher).then(decodeSubstateResponse);
  const balance = funds.state?.up?.substate?.Vault?.resource_container?.Stealth;
  if (funds.verified !== true || balance?.address !== NATIVE_TARI_RESOURCE || BigInt(balance.revealed_amount) < RESERVE + MAX_FEE) {
    throw new Error('The publishing wallet needs at least 1.7 public TARI for the return reserve and fee limit.');
  }

  await loadStockCrypto();
  const note = makeReturnNote(terms.creatorWalletAddress, stage.targetUnits);
  const binding = JSON.parse(publicReturnBinding(note));
  const agreement = validateAgreement({ ...terms, schema: SAPIENT_ESCROW_SCHEMA, milestones: [{
    ...stage, requiredReviewerPublicKey: stage.reviewers[requiredReviewer].publicKey,
    payoutPublicKey: binding.key, payoutNonce: binding.nonce,
  }] });
  const id = await agreementId(agreement);
  const args = JSON.parse(constructorArgs(note, JSON.stringify({
    network: 'mainnet', creator: developerKey, receiptReceiver: publisherKey,
    reviewers: stage.reviewers.map(reviewer => reviewer.publicKey), requiredReviewer,
    target: stage.targetUnits, deadline: stage.refundEpoch, approvalPercent: stage.approvalPercent, agreementId: id, stageId: stage.id,
  })));
  // Tari BOR encodes the resource as tag 131 plus its 32-byte ID, and the reserve as a u32.
  const instructions = [{ CallMethod: { call: { Address: account }, method: 'withdraw', args: [
    { Literal: 'd8835820' + NATIVE_TARI_RESOURCE.slice(9) }, { Literal: '1a' + RESERVE.toString(16).padStart(8, '0') },
  ] } }, { PutLastInstructionOutputOnWorkspace: { key: 0 } }, { CallFunction: { address: MAINNET_ESCROW_TEMPLATE.slice(9), function: 'new', args } }];
  const inputs = [account, vault, MAINNET_ESCROW_TEMPLATE, NATIVE_TARI_RESOURCE].map(substate_id => ({ substate_id, version: null }));
  return { agreement, operation: { kind: 'instructions', instructions, inputs, maxFee: String(MAX_FEE), feeType: 'transparent', enforceFeeType: true } };
}

export async function verifyPublishedEscrow(record, fetcher = globalThis.fetch) {
  const { transactionId } = record;
  const agreement = validateAgreement(record.agreement);
  let { component } = record;
  if (!(component ? COMPONENT.test(component) : HEX32.test(transactionId ?? '')) ||
      agreement.schema !== SAPIENT_ESCROW_SCHEMA || agreement.network !== 'mainnet' || agreement.milestones.length !== 1) {
    throw new Error('This published accord link is invalid.');
  }
  const [epoch, id] = await Promise.all([readCurrentEpoch('mainnet', fetcher), agreementId(agreement)]);
  let creationVersion = 0;
  let receiptPath;
  if (!component) {
    const path = `/transactions/${transactionId}/result`;
    const receipt = await get(path, fetcher).then(decodeTransactionResponse);
    const final = receipt.result?.Finalized;
    if (!final?.final_decision) throw new Error('The publish transaction is awaiting confirmation.');
    const diff = final.execution_result?.finalize?.result?.Accept;
    if (final.final_decision !== 'Commit' || !diff) throw Object.assign(new Error('The publish transaction did not create an accord. Check its result in Sapient.'), { code: 'PUBLISH_REJECTED' });
    const created = diff.up_substates.filter(([address, value]) => COMPONENT.test(address) &&
      value.substate?.Component?.header?.template_address?.replace(/^template_/, '') === MAINNET_ESCROW_TEMPLATE.slice(9) &&
      value.substate.Component.body?.state?.[0] === id);
    if (created.length !== 1) throw new Error('The transaction does not contain this accord.');
    component = created[0][0];
    creationVersion = created[0][1].version;
    receiptPath = path;
  }
  const componentPath = '/substates/' + component;
  const live = await get(componentPath, fetcher).then(decodeSubstateResponse);
  const fields = live.state?.up?.substate?.Component?.body?.state;
  const descriptor = { agreement, agreementId: id, component, templateAddress: MAINNET_ESCROW_TEMPLATE,
    principalVault: chainVault(fields?.[13]), feeVault: chainVault(fields?.[14]),
    receiptsPath: config.indexer + (receiptPath ?? componentPath), recordedVersion: creationVersion };
  const state = { ...parseStockEscrowSubstate(live, descriptor, epoch), checkedAt: Date.now() };
  const deployment = deepFreeze({ ...descriptor, recordedVersion: state.version, recordedEpoch: epoch, recordedFundingUnits: state.fundedUnits,
    recordedPaid: state.paid, recordedApprovals: state.approvals, recordedVotes: state.votes, recordedApproved: state.approved,
    recordedRequiredReviewerApproved: state.requiredReviewerApproved, recordedSubmissionHash: state.submissionHash });
  registerVerifiedMainnet(deployment);
  return { deployment, state };
}
