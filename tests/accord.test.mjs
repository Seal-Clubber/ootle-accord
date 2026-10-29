import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agreementId, createReviewerSecret, fromRawAmount, NATIVE_TARI_RESOURCE, toRawAmount,
  validateAgreement, verifyReviewerSecret,
} from '../app/lib/accord.mjs';

// Deliberately synthetic address and hash data; these are not payment destinations.
function agreement(overrides = {}) {
  return {
    title: 'Community documentation',
    description: 'Fund documentation and a review of the result.',
    network: 'esmeralda',
    resourceAddress: NATIVE_TARI_RESOURCE,
    creatorWalletAddress: `otl_esmeralda_1${'q'.repeat(80)}`,
    milestones: [{
      id: 'delivery', title: 'Publish the guide', description: 'Deliver a reproducible guide.',
      reviewer: { name: 'Independent reviewer', role: 'Check the acceptance criteria' },
      hashLockHex: 'a'.repeat(64), refundEpoch: '1000', targetUnits: '100000000',
    }],
    ...overrides,
  };
}

test('TARI amounts round-trip exact raw units without floating-point rounding', () => {
  const cases = [
    ['0.000001', '1'], ['1', '1000000'], ['12.345678', '12345678'],
    ['9007199254.740993', '9007199254740993'], ['18446744073709.551615', '18446744073709551615'],
  ];
  for (const [amount, raw] of cases) {
    assert.equal(toRawAmount(amount), raw);
    assert.equal(fromRawAmount(raw), amount);
  }
  assert.equal(toRawAmount('1.230000'), '1230000');
  assert.equal(fromRawAmount('0'), '0');
});

test('invalid amounts and u64 overflow are rejected before wallet use', () => {
  for (const amount of ['0', '0.000000', '1e6', '-1', '+1', '01', ' 1', '1 ', '1.', '.1', '1,000', '0.0000001', '18446744073709.551616', 1]) {
    assert.throws(() => toRawAmount(amount), { code: 'INVALID_AMOUNT' });
  }
  for (const raw of ['-1', '1.1', '01', '18446744073709551616']) assert.throws(() => fromRawAmount(raw));
});

test('public agreement rejects accidentally included secrets and unsupported networks', () => {
  assert.throws(() => validateAgreement(agreement({ preimageHex: 'b'.repeat(64) })), /unsupported field/);
  assert.throws(() => validateAgreement(agreement({ network: 'mainnet' })), { code: 'WRONG_NETWORK' });
  const value = agreement();
  value.milestones[0].outputMask = 'b'.repeat(64);
  assert.throws(() => validateAgreement(value), /unsupported field/);
});

test('agreements require unique milestone IDs and independent hashlocks', () => {
  const value = agreement();
  value.milestones.push({ ...value.milestones[0] });
  assert.throws(() => validateAgreement(value), /unique lowercase/);
  value.milestones[1].id = 'review';
  assert.throws(() => validateAgreement(value), /separate reviewer secret/);
});

test('agreement v1 rejects custom-resource decimal ambiguity and sparse milestones', () => {
  assert.throws(() => validateAgreement(agreement({ resourceAddress: `resource_${'a'.repeat(64)}` })), { code: 'UNSUPPORTED_RESOURCE' });
  assert.throws(() => validateAgreement(agreement({ milestones: Array(1) })), /empty array slots/);
  assert.throws(() => validateAgreement(agreement({ milestones: Array(1_000_000_000) })), /one and eight/);
});

test('refund epoch stays exact in Sapient’s number-based HTLC format', () => {
  const value = agreement();
  value.milestones[0].refundEpoch = '9007199254740992';
  assert.throws(() => validateAgreement(value), { code: 'INVALID_EPOCH' });
});

test('agreement hash is stable across object key order and normalized text', async () => {
  const value = agreement();
  const reversed = Object.fromEntries(Object.entries(value).reverse());
  reversed.title = ` ${value.title} `;
  assert.equal(await agreementId(value), await agreementId(reversed));
  assert.notEqual(await agreementId(value), await agreementId(agreement({ title: 'Changed acceptance terms' })));
  const changed = agreement();
  changed.milestones[0].refundEpoch = '1001';
  assert.notEqual(await agreementId(value), await agreementId(changed));
});

test('validated agreements are immutable independent copies', () => {
  const original = agreement();
  const validated = validateAgreement(original);
  original.milestones[0].reviewer.name = 'Changed';
  assert.equal(validated.milestones[0].reviewer.name, 'Independent reviewer');
  assert.throws(() => { validated.milestones[0].title = 'Changed'; }, TypeError);
});

test('reviewer secrets use 32 random bytes with the wallet’s SHA256 hashlock', async () => {
  const first = await createReviewerSecret();
  const second = await createReviewerSecret();
  assert.match(first.preimageHex, /^[a-f0-9]{64}$/);
  assert.notEqual(first.preimageHex, second.preimageHex);
  assert.equal(await verifyReviewerSecret(first.preimageHex, first.hashLockHex), true);
  assert.equal(await verifyReviewerSecret(second.preimageHex, first.hashLockHex), false);
  assert.equal(await verifyReviewerSecret('00'.repeat(32), '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925'), true);
  assert.equal(await verifyReviewerSecret('bad', first.hashLockHex), false);
});
