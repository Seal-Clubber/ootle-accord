import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TESTNET_ACCORDS} from '../app/lib/testnet-accords.mjs';
import {TESTNET_PARTIAL_ESCROW as partial} from '../app/lib/testnet-partial-escrow.mjs';
import {TESTNET_ESCROW as original} from '../app/lib/testnet-escrow.mjs';
import {agreementId,sha256Hex} from '../app/lib/accord.mjs';
import {REVIEW_DEPLOYMENTS} from '../app/lib/review-deployments.mjs';
import {parseEscrowSubstate,contributionAmount,canApproveEscrow} from '../app/lib/escrow-funding.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/partial-escrow-substate.json',import.meta.url),'utf8'));

test('funded accords keep distinct terms, work hashes and verified component targets',async()=>{
  assert.equal(TESTNET_ACCORDS.length,3);
  assert.equal(new Set(TESTNET_ACCORDS.map(d=>d.agreementId)).size,3);
  assert.equal(new Set(TESTNET_ACCORDS.map(d=>d.component)).size,3);
  for(const d of TESTNET_ACCORDS){
    assert.equal(await agreementId(d.agreement),d.agreementId);
    assert.equal(await sha256Hex(new TextEncoder().encode(d.work)),d.submissionHash);
    assert.equal(REVIEW_DEPLOYMENTS.esmeralda[d.agreementId+':delivery'],d.component);
    assert.equal(d.agreement.milestones[0].requiredReviewerPublicKey,d.agreement.milestones[0].reviewers[2].publicKey);
  }
});
test('the committed second accord has exactly 7/10 funded, 3 Max and no votes',()=>{
  const state=parseEscrowSubstate(fixture,partial,partial.recordedEpoch);
  assert.equal(state.fundedUnits,'7000000');assert.equal(state.remainingUnits,'3000000');
  assert.equal(state.approvals,0);assert.equal(state.requiredReviewerApproved,false);assert.equal(state.paid,false);
  assert.equal(contributionAmount('3',state),'3000000');assert.throws(()=>contributionAmount('3.000001',state));
  assert.equal(canApproveEscrow(state,partial.submissionHash),false);
  assert.throws(()=>parseEscrowSubstate(fixture,original,partial.recordedEpoch));
});
test('approval opens only after full funding and binds the selected accord work',()=>{
  const state=parseEscrowSubstate(fixture,partial,partial.recordedEpoch);
  const full={...state,fullyFunded:true,fundedUnits:'10000000',remainingUnits:'0'};
  assert.equal(canApproveEscrow(full,partial.submissionHash),true);
  assert.equal(canApproveEscrow(full,original.submissionHash),false);
  for(const change of [{expired:true},{paid:true},{approved:true},{submissionHash:''}])assert.equal(canApproveEscrow({...full,...change},partial.submissionHash),false);
});
