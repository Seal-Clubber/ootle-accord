import test from 'node:test';
import assert from 'node:assert/strict';
import { TESTNET_DEMO } from '../app/lib/testnet-demo.mjs';
import { TESTNET_ESCROW } from '../app/lib/testnet-escrow.mjs';
import { REVIEW_DEPLOYMENTS } from '../app/lib/review-deployments.mjs';
import { createSapientAdapter } from '../app/lib/sapient.mjs';
import { agreementId, sha256Hex } from '../app/lib/accord.mjs';
import { cborSubmissionHash } from '../app/lib/review-args.mjs';

function mock(address, privateFees=true) {
  const calls=[]; let status='approved';
  const provider={isTariWallet:true,on(){return()=>{};},async request(call){calls.push(call);switch(call.method){
    case 'tari_requestAccounts': case 'tari_getAccounts':return ['component_mock'];
    case 'tari_getNetwork':return 'esmeralda';
    case 'tari_getCapabilities':return {transactionRequests:true,supportsPrivateFees:privateFees,walletAddress:true};
    case 'tari_getWalletAddress':return address;
    case 'tari_createTransactionRequest':return {requestId:'request-quorum'};
    case 'tari_getTransactionRequest':return {status,...(status==='submitted'?{result:{transactionId:'mock-only'}}:{})};
    case 'tari_submitTransactionRequest':status='submitted';return {transactionId:'mock-only'};
    default:throw new Error(call.method);
  }}};
  return {calls,adapter:createSapientAdapter({provider,storage:null,pollIntervalMs:0,requestTimeoutMs:200})};
}
const params={agreement:TESTNET_DEMO.agreement,stageId:'quorum-demo',submissionHash:TESTNET_DEMO.submissionHash,maxFee:'1000000'};

test('v4 funded escrow approval targets the verified escrow and requires private fees',async()=>{
  const m=mock(TESTNET_ESCROW.agreement.milestones[0].reviewers[2].walletAddress);await m.adapter.connect();
  await m.adapter.approveMilestone({agreement:TESTNET_ESCROW.agreement,stageId:'delivery',submissionHash:TESTNET_ESCROW.submissionHash,maxFee:'1000000'});
  const p=m.calls.find(c=>c.method==='tari_createTransactionRequest').params;
  assert.equal(p.instructions[0].CallMethod.call.Address,TESTNET_ESCROW.component);assert.deepEqual(p.instructions[0].CallMethod.args,[{Literal:'02'},cborSubmissionHash(TESTNET_ESCROW.submissionHash)]);
  assert.equal(p.feeType,'private');assert.equal(p.enforceFeeType,true);
  const changed=structuredClone(TESTNET_ESCROW.agreement);changed.milestones[0].requiredReviewerPublicKey=changed.milestones[0].reviewers[0].publicKey;
  const other=mock(TESTNET_ESCROW.agreement.milestones[0].reviewers[2].walletAddress);
  await assert.rejects(other.adapter.approveMilestone({agreement:changed,stageId:'delivery',submissionHash:TESTNET_ESCROW.submissionHash,maxFee:'1000000'}),{code:'REVIEW_NOT_DEPLOYED'});assert.deepEqual(other.calls,[]);
});

test('bundled public demo identity and actual work hash match the verified allowlist',async()=>{
  assert.equal(await agreementId(TESTNET_DEMO.agreement),TESTNET_DEMO.agreementId);
  assert.equal(await sha256Hex(new TextEncoder().encode(TESTNET_DEMO.work)),TESTNET_DEMO.submissionHash);
  assert.equal(REVIEW_DEPLOYMENTS.esmeralda[`${TESTNET_DEMO.agreementId}:quorum-demo`],TESTNET_DEMO.component);
});

test('designated Sapient reviewer signs exact indexed approval with private fees only',async()=>{
  const m=mock(TESTNET_DEMO.agreement.milestones[0].reviewers[2].walletAddress);
  await m.adapter.connect();
  await m.adapter.approveMilestone(params);
  const created=m.calls.find(c=>c.method==='tari_createTransactionRequest');
  assert.deepEqual(created.params,{kind:'instructions',instructions:[{CallMethod:{call:{Address:TESTNET_DEMO.component},method:'approve',args:[{Literal:'02'},cborSubmissionHash(TESTNET_DEMO.submissionHash)]}}],maxFee:'1000000',feeType:'private',enforceFeeType:true});
  assert.equal(m.calls.some(c=>/Balances|ViewAccess/.test(c.method)),false);
});

test('other signers, invalid hashes and missing private fees cannot create approvals',async()=>{
  const wrong=mock(TESTNET_DEMO.agreement.creatorWalletAddress); await wrong.adapter.connect();
  await assert.rejects(wrong.adapter.approveMilestone(params),{code:'WRONG_REVIEWER'});
  const missing=mock(TESTNET_DEMO.agreement.milestones[0].reviewers[2].walletAddress,false); await missing.adapter.connect();
  await assert.rejects(missing.adapter.approveMilestone(params),{code:'UNSUPPORTED_CAPABILITY'});
  const malformed=mock(TESTNET_DEMO.agreement.milestones[0].reviewers[2].walletAddress);
  await assert.rejects(malformed.adapter.approveMilestone({...params,submissionHash:'bad'}));
  for(const m of [wrong,missing,malformed]) assert.equal(m.calls.some(c=>c.method==='tari_createTransactionRequest'),false);
});

test('only the designated creator can submit work through Sapient',async()=>{
  const wrong=mock(TESTNET_DEMO.agreement.milestones[0].reviewers[2].walletAddress); await wrong.adapter.connect();
  await assert.rejects(wrong.adapter.submitWork(params),{code:'WRONG_CREATOR'});
  const creator=mock(TESTNET_DEMO.agreement.creatorWalletAddress); await creator.adapter.connect();
  await creator.adapter.submitWork(params);
  assert.equal(creator.calls.find(c=>c.method==='tari_createTransactionRequest').params.instructions[0].CallMethod.method,'submit_work');
});
