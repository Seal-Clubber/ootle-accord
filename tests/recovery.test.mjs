import test from 'node:test';
import assert from 'node:assert/strict';
import { NATIVE_TARI_RESOURCE } from '../app/lib/accord.mjs';
import {
  createClaimHandoff, createPledgeRecovery, decryptRecovery, encryptRecovery,
  PBKDF2_ITERATIONS, validateClaimHandoff, validatePledgeRecovery,
} from '../app/lib/recovery.mjs';

// Synthetic values only. Never put real wallet masks, recovery files or reviewer secrets in Git.
const publicTerms = {
  title: 'Synthetic recovery fixture', description: 'This agreement is used only in local tests.',
  network: 'esmeralda', resourceAddress: NATIVE_TARI_RESOURCE,
  creatorWalletAddress: `otl_esmeralda_1${'q'.repeat(80)}`,
  milestones: [{ id: 'delivery', title: 'Deliver the fixture', reviewer: { name: 'Test reviewer' }, hashLockHex: 'a'.repeat(64), refundEpoch: '1000' }],
};
const result = {
  transactionId: `transaction_${'c'.repeat(64)}`,
  ownCommitment: 'd'.repeat(64), outputMask: 'e'.repeat(64),
  conditions: [
    [{ Builtin: { HashLock: { hash: 'a'.repeat(64), alg: 'Sha256' } } }, { Builtin: { BeforeEpoch: 1000 } }, { AccessRule: { Require: 'synthetic-claimant-key' } }],
    [{ Builtin: { AfterEpoch: 1000 } }, { AccessRule: { Require: 'synthetic-funder-key' } }],
  ],
};
const password = 'a long unique test password';
const fixture = () => createPledgeRecovery({ agreement: publicTerms, stageId: 'delivery', amount: '12345678', result });

test('recovery preserves required wallet refund material and labels submission honestly', async () => {
  const recovery = await fixture();
  assert.equal(recovery.commitment, result.ownCommitment);
  assert.equal(recovery.outputMask, result.outputMask);
  assert.equal(recovery.amount, '12345678');
  assert.deepEqual(recovery.conditions, result.conditions);
  assert.equal(recovery.status, 'wallet-submitted');
  assert.equal(Object.hasOwn(recovery, 'verified'), false);
  assert.equal(Object.isFrozen(recovery.conditions[0]), true);
});

test('malformed funding responses fail before a recovery package is treated as usable', async () => {
  for (const patch of [{ ownCommitment: 'bad' }, { outputMask: undefined }, { conditions: [] }, { transactionId: '' }]) {
    await assert.rejects(createPledgeRecovery({ agreement: publicTerms, stageId: 'delivery', amount: '1', result: { ...result, ...patch } }));
  }
});

test('claim handoff omits amount and mask while retaining the complete conditions tree', async () => {
  const recovery = await fixture();
  const handoff = await createClaimHandoff(recovery);
  assert.equal(Object.hasOwn(handoff, 'amount'), false);
  assert.equal(Object.hasOwn(handoff, 'outputMask'), false);
  assert.deepEqual(handoff.conditions, result.conditions);
  assert.equal(handoff.agreementId, recovery.agreementId);
  assert.equal((await validateClaimHandoff(JSON.stringify(handoff), { agreement: publicTerms })).stageId, 'delivery');
  await assert.rejects(validateClaimHandoff({ ...handoff, outputMask: result.outputMask }), /unsupported field/);
});

test('encrypted backups round-trip in the supported network with fresh salt and nonce', async () => {
  const recovery = await fixture();
  const encrypted = await encryptRecovery(recovery, password);
  const again = await encryptRecovery(recovery, password);
  assert.equal(encrypted.kdf.iterations, PBKDF2_ITERATIONS);
  assert.notEqual(encrypted.kdf.salt, again.kdf.salt);
  assert.notEqual(encrypted.iv, again.iv);
  assert.notEqual(encrypted.ciphertext, again.ciphertext);
  assert.equal(Object.hasOwn(encrypted, 'agreement'), false);
  assert.equal(JSON.stringify(encrypted).includes('outputMask'), false);
  assert.deepEqual(await decryptRecovery(JSON.stringify(encrypted), password), recovery);
});

test('wrong passwords, ciphertext changes and authenticated header changes reject', async () => {
  const encrypted = await encryptRecovery(await fixture(), password);
  await assert.rejects(decryptRecovery(encrypted, 'another long wrong password'), { code: 'DECRYPT_FAILED' });
  const ciphertext = encrypted.ciphertext;
  const changed = { ...encrypted, ciphertext: `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}` };
  await assert.rejects(decryptRecovery(changed, password), { code: 'DECRYPT_FAILED' });
  const alteredHeader = { ...encrypted, iv: 'AAECAwQFBgcICQoL' };
  await assert.rejects(decryptRecovery(alteredHeader, password), { code: 'DECRYPT_FAILED' });
});

test('untrusted backup KDF parameters are rejected without attacker-selected work', async () => {
  const encrypted = await encryptRecovery(await fixture(), password);
  await assert.rejects(decryptRecovery({ ...encrypted, kdf: { ...encrypted.kdf, iterations: 2_000_000_000 } }, password), /derivation settings/);
  await assert.rejects(decryptRecovery({ ...encrypted, kdf: { ...encrypted.kdf, iterations: 1 } }, password), /derivation settings/);
  await assert.rejects(encryptRecovery(await fixture(), 'short'), { code: 'INVALID_PASSWORD' });
});

test('network, agreement, and milestone mismatch cannot silently import', async () => {
  const recovery = await fixture();
  await assert.rejects(validatePledgeRecovery({ ...recovery, network: 'mainnet' }), { code: 'WRONG_NETWORK' });
  await assert.rejects(validatePledgeRecovery(recovery, { expectedNetwork: 'igor' }), { code: 'WRONG_NETWORK' });
  await assert.rejects(validatePledgeRecovery(recovery, { expectedAgreementId: 'f'.repeat(64) }), /another agreement/);
  await assert.rejects(validatePledgeRecovery({ ...recovery, stageId: 'missing' }), /absent/);
  await assert.rejects(validatePledgeRecovery({ ...recovery, agreement: { ...publicTerms, title: 'Changed terms' } }), /recorded ID/);
});

test('import bounds reject huge, deep, prototype and invalid JSON inputs', async () => {
  await assert.rejects(validatePledgeRecovery('x'.repeat(131_073)), /file size/);
  await assert.rejects(validatePledgeRecovery('{bad json}'), /valid JSON/);
  const recovery = await fixture();
  const cycle = []; cycle.push(cycle);
  await assert.rejects(validatePledgeRecovery({ ...recovery, conditions: cycle }), /circular/);
  await assert.rejects(validatePledgeRecovery({ ...recovery, conditions: Array(1_000_000_000) }), /array exceeds/);
  await assert.rejects(validatePledgeRecovery({ ...recovery, conditions: Array(2) }), /empty slots/);
  let deep = {};
  for (let count = 0; count < 30; count++) deep = { child: deep };
  await assert.rejects(validatePledgeRecovery({ ...recovery, conditions: [[deep], [{}]] }), /limits/);
  await assert.rejects(validatePledgeRecovery(JSON.stringify(recovery).replace('"wallet-submitted"', '"wallet-submitted","__proto__":{}')), /reserved/);
});
