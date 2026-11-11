import { readFile } from 'node:fs/promises';
import init, { makeReturnNote, publicReturnBinding, constructorArgs } from '../app/lib/stock-crypto/accord_sapient_client.js';
import { QUORUM_AGREEMENT_SCHEMA, SAPIENT_ESCROW_SCHEMA, validateAgreement, agreementId } from '../app/lib/accord.mjs';
import { reviewerKeyFromWallet } from '../app/lib/wallet-address.mjs';

const [file, requiredWallet, ...extra] = process.argv.slice(2);
if (!file || !requiredWallet || extra.length) throw new Error('Usage: node scripts/prepare-mainnet.mjs <public-draft.json> <required-reviewer-mainnet-address>');
const draft = validateAgreement(JSON.parse(await readFile(file, 'utf8')));
if (draft.network !== 'mainnet' || draft.schema !== QUORUM_AGREEMENT_SCHEMA || draft.milestones.length !== 1) {
  throw new Error('Save a Mainnet draft with exactly one milestone.');
}
const stage = draft.milestones[0];
if (!stage.targetUnits) throw new Error('Set a funding goal for the milestone.');
const requiredReviewer = stage.reviewers.findIndex(reviewer => reviewer.walletAddress === requiredWallet);
if (requiredReviewer < 0) throw new Error('The required reviewer must be listed in the milestone.');

const wasm = await readFile(new URL('../app/lib/stock-crypto/accord_sapient_client_bg.wasm', import.meta.url));
await init({ module_or_path: wasm });
const note = makeReturnNote(draft.creatorWalletAddress, stage.targetUnits);
const binding = JSON.parse(publicReturnBinding(note));
const agreement = validateAgreement({ ...draft, schema: SAPIENT_ESCROW_SCHEMA, milestones: [{
  ...stage, requiredReviewerPublicKey: stage.reviewers[requiredReviewer].publicKey,
  payoutPublicKey: binding.key, payoutNonce: binding.nonce,
}] });
const id = await agreementId(agreement);
const config = {
  network: agreement.network, creator: reviewerKeyFromWallet(agreement.creatorWalletAddress, agreement.network),
  reviewers: stage.reviewers.map(reviewer => reviewer.publicKey), requiredReviewer,
  target: stage.targetUnits, deadline: stage.refundEpoch, approvalPercent: stage.approvalPercent,
  agreementId: id, stageId: stage.id,
};
const args = JSON.parse(constructorArgs(note, JSON.stringify(config)));
const output = { agreement, agreementId: id, feeReserveUnits: '1600000', constructorArgs: args };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
