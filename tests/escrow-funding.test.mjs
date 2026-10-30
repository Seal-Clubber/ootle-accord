import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TESTNET_ESCROW as demo} from '../app/lib/testnet-escrow.mjs';
import {validateAgreement,agreementId} from '../app/lib/accord.mjs';
import {fundingState,contributionAmount,parseEscrowSubstate,refreshEscrow} from '../app/lib/escrow-funding.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/escrow-substate.json',import.meta.url),'utf8'));

test('v4 agreement binds the required reviewer, goal and one-time payout destination',async()=>{
  assert.equal(await agreementId(demo.agreement),demo.agreementId);
  for(const mutate of [s=>s.targetUnits='10000001',s=>s.requiredReviewerPublicKey=s.reviewers[0].publicKey,s=>s.payoutPublicKey='a'.repeat(64)]){
    const input=structuredClone(demo.agreement);mutate(input.milestones[0]);assert.notEqual(await agreementId(input),demo.agreementId);
  }
  for(const mutate of [s=>delete s.targetUnits,s=>s.requiredReviewerPublicKey='a'.repeat(64),s=>s.payoutPublicKey='0'.repeat(64)]){
    const input=structuredClone(demo.agreement);mutate(input.milestones[0]);assert.throws(()=>validateAgreement(input));
  }
});
test('Max uses exact remaining units and rejects overfunding or closed contributions',()=>{
  const s=fundingState({targetUnits:'10000000',fundedUnits:'3000001',epoch:'10',deadline:'20'});
  assert.equal(s.remainingUnits,'6999999');assert.equal(contributionAmount('6.999999',s),'6999999');assert.throws(()=>contributionAmount('7',s),/6.999999/);
  for(const state of [{...s,remainingUnits:'0'},{...s,paid:true},{...s,expired:true}])assert.throws(()=>contributionAmount('0.000001',state));
  assert.throws(()=>fundingState({targetUnits:'1',fundedUnits:'2',epoch:'10',deadline:'20'}));
});
test('committed private escrow checkpoint is full with the mandatory reviewer still outstanding',()=>{
  const s=parseEscrowSubstate(fixture,demo,12721);assert.equal(s.fundedUnits,'10000000');assert.equal(s.remainingUnits,'0');assert.equal(s.fullyFunded,true);assert.equal(s.approvals,2);assert.equal(s.requiredReviewerApproved,false);assert.equal(s.approved,false);assert.equal(s.paid,false);
  const copy=structuredClone(fixture);copy.state.up.substate.Component.body.state[11][3]=true;
  assert.equal(parseEscrowSubstate(copy,demo,12721).approved,false);
});
test('funding display rejects unverified, stale, different-template and changed-term responses',()=>{
  for(const mutate of [v=>v.verified=false,v=>v.version=3,v=>v.state.up.substate.Component.header.template_address='a'.repeat(64),v=>v.state.up.substate.Component.body.state[6]=1,v=>v.state.up.substate.Component.body.state[7]=11000000,v=>v.state.up.substate.Component.body.state[3].hex='a'.repeat(64),v=>v.state.up.substate.Component.body.state[9]=Number.MAX_SAFE_INTEGER+1]){
    const copy=structuredClone(fixture);mutate(copy);assert.throws(()=>parseEscrowSubstate(copy,demo,12721));
  }
});
test('explicit refresh uses only pinned public endpoints and sends no wallet data',async()=>{
  const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('/network')?{network:'esmeralda',network_byte:38,epoch:12721}:fixture};};
  const s=await refreshEscrow(demo,fetcher);assert.equal(s.remainingUnits,'0');assert.equal(calls.length,2);
  assert.deepEqual(calls.map(c=>c.url).sort(),['https://ootle-indexer-a.tari.com/network','https://ootle-indexer-a.tari.com/substates/'+demo.component].sort());
  for(const {options}of calls){assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.body,undefined);}
  await assert.rejects(refreshEscrow({...demo,component:'component_'+'a'.repeat(64)},fetcher));assert.equal(calls.length,2);
});
