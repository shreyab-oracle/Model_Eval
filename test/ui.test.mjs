import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {generateDataset} from '../src/domain/dataset.mjs';
import {visibleRunId,shouldPollRun} from '../frontend/presentation.mjs';
const require=createRequire(import.meta.url);
const built=await build({entryPoints:['frontend/pages.jsx','frontend/case-details.jsx','frontend/optimization.jsx'],outdir:'memory',bundle:true,write:false,platform:'node',format:'cjs',external:['react']});
function compile(name){const value={exports:{}};new Function('module','exports','require',built.outputFiles.find(f=>f.path.endsWith(name+'.js')).text)(value,value.exports,require);return value;}
const compiled=compile('pages'),details=compile('case-details');
const optimization=compile('optimization');

test('model choices show the configured Gemini candidate while keeping historical model names independent',()=>{
  const boot={configuration:{models:{baseline:'ocid1.model.baseline',candidate:'ocid1.model.gemini',judge:'ocid1.model.judge'},modelNames:{baseline:'GPT-5.4 mini',candidate:'Gemini 2.5 Flash',judge:'GPT-5.4'}},datasets:[],prompts:[],policies:[],runs:[],promptApprovals:[]};
  const html=renderToStaticMarkup(React.createElement(compiled.exports.SetupPage,{boot,request:()=>{},act:()=>{},busy:false,openRun:()=>{}}));
  assert.match(html,/Gemini 2\.5 Flash/);assert.match(html,/GPT-5\.4 mini/);assert.match(html,/>GPT-5\.4</);
});

test('improvement history separates active requests from recorded format failures',()=>{
  const job={id:'job',status:'RUNNING',createdAt:'2026-11-02T05:43:32Z',candidateModel:{displayName:'GPT-5.4'},activeCalls:1,uncertainCalls:0,evaluationFailures:1,errors:[],candidates:[],optimizerCurrent:true};
  const html=renderToStaticMarkup(React.createElement(optimization.exports.OptimizationPanel,{boot:{runs:[],prompts:[],optimizationJobs:[job]},act:()=>{},request:()=>{}}));
  assert.match(html,/1 model request running/);assert.match(html,/1 answer or review could not be evaluated/);
  assert.doesNotMatch(html,/request outcomes need checking/);
});

test('an older improvement job directs the user to a new search instead of offering unsafe resume',()=>{
  const job={id:'job',status:'INCOMPLETE',createdAt:'2026-11-02T05:43:32Z',candidateModel:{displayName:'GPT-5.4'},errors:[],candidates:[],optimizerCurrent:false};
  const html=renderToStaticMarkup(React.createElement(optimization.exports.OptimizationPanel,{boot:{runs:[],prompts:[],optimizationJobs:[job]},act:()=>{},request:()=>{}}));
  assert.match(html,/Start a new improvement/);assert.doesNotMatch(html,/Resume with remaining call limit/);
});

test('a draft evaluation can be started directly without payment confirmation',()=>{
  const bundle={run:{id:'draft',status:'DRAFT'},snapshot:{dataset:{version:'development-v1'},datasetKind:'development',promptId:'stored-prompt',policy:{version:'demo'},modelMetadata:{baseline:{displayName:'baseline'},candidate:{displayName:'candidate'}}},result:{decision:'REVIEW',complete:false,criticalCandidateFailures:0,pendingReviews:0,reasons:[],categories:{},comparisons:[]},progress:{done:0,total:18,failed:0,running:0},metrics:{p95LatencyMs:null,usageKnown:0,usageUnknown:0},evidence:{},outputs:[],tasks:[]};
  const html=renderToStaticMarkup(React.createElement(compiled.exports.RunPage,{bundle,runId:'draft',busy:false,boot:{},act:()=>{},request:()=>{}}));
  assert.match(html,/<button(?![^>]*disabled)[^>]*>Start evaluation<\/button>/);
  assert.match(html,/<button[^>]*disabled[^>]*>Check and save report<\/button>/);
  assert.match(html,/Reports are available after every evaluation step finishes/);
  assert.doesNotMatch(html,/type="checkbox"|Paid|Cost|acknowledg/i);
});

test('progress separates unresolved processing problems from recovered responses and review retries',()=>{
  const bundle={run:{id:'running',status:'RUNNING'},snapshot:{dataset:{version:'development-v1'},datasetKind:'development',modelMetadata:{baseline:{displayName:'baseline'},candidate:{displayName:'candidate'}}},result:{decision:'REVIEW',complete:false,criticalCandidateFailures:0,pendingReviews:0,reasons:[],categories:{},comparisons:[]},progress:{done:23,total:432,failed:28,running:2},metrics:{},evidence:{},outputs:[],tasks:[{id:'review-retry',stage:'JUDGE',status:'DONE'}],attempts:[{modelCall:false,recoveryKind:'LOCAL_JOURNAL'},{modelCall:false,recoveryKind:'LOCAL_JOURNAL'},{modelCall:true,recoveryKind:'LOCAL_JOURNAL'},{modelCall:false,recoveryKind:'OTHER'},{status:'FAILED',taskId:'review-retry'}]};
  const html=renderToStaticMarkup(React.createElement(compiled.exports.RunPage,{bundle,runId:'running',busy:false,boot:{},act:()=>{},request:()=>{}}));
  assert.match(html,/28 processing problems/);
  assert.match(html,/2 saved results recovered after connection interruptions\. The original responses were reused\./);
  assert.match(html,/1 AI review requests needed another attempt/);
  assert.doesNotMatch(html,/Not available/);
});
test('case investigation renders malformed model fields without crashing',()=>{
  const c=generateDataset({kind:'development'}).cases[0];
  const bundle={snapshot:{dataset:{cases:[c]},modelMetadata:{baseline:{displayName:'baseline'},candidate:{displayName:'candidate'}}},evidence:{labels:false},outputs:[{caseId:c.id,role:'candidate',repeat:0,response:{action:{invalid:true},reply:{unexpected:'object'}},checks:[{code:'STRUCTURED_OUTPUT',status:'FAIL',severity:'major',confirmed:true,message:'Invalid schema'}],judges:[]}]};
  assert.doesNotThrow(()=>renderToStaticMarkup(React.createElement(compiled.exports.InvestigationPage,{bundle,caseId:c.id,setCaseId:()=>{}})));
});

test('history page explains pending comparisons without inventing performance or renaming IDs',()=>{
  assert.equal(typeof compiled.exports.HistoryList,'function');
  const row={id:'existing-run-id',kind:'development',status:'DRAFT',createdAt:new Date().toISOString(),decision:'REVIEW',models:{baseline:{id:'mini',displayName:'GPT mini'},candidate:{id:'large',displayName:'GPT large'},judge:{id:'large',displayName:'GPT large'}},prompt:{id:'existing-prompt-id',version:'reviewer-v1'},dataset:'dev-v1',improvements:null,regressions:null,reasons:['Incomplete run'],pendingReviews:0,executionErrors:0,progress:{done:0,total:432}};
  const html=renderToStaticMarkup(React.createElement(compiled.exports.HistoryList,{rows:[row],openRun:()=>{}}));
  assert.match(html,/GPT mini/);assert.match(html,/reviewer-v1/);assert.match(html,/Incomplete/);assert.match(html,/Pending complete results/);assert.doesNotMatch(html,/existing-run-id|existing-prompt-id/);
});

test('GEPA review cards show facts, answers and judge evidence without opening a normal evaluation',()=>{
  assert.equal(typeof compiled.exports.ReviewFindings,'function');
  const html=renderToStaticMarkup(React.createElement(compiled.exports.ReviewFindings,{item:{optimization:true,caseFacts:{id:'DEV-CASE'},response:{reply:'An uncertain financial assertion'},checks:[],judges:[{critical:true,rationale:'Needs review'}],promptDigest:'unchanged-prompt-digest'}}));
  assert.match(html,/An uncertain financial assertion/);assert.match(html,/Needs review/);assert.match(html,/Practice/);assert.doesNotMatch(html,/unchanged-prompt-digest/);
});

test('setup explains the workflow and keeps provider names and model identifiers out of visible text',()=>{
  const boot={configuration:{models:{baseline:'ocid1.model.baseline',candidate:'ocid1.model.candidate',judge:'ocid1.model.candidate'}},datasets:[],prompts:[],policies:[],runs:[],promptApprovals:[]};
  const html=renderToStaticMarkup(React.createElement(compiled.exports.SetupPage,{boot,request:()=>{},act:()=>{},busy:false,openRun:()=>{}}));
  const visible=html.replace(/<[^>]*>/g,' ');
  assert.doesNotMatch(visible,/OCI|Oracle|ocid1|SHA-256|immutable|snapshot/);
  assert.match(visible,/current model|Current model/);assert.match(visible,/practice|Practice/);
});
test('an invoice opened from review shows the selected answer attempt',()=>{
  const c=generateDataset({kind:'development'}).cases[0],bundle={snapshot:{dataset:{cases:[c]},modelMetadata:{baseline:{displayName:'baseline'},candidate:{displayName:'candidate'}}},evidence:{labels:false},outputs:[{caseId:c.id,role:'candidate',repeat:0,response:{reply:'FIRST_ATTEMPT_MARKER'},checks:[],judges:[]},{caseId:c.id,role:'candidate',repeat:2,response:{reply:'THIRD_ATTEMPT_MARKER'},checks:[],judges:[]}]};
  const html=renderToStaticMarkup(React.createElement(compiled.exports.InvestigationPage,{bundle,caseId:c.id,repeat:2,setRepeat:()=>{},setCaseId:()=>{}}));
  assert.match(html,/THIRD_ATTEMPT_MARKER/);assert.doesNotMatch(html,/FIRST_ATTEMPT_MARKER/);
});
test('judge evidence ignores extra score fields and keeps the five meaningful criteria',()=>{
  const judge={scores:{policy:3,evidence:3,tone:3,clarity:3,nextSteps:3,extra:{note:'unexpected'}},rationale:'Readable explanation',evidence:[]};
  assert.doesNotThrow(()=>renderToStaticMarkup(React.createElement(details.exports.JudgeEvidence,{judges:[judge]})));
});
test('supporting records expose financial mismatches without exposing record IDs',()=>{
  const c=generateDataset({kind:'development'}).cases[0];c.evidence.payments=[{invoiceId:'OTHER',supplierId:'OTHER',currency:'EUR',amountCents:1,source:'EMAIL',status:'SETTLED',verified:true,trusted:true}];c.evidence.historicalHoldIds=['old-hold'];c.evidence.releases=[{invoiceId:c.invoice.id,holdIds:[],status:'RELEASED',trusted:true,verified:true}];
  const html=renderToStaticMarkup(React.createElement(details.exports.CaseFacts,{value:c}));
  assert.match(html,/Matches this invoice: No/);assert.match(html,/Matches billed amount: No/);assert.match(html,/Matches invoice currency: No/);assert.match(html,/Known holds covered: 0 of 1/);assert.match(html,/Timestamp not supplied/);
});

test('investigation hides recovered execution errors and keeps unresolved errors visible',()=>{
  const c=generateDataset({kind:'development'}).cases[0];
  const bundle={snapshot:{dataset:{cases:[c]},modelMetadata:{baseline:{displayName:'baseline'},candidate:{displayName:'candidate'}}},evidence:{labels:false},outputs:[],tasks:[{id:'recovered',caseId:c.id,repeat:0,status:'DONE'},{id:'unresolved',caseId:c.id,repeat:0,status:'FAILED'},{id:'other-answer',caseId:c.id,repeat:1,status:'FAILED'}],attempts:[{id:'old',taskId:'recovered',attempt:1,error:{message:'Recovered connection marker'}},{id:'current',taskId:'unresolved',attempt:1,error:{message:'Unresolved connection marker'}},{id:'other',taskId:'other-answer',attempt:1,error:{message:'Different answer attempt marker'}}]};
  const html=renderToStaticMarkup(React.createElement(compiled.exports.InvestigationPage,{bundle,caseId:c.id,setCaseId:()=>{}}));
  assert.doesNotMatch(html,/Recovered connection marker|Different answer attempt marker/);assert.match(html,/Unresolved connection marker/);
});

test('removed tests cannot remain selected after refreshing a purged workspace',()=>{
  const runs=[{id:'search',kind:'improvement'},{id:'release',kind:'release'},{id:'practice',kind:'development'}];
  assert.equal(visibleRunId(runs,'purged-test'),'release');
  assert.equal(visibleRunId(runs,'practice'),'practice');
  assert.equal(visibleRunId([{id:'search',kind:'improvement'}],'purged-test'),'');
});

test('individual outcomes distinguish business failure, human review and processing failure',()=>{
  const comparison={id:'example',candidate:{pass:false,critical:0,pending:0}};
  const render=(bundle,value=comparison)=>renderToStaticMarkup(React.createElement(compiled.exports.CaseOutcome,{bundle,comparison:value,role:'candidate'}));
  const outputs=[0,1,2].map(repeat=>({caseId:'example',role:'candidate',repeat,response:{reply:'A valid answer'},checks:[],judges:[{},{}]}));
  const complete={result:{complete:true},tasks:[],outputs};
  assert.match(render(complete),/>Fail</);
  assert.doesNotMatch(render(complete),/>REVIEW</);
  assert.match(render(complete,{...comparison,candidate:{pass:false,critical:0,pending:1}}),/>REVIEW</);
  assert.match(render({...complete,result:{complete:false},tasks:[{caseId:'example',role:'candidate',status:'FAILED'}]}),/>Processing problem</);
  assert.equal(render({...complete,result:{complete:false},outputs:[]}), 'Waiting');
  assert.equal(render({...complete,result:{complete:false},outputs:outputs.slice(0,1).map(o=>({...o,judges:[]}))}), 'Waiting for checks');
  assert.match(render({...complete,result:{complete:false},outputs:[{...outputs[0],checks:[{status:'FAIL',confirmed:true}]}]}),/>Fail</);
  assert.match(render({...complete,result:{complete:false},outputs:[{...outputs[0],judges:[],modelContractFailure:{code:'MODEL_JSON_INVALID',message:'Invalid JSON'}}]}),/>Fail</);
  assert.match(render(complete,{...comparison,candidate:{pass:true,critical:0,pending:0}}),/>Pass</);
});

test('results show frozen model choices, saved instructions and the actual example set',()=>{
  const bundle={run:{id:'private-run-id',status:'COMPLETED'},snapshot:{dataset:{version:'release-demo',cases:Array.from({length:100},()=>({}))},datasetKind:'release',promptId:'private-prompt-id',prompt:'Keep every required invoice hold.',policy:{version:'invoice-rules-v1'},modelMetadata:{baseline:{displayName:'GPT-5.4 mini'},candidate:{displayName:'Gemini 2.5 Flash'},judge:{displayName:'GPT-5.4'}}},result:{decision:'BLOCK',complete:true,baseline:0.9,candidate:0.7,criticalCandidateFailures:2,pendingReviews:1,reasons:['Candidate overall pass rate is below 90%.'],categories:{},comparisons:[]},progress:{done:1800,total:1800,failed:0,running:0},evidence:{labels:false,calibration:false,release:false},outputs:[{role:'baseline',modelContractFailure:{code:'MODEL_JSON_INVALID'}},{role:'candidate',modelContractFailure:{code:'MODEL_SCHEMA_INVALID'}},{role:'candidate'}],tasks:[],artifactVerification:{mode:'saved-report',verified:true,reportGeneratedAt:'2026-11-02T10:00:00Z'}};
  const html=renderToStaticMarkup(React.createElement(compiled.exports.RunPage,{bundle,runId:bundle.run.id,busy:false,boot:{prompts:[{id:'private-prompt-id',version:'invoice-instructions-v2'}]},act:()=>{},request:()=>{}}));
  const visible=html.replace(/<[^>]*>/g,' ');
  assert.match(visible,/Current model:.*GPT-5\.4 mini/);
  assert.match(visible,/New model:.*Gemini 2\.5 Flash/);
  assert.match(visible,/AI reviewer:.*GPT-5\.4/);
  assert.match(visible,/invoice-instructions-v2/);assert.match(visible,/invoice-rules-v1/);
  assert.match(visible,/Final comparison.*100 examples.*release-demo/);
  assert.match(visible,/Keep every required invoice hold\./);assert.match(visible,/Saved report validated/);
  assert.match(visible,/all three answers pass and required human reviews are resolved; pending reviews do not count as passed/);
  assert.match(visible,/reference answers still need business approval/);
  assert.match(visible,/Received answers with invalid format: current model 1; new model 1/);
  assert.match(html,/<button(?![^>]*disabled)[^>]*>Check and save report<\/button>/);
  assert.doesNotMatch(visible,/private-run-id|private-prompt-id|APPROVED/);
});

test('a selected test shows loading instead of asking the user to choose again',()=>{
  const html=renderToStaticMarkup(React.createElement(compiled.exports.RunPage,{bundle:null,runId:'selected',loadingRun:true}));
  assert.match(html,/Loading test results/);assert.doesNotMatch(html,/Choose a test/);
});

test('completed tests keep polling until the current saved report is verified',()=>{
  assert.equal(shouldPollRun(null),false);
  for(const status of ['DRAFT','INCOMPLETE','CANCELLED'])assert.equal(shouldPollRun({run:{status}}),false);
  assert.equal(shouldPollRun({run:{status:'RUNNING'}}),true);
  assert.equal(shouldPollRun({run:{status:'COMPLETED'},artifactVerification:{verified:false,mode:'pending'}}),true);
  assert.equal(shouldPollRun({run:{status:'COMPLETED',reportId:'report'},artifactVerification:{verified:false,mode:'pending'}}),true);
  assert.equal(shouldPollRun({run:{status:'COMPLETED',reportId:'report'},artifactVerification:{verified:true,mode:'saved-report'}}),false);
  assert.equal(shouldPollRun({run:{status:'COMPLETED',reportId:'report'},artifactVerification:{verified:true,mode:'full'}}),false);
});

test('invalid model answers display the complete recorded text without a fabricated structured answer',()=>{
  const cases=[
    {value:'{\n  "reply": "Keep <hold> & investigate",\n  "unfinished":'},
    {value:{reply:{unexpected:'object'},calculations:{quantityDiscrepancy:{invalid:true}}},rawText:' { "reply" : {"unexpected":"object"}, "unfinished": true }\n',modelContractFailure:{code:'MODEL_SCHEMA_INVALID',message:'The reply must be text.'}},
    {value:null,rawText:'',modelContractFailure:{code:'MODEL_JSON_INVALID',message:'No valid answer was returned.'}}
  ];
  for(const props of cases){const html=renderToStaticMarkup(React.createElement(details.exports.ModelAnswer,props)),raw=props.rawText??props.value;
    assert.match(html,/Invalid answer format/);assert.match(html,/failed the required format check/);
    assert.equal(html.includes(renderToStaticMarkup(React.createElement('pre',{className:'prompt-text'},raw))),true);
    assert.doesNotMatch(html,/Responsible team|processing problem|This answer is not available/);
  }
});

test('investigation passes through the original malformed reply and its format finding',()=>{
  const c=generateDataset({kind:'development'}).cases[0],rawText=' { "reply" : "Original malformed reply" ';
  const bundle={snapshot:{dataset:{cases:[c]},modelMetadata:{baseline:{displayName:'baseline'},candidate:{displayName:'candidate'}}},evidence:{labels:false},outputs:[{caseId:c.id,role:'candidate',repeat:1,response:rawText,rawText,modelContractFailure:{code:'MODEL_JSON_INVALID',message:'The answer was not valid JSON.'},checks:[],judges:[]}]};
  const html=renderToStaticMarkup(React.createElement(compiled.exports.InvestigationPage,{bundle,caseId:c.id,repeat:1,setRepeat:()=>{},setCaseId:()=>{}}));
  assert.match(html,/Invalid answer format/);assert.match(html,/The answer was not valid JSON/);
  assert.equal(html.includes(renderToStaticMarkup(React.createElement('pre',{className:'prompt-text'},rawText))),true);
});
