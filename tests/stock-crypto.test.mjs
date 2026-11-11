import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {reviewerKeyFromWallet} from '../app/lib/wallet-address.mjs';
import init,{makeReturnNote,publicReturnBinding,fundingArgs,restoreReturnReceipt,actionTransaction,inspectEnvelope} from '../app/lib/stock-crypto/accord_sapient_client.js';
import {TESTNET_SAPIENT_ESCROW as demo} from '../app/lib/testnet-sapient-escrow.mjs';
await init({module_or_path:await readFile(new URL('../app/lib/stock-crypto/accord_sapient_client_bg.wasm',import.meta.url))});
const address=demo.agreement.creatorWalletAddress;
test('release artifact matches the immutable deployment manifest',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../artifacts/esmeralda/manifest.json',import.meta.url),'utf8'));
 const code=await readFile(new URL('../artifacts/esmeralda/sapient-escrow-v5.wasm',import.meta.url));
 assert.equal(code.length,manifest.bytes);assert.equal(createHash('sha256').update(code).digest('hex'),manifest.sha256);assert.equal(manifest.templateAddress,demo.templateAddress);
});

test('current-network release artifact matches its separate manifest', async () => {
 const manifest = JSON.parse(await readFile(new URL('../artifacts/esmeralda/current/manifest.json', import.meta.url), 'utf8'));
 const code = await readFile(new URL('../artifacts/esmeralda/current/sapient-escrow.wasm', import.meta.url));
 assert.equal(manifest.ootleVersion, '0.49.0');
 assert.equal(code.length, manifest.bytes);
 assert.equal(createHash('sha256').update(code).digest('hex'), manifest.sha256);
});
test('mainnet escrow candidate matches its build manifest', async () => {
 const manifest = JSON.parse(await readFile(new URL('../artifacts/mainnet/manifest.json', import.meta.url), 'utf8'));
 const code = await readFile(new URL('../artifacts/mainnet/sapient-escrow.wasm', import.meta.url));
 assert.equal(manifest.ootleVersion, '0.53.1');
 assert.equal(code.length, manifest.bytes);
 assert.equal(createHash('sha256').update(code).digest('hex'), manifest.sha256);
});

test('mainnet return derivation and transaction encoding reject cross-network wallet use', () => {
 // The same fixture public keys encoded with the mainnet HRP. No funds are sent.
 const mainAddress = 'otl_1tttvh8v6u72prxluznx5vupja8n8r65an30uel4gvfgtq3k734k2yup9y8lagmg6vf2hv0rz9qntu3vv2s5kfcx2jtgt6h98r9h3vtssdwwgk';
 assert.equal(reviewerKeyFromWallet(mainAddress, 'mainnet'), reviewerKeyFromWallet(address));
 assert.throws(() => reviewerKeyFromWallet(address, 'mainnet'));
 const main = JSON.parse(makeReturnNote(mainAddress, '3000000'));
 const testnet = { ...main, network: 'esmeralda' };
 assert.equal(main.network, 'mainnet');
 assert.notEqual(JSON.parse(publicReturnBinding(JSON.stringify(main))).key, JSON.parse(publicReturnBinding(JSON.stringify(testnet))).key);
 assert.throws(() => fundingArgs(JSON.stringify(main), '0', address, main.value, demo.agreementId, main.owner));
 const memo = `ootleaccord:v5:refund:${demo.agreementId}:${main.value}:${main.nonce}`;
 const restored = JSON.parse(restoreReturnReceipt(memo, mainAddress, demo.agreementId));
 assert.deepEqual(restored.receipt, main);
 const result = JSON.parse(actionTransaction(demo.component, demo.principalVault, demo.feeVault, JSON.stringify(main), 0, '14000', true));
 const tx = JSON.parse(inspectEnvelope(result.transaction)).transaction.V1.body.transaction;
 assert.equal(tx.network, 0);
});
test('real browser WASM makes a wallet-bound return, encrypts its recovery memo and omits private receipt material from funding args',()=>{
 const note=JSON.parse(makeReturnNote(address,'3000000'));const binding=JSON.parse(publicReturnBinding(JSON.stringify(note)));
 const payload=JSON.parse(fundingArgs(JSON.stringify(note),'7000000',address,'3000000',demo.agreementId,'5ad6cb9d9ae794119bfc14cd467032e9e671ea9d9c5fccfea86250b046de8d6c'));
 assert.equal(payload.args.length,5);assert.match(payload.receiptCommitment,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(payload).includes(note.nonce),false);
 const memo=`ootleaccord:v5:refund:${demo.agreementId}:3000000:${note.nonce}`;
 const restored=JSON.parse(restoreReturnReceipt(memo,address,demo.agreementId));assert.equal(restored.kind,'refund');assert.deepEqual(JSON.parse(publicReturnBinding(JSON.stringify(restored.receipt))),binding);
 assert.throws(()=>restoreReturnReceipt(memo,address,'1'.repeat(64)));
 assert.throws(()=>fundingArgs(JSON.stringify(note),'7000000',address,'3000001',demo.agreementId,'5ad6cb9d9ae794119bfc14cd467032e9e671ea9d9c5fccfea86250b046de8d6c'));
});
test('browser return envelopes carry the fixed return, sponsor-paid action and declared vault inputs without leaking receipt secrets',()=>{
 const note=JSON.parse(makeReturnNote(address,'7000000'));
 const tx=JSON.parse(actionTransaction(demo.component,demo.principalVault,demo.feeVault,JSON.stringify(note),0,'12749',true));
 assert.equal(JSON.stringify(tx).includes(note.nonce),false);assert.match(tx.returnCommitment,/^[a-f0-9]{64}$/);
 const inspected=JSON.parse(inspectEnvelope(tx.transaction));assert.equal(inspected.transactionId,tx.transactionId);
 const json=JSON.stringify(inspected.transaction);assert.ok(json.includes(demo.component.slice(10)));assert.ok(json.includes(demo.principalVault.slice(6)));assert.ok(json.includes('refund'));
});
