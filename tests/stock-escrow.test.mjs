import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TESTNET_SAPIENT_ESCROW as current} from '../app/lib/testnet-sapient-escrow.mjs';
import {NATIVE_TARI_RESOURCE as TARI,agreementId,validateAgreement} from '../app/lib/accord.mjs';
import {parseEscrowSubstate,contributionAmount,canApproveEscrow} from '../app/lib/escrow-funding.mjs';
import {fundingCoins,selectFundingCoins} from '../app/lib/stock-funding.mjs';
import {createSapientAdapter} from '../app/lib/sapient.mjs';
import init,{makeReturnNote,publicReturnBinding} from '../app/lib/stock-crypto/accord_sapient_client.js';
await init({module_or_path:await readFile(new URL('../app/lib/stock-crypto/accord_sapient_client_bg.wasm',import.meta.url))});
const fixture=JSON.parse(await readFile(new URL('./fixtures/sapient-escrow-substate.json',import.meta.url),'utf8'));
const demo={...current,recordedVersion:2,recordedEpoch:12739};
const state=()=>parseEscrowSubstate(fixture,demo,demo.recordedEpoch);
const source='a'.repeat(64),fee='b'.repeat(64),receipt='c'.repeat(64),sourceKey='d'.repeat(64);
const coin=(commitment,amount)=>({resourceAddress:TARI,commitment,amount});

test('v5 binds goal, required reviewer and both fixed payout keys to the agreement hash',async()=>{
 assert.equal(await agreementId(demo.agreement),demo.agreementId);
 for(const change of [s=>s.payoutNonce='1'.repeat(64),s=>s.targetUnits='10000001',s=>s.requiredReviewerPublicKey=s.reviewers[0].publicKey]){
  const agreement=structuredClone(demo.agreement);change(agreement.milestones[0]);assert.notEqual(await agreementId(agreement),demo.agreementId);
 }
 for(const value of [undefined,'0'.repeat(64),'xyz']){const agreement=structuredClone(demo.agreement);agreement.milestones[0].payoutNonce=value;assert.throws(()=>validateAgreement(agreement));}
});
test('verified stock-Sapient checkpoint has seven real TARI, three remaining and no premature review',()=>{
 const s=state();assert.equal(s.fundedUnits,'7000000');assert.equal(s.remainingUnits,'3000000');assert.equal(s.approvals,0);assert.equal(s.requiredReviewerApproved,false);
 assert.equal(contributionAmount('3',s),'3000000');assert.throws(()=>contributionAmount('3.000001',s));assert.equal(canApproveEscrow(s,demo.submissionHash),false);
 assert.equal(s.refundBindings[0].value,'7000000');assert.equal(s.receiptCommitments.length,1);
});
test('stock state rejects changed terms, vaults, unbacked totals, duplicate returns and malformed receipt data',()=>{
 for(const change of [r=>r.verified=false,r=>r.version=1,r=>r.state.up.substate.Component.header.owner_rule='AllowAll',
  r=>r.state.up.substate.Component.body.state[4].hex='1'.repeat(64),r=>r.state.up.substate.Component.body.state[8]=11000000,
  r=>r.state.up.substate.Component.body.state[13].value.hex='2'.repeat(64),r=>r.state.up.substate.Component.body.state[10]=7000001,
  r=>r.state.up.substate.Component.body.state[18][0]=true,r=>r.state.up.substate.Component.body.state[20][0].hex='bad',
  r=>{const s=r.state.up.substate.Component.body.state;for(const i of [15,16,17,18,20])s[i].push(s[i][0]);s[10]=10000000;}]){
  const response=structuredClone(fixture);change(response);assert.throws(()=>parseEscrowSubstate(response,demo,demo.recordedEpoch));
 }
});
test('coin selection never reveals a larger balance and never spends zero-value memo receipts or the fee source twice',()=>{
 const coins=[coin(source,'3000000'),coin(fee,'500000'),coin(receipt,'0')];
 const result=selectFundingCoins(coins,'3000000','100000');assert.equal(result.source.commitment,source);assert.equal(result.fee.commitment,fee);
 assert.equal(selectFundingCoins([coin(source,'100000000'),coin(fee,'500000')],'3000000','100000').source,null);
 assert.equal(selectFundingCoins([coin(source,'3000000')],'3000000','100000').source,null);
 assert.equal(selectFundingCoins([coin(source,'3000000'),coin(fee,'100000')],'3000000','100000').source,null);
 assert.deepEqual(fundingCoins([coin(receipt,'0')]),[]);
 assert.throws(()=>fundingCoins([coin(source,'1'),coin(source,'1')]));assert.throws(()=>fundingCoins([coin(source,3)]));
});
function mockWallet({records=[coin(source,'3000000'),coin(fee,'500000')],grant=true,viewAllowed=true,live=state(),onRead,walletAddress=demo.agreement.creatorWalletAddress}={}){
 const calls=[];let status='approved';let accountChanged;
 const caps={transactionRequests:true,supportsPrivateFees:true,privateBalanceView:true,stealthRedeemPrivateFee:true,walletAddress:true,privateSpend:true};
 const result={transactionId:'f'.repeat(64),feeChangeCommitment:'e'.repeat(64),recipientCommitment:'9'.repeat(64)};
 const provider={on:(_,fn)=>{accountChanged=fn;return()=>{};},async request(args){calls.push(args);switch(args.method){
  case'tari_requestAccounts':case'tari_getAccounts':return['component_connected'];
  case'tari_getNetwork':return'esmeralda';case'tari_getCapabilities':return caps;
  case'tari_getViewAccess':return{granted:grant};case'tari_requestViewAccess':return{granted:viewAllowed};
  case'tari_getShieldedOutputs':onRead?.();return records;
  case'tari_getSubstate':return{verified:true,state:{up:{substate:{Utxo:{output:{auth:{Key:sourceKey}}}}}}};
  case'tari_getWalletAddress':return walletAddress;
  case'tari_createTransactionRequest':return{requestId:'request-1'};
  case'tari_submitTransactionRequest':status='submitted';return result;
  case'tari_getTransactionRequest':return{status,...(status==='submitted'?{result}:{})};
  case'tari_claimPrivatePayment':return{amount:'0'};
  default:throw new Error('Unexpected method '+args.method);
 }}};
 const seen=[];const crypto={async makeFundingReturn(address,amount){seen.push({address,amount});return{privateReceipt:true};},async makeFundingArgs(note,total,address,amount,id,receiver){seen.push({total,address,amount,id,receiver});return{args:[{Workspace:{id:0,offset:null}},{Literal:'00'}],receiptCommitment:receipt};}};
 const storage=new Map();const adapter=createSapientAdapter({provider,pollIntervalMs:0,requestTimeoutMs:300,storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fundingCrypto:crypto,escrowReader:async()=>live});
 return{adapter,calls,seen,storage,change:()=>accountChanged?.([])};
}
const funding={deployment:demo,amount:'3000000',expectedTotal:'7000000',sourceCommitment:source,feeCommitment:fee};
test('funding uses exact-value stock redemption, private fees, the selected one-time signer and no donor account in instructions',async()=>{
 const m=mockWallet();await m.adapter.connect();const result=await m.adapter.fundEscrow(funding);
 const op=m.calls.find(c=>c.method==='tari_createTransactionRequest').params;
 assert.equal(op.kind,'redeemStealthOutputWithPrivateFee');assert.equal(op.revealedAmount,'3000000');assert.equal(op.commitmentHex,source);assert.equal(op.feeCommitmentHex,fee);assert.equal(op.feeResourceAddress,TARI);
 assert.deepEqual(op.relatedComponents,[demo.component]);assert.equal(op.followUpInstructions[0].CallMethod.method,'fund');assert.equal(JSON.stringify(op).includes('component_connected'),false);
 assert.equal(m.seen[1].receiver,sourceKey);assert.equal(result.receiptCommitment,receipt);assert.equal(result.receiptRegistered,true);assert.equal(m.storage.size,0);
 assert.equal(m.calls.filter(c=>c.method==='tari_submitTransactionRequest').length,1);
});
test('stale capacity, larger source, reused fee coin and declined view grant fail before creating a funding request',async()=>{
 for(const [settings,input]of [[{live:{...state(),fundedUnits:'8000000',remainingUnits:'2000000'}},funding],[{records:[coin(source,'100000000'),coin(fee,'500000')]},funding],[{}, {...funding,feeCommitment:source}],[{grant:false,viewAllowed:false},funding]]){
  const m=mockWallet(settings);await m.adapter.connect();await assert.rejects(m.adapter.fundEscrow(input));assert.equal(m.calls.some(c=>c.method==='tari_createTransactionRequest'),false);
 }
});
test('an account change during private reads invalidates the quote before any payment is created',async()=>{
 let m;m=mockWallet({onRead:()=>m.change()});await m.adapter.connect();await assert.rejects(m.adapter.fundEscrow(funding),{code:'ACCOUNT_CHANGED'});assert.equal(m.calls.some(c=>c.method==='tari_createTransactionRequest'),false);
});
test('preparation remains a private self-transfer and registers the incoming exact coin',async()=>{
 const m=mockWallet();await m.adapter.connect();const result=await m.adapter.prepareFundingCoin({amount:'3000000'});
 const op=m.calls.find(c=>c.method==='tari_createTransactionRequest').params;
 assert.equal(op.kind,'sendPrivately');assert.equal(op.recipientWalletAddress,demo.agreement.creatorWalletAddress);assert.equal(op.amount,'3000000');assert.equal(op.feeType,'private');assert.equal(op.enforceFeeType,true);assert.equal(result.registered,true);
});
test('memo recovery matches a wallet-derived return against verified contract bindings without making a transaction',async()=>{
 const note=JSON.parse(makeReturnNote(demo.agreement.creatorWalletAddress,'7000000'));
 const binding=JSON.parse(publicReturnBinding(JSON.stringify(note)));
 const memo=`ootleaccord:v5:refund:${demo.agreementId}:7000000:${note.nonce}`;
 const m=mockWallet({records:[{...coin(receipt,'0'),memo},{...coin('1'.repeat(64),'0'),memo:'ootleaccord:v5:invalid'}],live:{...state(),refundBindings:[binding]}});
 await m.adapter.connect();const found=await m.adapter.loadReturnReceipts(demo);
 assert.equal(found.receipts.length,1);assert.equal(found.receipts[0].index,0);assert.deepEqual(found.receipts[0].binding,binding);
 assert.equal(m.calls.some(c=>c.method==='tari_createTransactionRequest'),false);assert.equal(m.storage.size,0);
});
test('paid checkpoint shows the required vote and exact fixed private payout without reopening funding',async()=>{
 const paid=JSON.parse(await readFile(new URL('./fixtures/sapient-escrow-paid.json',import.meta.url),'utf8'));
 const s=parseEscrowSubstate(paid,current,current.recordedEpoch);
 assert.equal(s.paid,true);assert.equal(s.fundedUnits,'0');assert.equal(s.remainingUnits,'0');assert.equal(s.approvals,3);assert.equal(s.requiredReviewerApproved,true);
 assert.deepEqual(s.votes,[true,true,true,false,false]);assert.equal(canApproveEscrow(s,current.submissionHash,2),false);
});
test('an already-recorded reviewer vote and a completed payout cannot open another paid Sapient request',async()=>{
 const full={...state(),fundedUnits:'10000000',fullyFunded:true,remainingUnits:'0'};
 for(const [live,code]of [[{...full,votes:[false,false,true,false,false]},'ALREADY_APPROVED'],[{...full,paid:true},'ALREADY_PAID'],[state(),'REVIEW_NOT_READY']]){
  const m=mockWallet({live,walletAddress:demo.agreement.milestones[0].reviewers[2].walletAddress});await m.adapter.connect();
  await assert.rejects(m.adapter.approveMilestone({agreement:demo.agreement,deployment:demo,stageId:'delivery',submissionHash:demo.submissionHash,maxFee:'100000'}),{code});
  assert.equal(m.calls.some(c=>c.method==='tari_createTransactionRequest'),false);
 }
 const m=mockWallet({live:full,walletAddress:demo.agreement.milestones[0].reviewers[2].walletAddress});await m.adapter.connect();
 await m.adapter.approveMilestone({agreement:demo.agreement,deployment:demo,stageId:'delivery',submissionHash:demo.submissionHash,maxFee:'100000'});
 assert.equal(m.calls.filter(c=>c.method==='tari_createTransactionRequest').length,1);
});
