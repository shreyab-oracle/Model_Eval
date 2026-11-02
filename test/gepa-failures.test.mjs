// Isolated external-call fixtures; the ledger, checks and selection are real.
import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOptimizationCase} from '../src/optimization/engine.mjs';
import {createCallLedger} from '../src/optimization/ledger.mjs';
import {selectOptimizationCandidate} from '../src/domain/optimization.mjs';
import {POLICY,INITIAL_PROMPT} from '../src/domain/policy.mjs';
import {judgeTemplates} from '../src/domain/judge.mjs';
import fs from 'node:fs';
import {runGepa,pythonPath} from '../src/optimization/bridge.mjs';

const c={id:'unit-case',category:'routine',po:{id:'po',quantity:2,unitCents:10000,supplierId:'supplier',currency:'USD'},receipt:{id:'receipt',quantity:2},invoice:{id:'invoice',quantity:2,unitCents:10000,supplierId:'supplier',currency:'USD'},supplierMessage:'Please review.',evidence:{activeHolds:[],duplicate:false,conflicts:[],historicalHoldIds:[],payments:[],releases:[]}};
const answer={action:'NO_MATCHING_EXCEPTION',holdReasons:[],missingFacts:[],owner:'Accounts Payable',nextStep:'Accounts Payable should continue normal approval.',sources:['po','receipt','invoice'],calculations:{billedTotalCents:20000,quantityDiscrepancy:0,discrepancyAmountCents:0,priceDeltaCents:0},paymentStatus:'UNKNOWN',holdReleaseStatus:'UNKNOWN',reply:'Thank you. Please continue normal approval. Payment is not verified.'};
const judge={scores:{policy:3,evidence:3,tone:3,clarity:3,nextSteps:3},critical:false,rationale:'The matching invoice can continue normal approval.',evidence:[{quote:'Payment is not verified.',axis:'evidence',reason:'No invented payment claim.'}]};
function fixture(responses){
  const docs=new Map(),traces=new Map(),calls=[];
  const store={doc:async id=>docs.get(id),docs:async(kind,parentId)=>[...docs.values()].filter(d=>d.kind===kind&&d.parentId===parentId),saveDoc:async d=>{docs.set(d.id,{...d,...d.value});return d.id;}};
  const io={jobId:'failure-unit',cycle:0,maxCalls:30,store,guard:async()=>{},writeTrace:async(id,value)=>{traces.set(id,value);return{id};},loadTrace:async ref=>traces.get(ref.id),call:async options=>{calls.push(options.modelId);const value=responses[calls.length-1];if(value instanceof Error)throw value;if(value===undefined)throw new Error('Unexpected extra request');return{text:typeof value==='string'?value:JSON.stringify(value),latencyMs:1,usage:null,raw:{fixture:true}};}};
  const source={models:{candidate:'candidate',judge:'judge'},modes:{candidate:'ON_DEMAND',judge:'ON_DEMAND'},settings:{},judgeSettings:{},policy:POLICY,judgeTemplates:judgeTemplates(POLICY)};
  return{store,docs,calls,io,input:{snapshot:{source},jobId:io.jobId,text:INITIAL_PROMPT,c,store,invoke:createCallLedger(io)}};
}

for(const [name,bad] of [['invalid action',{...answer,action:'PRICE_TOLERANCE'}],['invalid JSON','not a JSON answer']])test(`GEPA records ${name} as failed feedback and continues remaining repetitions`,async()=>{
  const f=fixture([bad,answer,judge,judge,answer,judge,judge]);
  const value=await evaluateOptimizationCase(f.input);
  assert.equal(value.pass,false);assert.equal(value.complete,false);assert.equal(value.attempted,true);assert.equal(value.executionErrors,1);
  assert.equal(value.feedback.outputs[0].response?.action,name==='invalid action'?'PRICE_TOLERANCE':undefined);
  assert.equal(typeof value.feedback.outputs[0].error.message,'string');
  if(name==='invalid action')assert.match(value.feedback.outputs[0].error.message,/action.*PRICE_TOLERANCE.*RETAIN_HOLD/);
  assert.deepEqual(f.calls,['candidate','candidate','judge','judge','candidate','judge','judge']);
  const failed=[...f.docs.values()].find(d=>d.kind==='GEPA_CALL_RESULT'&&!d.success);assert.equal(failed.evaluationFailure,true);
  await evaluateOptimizationCase(f.input);assert.equal(f.calls.length,7,'recorded invalid answers must not be rerolled');
});

test('a malformed judge assessment stays an execution failure without fabricated scores',async()=>{
  const f=fixture([answer,{scores:{policy:'3'}},judge,answer,judge,judge,answer,judge,judge]);
  const value=await evaluateOptimizationCase(f.input);
  assert.equal(value.pass,false);assert.equal(value.complete,false);assert.equal(value.executionErrors,1);
  assert.equal(value.feedback.outputs[0].judges.length,1);assert.equal(value.feedback.outputs[0].judgeErrors[0].assessment,0);
  assert.equal(f.calls.length,9);
});

test('transport failures still stop GEPA rather than becoming model-quality scores',async()=>{
  const f=fixture([Object.assign(new Error('Connection reset'),{code:'ECONNRESET'})]);
  await assert.rejects(()=>evaluateOptimizationCase(f.input),/Connection reset/);
  assert.equal(f.calls.length,1);assert.equal([...f.docs.values()].filter(d=>d.kind==='GEPA_EVALUATION').length,0);
});

test('an interrupted save replays the recorded malformed answer without a new model request',async()=>{
  const f=fixture([{...answer,action:'PRICE_TOLERANCE'},answer,judge,judge,answer,judge,judge]);
  const save=f.store.saveDoc;
  f.store.saveDoc=async d=>{if(d.kind==='GEPA_OUTPUT')throw new Error('Output save interrupted');return save(d);};
  await assert.rejects(()=>evaluateOptimizationCase(f.input),/Output save interrupted/);
  assert.equal(f.calls.length,1);
  f.store.saveDoc=save;f.input.invoke=createCallLedger({...f.io,cycle:1});
  const value=await evaluateOptimizationCase(f.input);
  assert.equal(value.executionErrors,1);assert.equal(value.pass,false);assert.equal(f.calls.length,7);
});

test('failed trace persistence stops GEPA even when the answer itself is malformed',async()=>{
  const f=fixture([{...answer,action:'PRICE_TOLERANCE'}]);
  f.input.invoke=createCallLedger({...f.io,writeTrace:async()=>{throw new Error('Trace storage unavailable');}});
  await assert.rejects(()=>evaluateOptimizationCase(f.input),/Trace storage unavailable/);
  assert.equal([...f.docs.values()].filter(d=>d.kind==='GEPA_EVALUATION').length,0);
});

test('the actual GEPA search receives malformed-answer feedback and evaluates a revision',{skip:!fs.existsSync(pythonPath())},async()=>{
  const f=fixture([]),revised=INITIAL_PROMPT+' Choose the action from its allowed decision values.';
  f.io.call=async options=>({text:JSON.stringify(options.modelId==='candidate'?(options.messages[0].content.startsWith(revised)?answer:{...answer,action:'PRICE_TOLERANCE'}):judge),raw:{fixture:true}});
  f.input.invoke=createCallLedger({...f.io,maxCalls:216});
  let receivedFeedback=false;
  const result=await runGepa({prompt:INITIAL_PROMPT,trainIds:['a','b'],validationIds:['c','d'],limits:{maxCaseEvaluations:24,maxProposals:1}},async request=>{
    if(request.operation==='propose'){receivedFeedback=JSON.stringify(request.feedback).includes('PRICE_TOLERANCE');return{text:revised};}
    const rows=[];for(const caseId of request.caseIds)rows.push(await evaluateOptimizationCase({...f.input,text:request.text,c:{...c,id:caseId}}));return{rows};
  },{timeoutMs:20000});
  assert.equal(result.version,'0.1.4');assert.equal(receivedFeedback,true);
  assert.ok([...f.docs.values()].some(d=>d.kind==='GEPA_EVALUATION'&&d.text===revised&&d.pass));
});

test('selection can improve on a fully attempted failing seed but cannot select execution errors',()=>{
  const cases=[{id:'a',category:'routine'}];
  const seed={text:'seed',caseId:'a',attempted:true,complete:false,pass:false,executionErrors:1,critical:false,pending:false};
  const good={text:'good',caseId:'a',attempted:true,complete:true,pass:true,executionErrors:0,critical:false,pending:false};
  assert.equal(selectOptimizationCandidate('seed',cases,[seed,good]).text,'good');
  assert.equal(selectOptimizationCandidate('seed',cases,[seed,{...good,complete:false,executionErrors:1}]).changed,false);
  assert.equal(selectOptimizationCandidate('seed',cases,[{...seed,attempted:false},good]).changed,false);
});
