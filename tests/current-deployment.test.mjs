import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TESTNET_CURRENT_ESCROW as deployment } from '../app/lib/testnet-current-escrow.mjs';
import { TESTNET_ACCORDS } from '../app/lib/testnet-accords.mjs';
import { agreementId, sha256Hex } from '../app/lib/accord.mjs';
import { parseEscrowSubstate, canApproveEscrow, contributionAmount } from '../app/lib/escrow-funding.mjs';
import { REVIEW_DEPENDENCIES } from '../app/lib/review-deployments.mjs';
const checkpoint = JSON.parse(await readFile(new URL('./fixtures/current-escrow-substate.json', import.meta.url), 'utf8'));

test('current deployment binds committed work and a locked 10 TARI escrow to the required community reviewer', async () => {
  assert.equal(TESTNET_ACCORDS[0], deployment);
  assert.equal(await agreementId(deployment.agreement), deployment.agreementId);
  assert.equal(await sha256Hex(new TextEncoder().encode(deployment.work)), deployment.submissionHash);
  const state = parseEscrowSubstate(checkpoint, deployment, deployment.recordedEpoch);
  assert.equal(state.fundedUnits, '2000000');
  assert.equal(state.remainingUnits, '8000000');
  assert.equal(state.approvals, 0);
  assert.equal(canApproveEscrow(state, deployment.submissionHash), false);
  assert.equal(contributionAmount('8', state), '8000000');
  assert.throws(() => contributionAmount('8.000001', state));
  assert.equal(state.refundBindings[0].value, '2000000');
  assert.equal(state.receiptCommitments.length, 1);
  const stage = deployment.agreement.milestones[0];
  assert.equal(stage.approvalPercent, 60);
  assert.equal(stage.requiredReviewerPublicKey, stage.reviewers[2].publicKey);
  assert.equal(stage.requiredReviewerPublicKey, '626f4bafd6703c73160f05b4aeadf36bad31de0844eb406dbda2b15ba1f3d902');
  assert.ok(REVIEW_DEPENDENCIES.esmeralda[deployment.component].includes(deployment.principalVault));
  assert.ok(REVIEW_DEPENDENCIES.esmeralda[deployment.component].includes(deployment.feeVault));
});

test('an upgradable replacement or a mismatched checkpoint is rejected before wallet spending', () => {
  for (const mutate of [r => r.state.up.substate.Component.header.upgrade_rule = 'AllowAll', r => delete r.state.up.substate.Component.header.upgrade_rule,
    r => r.verified = false, r => r.state.up.substate.Component.body.state[7] = 0]) {
    const response = structuredClone(checkpoint); mutate(response);
    assert.throws(() => parseEscrowSubstate(response, deployment, deployment.recordedEpoch));
  }
});
