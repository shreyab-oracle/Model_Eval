import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {repository} from '../db/repository.mjs';
import {config,safeError} from '../config.mjs';
import {closePool} from '../db/pool.mjs';
import {modelInput} from '../domain/policy.mjs';
import {parseJSON} from '../domain/checks.mjs';
import {assertFrozenEngine} from '../domain/version.mjs';
import {judgeInput,validateJudge} from '../domain/judge.mjs';
import {chat,chatBody} from '../oracle/genai.mjs';
import {digest} from '../domain/policy.mjs';
import {putJSON,getJSON} from '../oracle/storage.mjs';
import {retryDisposition} from './task-policy.mjs';
import {writeReport} from './runs.mjs';
import {createRetest} from './prompts.mjs';
import {optimizePrompt} from '../optimization/engine.mjs';
import {createAwakeGuard} from './awake.mjs';
import {settingsForRole} from '../domain/model-settings.mjs';
import {observeModelAnswer} from './model-answer.mjs';
import {responseJournal} from './response-journal.mjs';
import {assertExecutionProtocol} from './execution-protocol.mjs';

const log=(event,details)=>console.error(JSON.stringify({at:new Date().toISOString(),event,...details}));
export function parseJudgeAssessment(text,response){
  try{return validateJudge(parseJSON(text),response);}
  catch(error){throw Object.assign(error,{code:'INVALID_JUDGE_ASSESSMENT'});}
}
export function responseRetryDisposition(task,error,{received=false,persistedTrace=false}={}){
  if(task.stage==='PROPOSE'||(received&&(!persistedTrace||error.code!=='INVALID_JUDGE_ASSESSMENT')))return{retry:false,delayMs:0};
  return retryDisposition(error,task.attempts,task.stage);
}

async function processTask(task){
  let alive=true,response,trace,receipt,requestBody,endpoint,heartbeatError,heartbeatBusy=false;
  const controller=new AbortController();
  const heartbeat=setInterval(async()=>{
    if(heartbeatBusy||!alive)return;heartbeatBusy=true;
    try{if(!await repository.heartbeat(task)){alive=false;controller.abort();}}
    catch(error){heartbeatError=error;alive=false;controller.abort();log('lease-heartbeat-failed',{taskId:task.id,error:safeError(error)});}
    finally{heartbeatBusy=false;}
  },30000);heartbeat.unref();
  const started=performance.now();
  try{
    const run=await repository.run(task.runId),manifest=await repository.doc(run.manifestId),snapshot=await getJSON(manifest.artifact);
    const source=task.stage==='PROPOSE'||task.stage==='RETEST'?snapshot.source:snapshot;assertFrozenEngine(source);assertExecutionProtocol(source);
    if(task.stage==='PROPOSE'){
      if(snapshot.optimizer?.name!=='GEPA')throw new Error('Unsupported prompt optimizer; create a GEPA improvement job');
      const value=await optimizePrompt(snapshot,task,{isAlive:()=>alive&&!stopping,signal:controller.signal});
      await repository.finish(task,{id:task.id,kind:'PROPOSAL',parentId:task.runId,value},{latencyMs:Math.round(performance.now()-started),callAttempts:value.callAttempts,trace:value.artifact});return;
    }
    if(task.stage==='RETEST'){
      const proposal=await repository.doc(task.payload.proposalId);if(!proposal)throw new Error('Proposal missing');
      if(proposal.changed===false){await repository.finish(task,{id:task.id,kind:'RETEST_LINK',parentId:proposal.id,value:{skipped:true,reason:'No acceptable prompt improvement; original prompt retained.'}},{modelCall:false});return;}
      const link=await createRetest(snapshot,proposal,task.runId);if(!alive)throw Object.assign(new Error('Worker lease lost'),{code:'LEASE_LOST'});
      await repository.finish(task,{id:task.id,kind:'RETEST_LINK',parentId:proposal.id,value:link},{latencyMs:Math.round(performance.now()-started),modelCall:false},{startChildRun:link.runId});return;
    }
    let messages,modelId,mode,settings,kind,value;
    const c=snapshot.dataset.cases.find(c=>c.id===task.caseId);if(!c)throw new Error('Frozen case missing');
    if(task.stage==='GENERATE'){messages=modelInput(c,snapshot.prompt,snapshot.policy);modelId=snapshot.models[task.role];mode=snapshot.modes[task.role];settings=settingsForRole(snapshot,task.role);kind='OUTPUT';}
    else if(task.stage==='JUDGE'){const output=await repository.doc(task.payload.outputId);if(!output)throw new Error('Tested model output missing');messages=judgeInput(c,output.response,task.assessment,snapshot.policy,snapshot.judgeTemplates);modelId=snapshot.models.judge;mode=snapshot.modes.judge;settings=settingsForRole(snapshot,'judge');kind='JUDGE';}
    else throw new Error(`Unknown task stage: ${task.stage}`);
    requestBody=chatBody({modelId,mode,messages,settings,compartmentId:source.compartmentId});endpoint=source.genaiEndpoint;
    response=await chat({modelId,mode,messages,settings,compartmentId:source.compartmentId,endpoint:source.genaiEndpoint});
    const received={taskId:task.id,attemptId:task.attemptId,stage:task.stage,modelId,endpoint,requestBody,requestDigest:digest(requestBody),requestId:response.requestId,latencyMs:response.latencyMs,usage:response.usage,raw:response.raw};
    // The receipt reaches disk before storage-name allocation or any database work.
    receipt=await responseJournal.persistResponse(task,received);
    trace=await putJSON('traces',task.attemptId,received);
    if(kind==='OUTPUT')value={caseId:task.caseId,role:task.role,repeat:task.repeat,...observeModelAnswer(c,response.text)};
    else{const output=await repository.doc(task.payload.outputId);value={outputId:task.payload.outputId,assessment:task.assessment,caseId:task.caseId,role:task.role,repeat:task.repeat,assessmentResult:parseJudgeAssessment(response.text,output.response)};}
    if(!alive)throw Object.assign(new Error('Worker lease lost while request was in flight'),{code:'LEASE_LOST'});
    await repository.finish(task,{id:task.id,kind,parentId:task.runId,value:{...value,trace,latencyMs:response.latencyMs,usage:response.usage,requestId:response.requestId}},{latencyMs:response.latencyMs,usage:response.usage,requestId:response.requestId,trace});
    await responseJournal.clear(task.attemptId,{remoteCommitted:true,expectedDigest:receipt.digest}).catch(error=>log('receipt-cleanup-failed',{taskId:task.id,error:safeError(error)}));
  }catch(error){
    // Preserve the database/network cause instead of replacing it with the
    // secondary GEPA subprocess-cancelled symptom after a lost heartbeat.
    error=heartbeatError||error;
    if(!trace&&requestBody)try{trace=await putJSON('error-traces',task.attemptId,{taskId:task.id,attemptId:task.attemptId,requestBody,requestDigest:digest(requestBody),endpoint,raw:response?.raw||error.raw||null,latencyMs:Math.round(performance.now()-started),error:safeError(error)});}catch{}
    // A received answer is replayed from evidence; it must never trigger another
    // model call because its database or storage commit was interrupted.
    const retry=responseRetryDisposition(task,error,{received:!!response,persistedTrace:!!trace});
    const recorded=await repository.fail(task,error,retry,trace).then(()=>true).catch(e=>{log('attempt-persistence-failed',{taskId:task.id,error:safeError(e)});return false;});
    if(recorded&&trace&&receipt&&error.code==='INVALID_JUDGE_ASSESSMENT')await responseJournal.clear(task.attemptId,{remoteCommitted:true,expectedDigest:receipt.digest}).catch(e=>log('receipt-cleanup-failed',{taskId:task.id,error:safeError(e)}));
    log('task-failed',{taskId:task.id,error:safeError(error)});
  }finally{clearInterval(heartbeat);}
}
let stopping=false;
function stopWorker(){stopping=true;}
export async function workerLoop({once=false,reports=true}={}){
  const owner=randomUUID(),inflight=new Set(),awake=createAwakeGuard({onError:error=>log('sleep-prevention-unavailable',{error:safeError(error)})});
  try{
  do{
    try{
      await repository.settle();
      const runs=await repository.runs();awake.setActive(inflight.size>0||runs.some(r=>r.status==='RUNNING'));
      if(reports)for(const run of runs.filter(r=>r.status==='COMPLETED'&&r.kind!=='improvement'&&!r.reportId))await writeReport(run.id).catch(e=>log('report-failed',{runId:run.id,error:safeError(e)}));
      while(!stopping&&inflight.size<config.concurrency){const task=await repository.claim(owner,config.leaseSeconds);if(!task)break;awake.setActive(true);const p=processTask(task).finally(()=>inflight.delete(p));inflight.add(p);}
      if(once){await Promise.all(inflight);await repository.settle();return;}
    }catch(e){if(!inflight.size)awake.setActive(false);log('worker-error',{error:safeError(e)});}
    await Promise.race([new Promise(r=>setTimeout(r,1500)),...inflight]);
  }while(!stopping);
  await Promise.all(inflight);
  }finally{awake.setActive(false);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stopWorker);
  await workerLoop({reports:!process.argv.includes('--no-reports')});await closePool();
}
