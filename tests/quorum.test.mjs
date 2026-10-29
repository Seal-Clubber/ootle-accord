import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAgreement, agreementId, requiredApprovals, QUORUM_AGREEMENT_SCHEMA, NATIVE_TARI_RESOURCE } from '../app/lib/accord.mjs';
import { cborReviewerIndex, cborSubmissionHash } from '../app/lib/review-args.mjs';

const addresses = [
  'otl_esm_17mufuvtwdwjlqhjj2rwaffwna5uae5pce7qje34p2jmwcz236f05faf4yzfxajqlh4drs7z9h6malpdfdgjwecv88z7ulf48sg4pwmganfp0v',
  'otl_esm_1vfh5ht7kwq78x9s0qk62at0ndwknrhsggn45qmda52c4hg0nmyp94wlskx57zl9367s7s25v04ldyq4cx3qjd5qj9naffeskpww3zpcg08vw9',
];
function terms() {
  return { schema: QUORUM_AGREEMENT_SCHEMA, title: 'Quorum review', description: 'Public test agreement.', network: 'esmeralda', resourceAddress: NATIVE_TARI_RESOURCE, creatorWalletAddress: addresses[0],
    milestones: [{ id: 'delivery', title: 'Delivery', reviewers: addresses.map((walletAddress, i) => ({ name: `Reviewer ${i + 1}`, walletAddress })), approvalPercent: 60, refundEpoch: '20000' }] };
}

test('quorum always rounds up against all designated reviewers', () => {
  assert.equal(requiredApprovals(5, 60), 3);
  assert.equal(requiredApprovals(3, 67), 3);
  assert.equal(requiredApprovals(5, 1), 1);
  assert.equal(requiredApprovals(10, 100), 10);
  for (const [n, p] of [[0,60],[11,60],[5,0],[5,101],[5,60.5],[5,'60'],[2.5,60]]) assert.throws(() => requiredApprovals(n,p));
});

test('quorum agreement identity binds reviewer order, percentage and deadline', async () => {
  const input = terms();
  const id = await agreementId(input);
  const normalized = validateAgreement(input);
  assert.equal(await agreementId(normalized), id);
  assert.equal(normalized.milestones[0].reviewers[1].publicKey.length, 64);
  for (const change of [v => v.milestones[0].reviewers.reverse(), v => v.milestones[0].approvalPercent = 61, v => v.milestones[0].refundEpoch = '20001']) {
    const copy = structuredClone(input); change(copy); assert.notEqual(await agreementId(copy), id);
  }
});

test('duplicate, sparse, mismatched and secret-bearing quorum reviewers are rejected', () => {
  for (const change of [
    v => v.milestones[0].reviewers.push(v.milestones[0].reviewers[0]),
    v => delete v.milestones[0].reviewers[0],
    v => v.milestones[0].reviewers[0].publicKey = 'a'.repeat(64),
    v => v.milestones[0].hashLockHex = 'a'.repeat(64),
    v => v.creatorWalletAddress = addresses[0].slice(0,-1) + 'q',
  ]) { const v=terms(); change(v); assert.throws(() => validateAgreement(v)); }
});

test('approval CBOR matches Tari Rust encoder vectors and rejects malformed file hashes', () => {
  assert.deepEqual(cborReviewerIndex(4), { Literal: '04' });
  const hash = '01'.repeat(32);
  assert.deepEqual(cborSubmissionHash(hash), { Literal: '7840' + Buffer.from(hash).toString('hex') });
  for (const index of [-1,10,1.2,'1']) assert.throws(() => cborReviewerIndex(index));
  for (const value of ['a'.repeat(63), 'A'.repeat(64), '<script>', null]) assert.throws(() => cborSubmissionHash(value));
});
