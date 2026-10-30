import init, { makeReturnNote, fundingArgs, actionTransaction, publicReturnBinding, restoreReturnReceipt } from './stock-crypto/accord_sapient_client.js';
import { rawUnits } from './accord.mjs';
import { reviewerKeyFromWallet } from './wallet-address.mjs';

let ready;
export function loadStockCrypto() {
  if (!ready) {
    const wasm = new URL('./stock-crypto/accord_sapient_client_bg.wasm', import.meta.url);
    const version = new URL(import.meta.url).searchParams.get('v');
    if (version) wasm.searchParams.set('v', version);
    ready = init({ module_or_path: wasm }).catch(error => { ready = null; throw error; });
  }
  return ready;
}
export async function makeFundingReturn(walletAddress, amount) {
  reviewerKeyFromWallet(walletAddress);
  rawUnits(amount, 'Contribution');
  await loadStockCrypto();
  return JSON.parse(makeReturnNote(walletAddress, amount));
}
export async function makeFundingArgs(note, total, address, amount, agreementId, receiverKey) {
  rawUnits(total, 'Funding counter', { allowZero: true });
  await loadStockCrypto();
  return JSON.parse(fundingArgs(JSON.stringify(note), total, address, amount, agreementId, receiverKey));
}
export async function restoreMemoReceipt(memo, address, agreementId) {
  await loadStockCrypto();
  const restored = JSON.parse(restoreReturnReceipt(memo, address, agreementId));
  return { ...restored, binding: JSON.parse(publicReturnBinding(JSON.stringify(restored.receipt))) };
}
export async function makePublicAction(deployment, state, receipt, refundIndex = null, dryRun = false) {
  await loadStockCrypto();
  const expected = refundIndex === null ? state.payoutBinding : state.refundBindings[refundIndex];
  const actual = JSON.parse(publicReturnBinding(JSON.stringify(receipt)));
  if (!expected || actual.key !== expected.key || actual.nonce !== expected.nonce || actual.value !== expected.value) throw new Error('This wallet memo does not match the selected fixed return.');
  return JSON.parse(actionTransaction(deployment.component, state.principalVault, state.feeVault,
    JSON.stringify(receipt), refundIndex ?? undefined, (BigInt(state.epoch) + 10n).toString(), dryRun));
}
