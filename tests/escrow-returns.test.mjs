import test from 'node:test';
import assert from 'node:assert/strict';
import {createReturnClient} from '../app/lib/escrow-returns.mjs';
const id='a'.repeat(64),commitment='b'.repeat(64),component='component_'+'c'.repeat(64);
const initial={version:2,fullyFunded:false,approved:false,expired:true,paid:false,refunded:[false]};
function setup({live=initial,postError=false,final='pending',dryAccepted=true}={}){
 const values=new Map(),calls=[];const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/dry-run'))return{ok:true,json:async()=>({result:{finalize:{result:dryAccepted?{Accept:{}}:{Reject:'test rejection'}}}})};
  if(url.endsWith('/transactions')){if(postError)throw new Error('Response lost');return{ok:true,json:async()=>({transaction_id:id})};}
  return{ok:true,json:async()=>({result:final==='pending'?'Pending':{Finalized:{final_decision:'Commit',execution_result:{finalize:{result:{Accept:{up_substates:[[`utxo_${'01'.repeat(32)}_${commitment}`,{}]]}}}}}}})};
 };
 const builds=[];const options={storage,fetcher,readEscrow:async()=>live,buildAction:async(d,s,r,i,dryRun)=>{builds.push({i,dryRun});return{transactionId:id,returnCommitment:commitment,transaction:'sealed-envelope'};}};
 return{client:createReturnClient(options),options,values,calls,builds};
}
test('a public return is checked for eligibility and dry-run before broadcast, saving only public identifiers',async()=>{
 const m=setup();const result=await m.client.submit({component},{nonce:'PRIVATE'},0);
 assert.equal(result.status,'pending');assert.deepEqual(m.builds,[{i:0,dryRun:true},{i:0,dryRun:false}]);assert.equal(m.calls.filter(c=>c.options.method==='POST').length,2);
 const saved=[...m.values.values()][0];assert.equal(saved.includes('PRIVATE'),false);assert.equal(saved.includes('sealed-envelope'),false);assert.deepEqual(JSON.parse(saved),{id,commitment,component});
 await assert.rejects(m.client.submit({component},{},0),/existing return/);
});
test('lost broadcast responses remain guarded across a page reload and checking never rebroadcasts',async()=>{
 const m=setup({postError:true});await assert.rejects(m.client.submit({component},{},0),/Response lost/);const restored=createReturnClient(m.options);
 assert.equal(restored.getPending().id,id);await restored.check();assert.equal(m.calls.filter(c=>c.url.endsWith('/transactions')).length,1);
});
test('confirmed private output clears the pending guard; failed eligibility and simulation never send funds',async()=>{
 const m=setup({final:'committed'});const result=await m.client.submit({component},{},0);assert.equal(result.status,'committed');assert.equal(m.values.size,0);
 for(const settings of [{live:{...initial,expired:false}},{live:{...initial,paid:true}},{live:{...initial,refunded:[true]}},{dryAccepted:false}]){
  const m=setup(settings);await assert.rejects(m.client.submit({component},{},0));assert.equal(m.calls.some(c=>c.url.endsWith('/transactions')),false);assert.equal(m.values.size,0);
 }
 const beforeQuorum=setup({live:{...initial,expired:false,fullyFunded:true,approved:false}});await assert.rejects(beforeQuorum.client.submit({component},{},null));assert.equal(beforeQuorum.calls.length,0);
});
