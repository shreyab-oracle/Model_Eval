import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {repository} from '../src/db/repository.mjs';
import {withConnection,closePool} from '../src/db/pool.mjs';
import {safeError} from '../src/config.mjs';
const runId=randomUUID(),taskId=randomUUID(),diagnosticRuns=[runId];
const claim=owner=>repository.claim(owner,240,{runIds:diagnosticRuns});
const settle=()=>repository.settle({runIds:diagnosticRuns});
try{
  const manifestId=await repository.saveDoc({kind:'DIAGNOSTIC',value:{purpose:'Real database task-lease/resume verification; no model outputs or calls',runId}});
  // Retest-link work has no model call and can safely exercise auto-reclaim.
  await repository.createRun({id:runId,manifestId,kind:'diagnostic',live:false,tasks:[{id:taskId,stage:'RETEST'}]});
  await repository.startRun(runId);
  const first=await claim('diagnostic-owner-one');assert.equal(first.id,taskId);
  await withConnection(async c=>{await c.execute("UPDATE AIE_TASKS SET lease_until=SYSTIMESTAMP-INTERVAL '1' SECOND WHERE id=:id",{id:taskId});await c.commit();});
  const second=await claim('diagnostic-owner-two');assert.equal(second.id,taskId);assert.equal(second.attempts,2);
  await assert.rejects(()=>repository.finish(first,{id:taskId,kind:'DIAGNOSTIC_RESULT',parentId:runId,value:{diagnostic:true}},{modelCall:false}),/lease/i);
  await repository.fail(second,Object.assign(new Error('Deliberate verification error; no provider call'),{code:'DIAGNOSTIC'}),{retry:false,delayMs:0});await settle();assert.equal((await repository.run(runId)).status,'INCOMPLETE');
  await repository.resume(runId);const resumed=await claim('diagnostic-owner-three');assert.equal(resumed.cycle,1);assert.equal(resumed.attempts,1);
  await repository.finish(resumed,{id:taskId,kind:'DIAGNOSTIC_RESULT',parentId:runId,value:{diagnostic:true,modelCall:false}},{modelCall:false});await settle();assert.equal((await repository.run(runId)).status,'COMPLETED');
  // A connection can fail after a successful commit. Recording that uncertainty
  // must not overwrite the already committed DONE task/attempt with FAILED.
  await repository.fail(resumed,Object.assign(new Error('Simulated post-commit reset'),{code:'ECONNRESET'}),{retry:false,delayMs:0});
  assert.equal((await repository.attempts(runId)).find(a=>a.id===resumed.attemptId).status,'DONE');
  const tasks=await repository.tasks(runId);assert.equal(tasks[0].status,'DONE');const attempts=await repository.attempts(runId);assert.ok(attempts.some(a=>a.status==='UNCERTAIN'));
  for(const cancelBeforeStart of [true,false]){
    const parentId=randomUUID(),childId=randomUUID(),id=randomUUID();diagnosticRuns.push(parentId,childId);
    await repository.createRun({id:parentId,manifestId,kind:'diagnostic',live:false,tasks:[{id,stage:'DIAGNOSTIC'}]});
    await repository.createRun({id:childId,manifestId,kind:'diagnostic',live:false,tasks:[]});
    const proposalId=await repository.saveDoc({kind:'DIAGNOSTIC',parentId,value:{diagnostic:true}});
    await repository.startRun(parentId);const parentTask=await claim('diagnostic-retest-owner');assert.equal(parentTask.runId,parentId);
    const link={id,kind:'RETEST_LINK',parentId:proposalId,value:{runId:childId,diagnostic:true}};
    if(cancelBeforeStart){await repository.cancel(parentId);await assert.rejects(()=>repository.finish(parentTask,link,{modelCall:false},{startChildRun:childId}),/cancelled|lease/i);assert.equal((await repository.run(childId)).status,'DRAFT');await repository.cancel(childId);}
    else{await repository.finish(parentTask,link,{modelCall:false},{startChildRun:childId});assert.equal((await repository.run(childId)).status,'RUNNING');await repository.cancel(parentId);assert.equal((await repository.run(childId)).status,'CANCELLED');}
  }
  const promptRunId=randomUUID(),promptTaskId=randomUUID();diagnosticRuns.push(promptRunId);
  await repository.createRun({id:promptRunId,manifestId,kind:'diagnostic',live:false,tasks:[{id:promptTaskId,stage:'PROPOSE'}]});await repository.startRun(promptRunId);
  const interruptedSearch=await claim('diagnostic-search-owner');assert.equal(interruptedSearch.id,promptTaskId);
  await withConnection(async c=>{await c.execute("UPDATE AIE_TASKS SET lease_until=SYSTIMESTAMP-INTERVAL '1' SECOND WHERE id=:id",{id:promptTaskId});await c.commit();});
  assert.equal(await claim('must-not-auto-reclaim-search'),null);
  await settle();assert.equal((await repository.run(promptRunId)).status,'INCOMPLETE');
  assert.equal((await repository.attempts(promptRunId))[0].status,'UNCERTAIN');
  await repository.resume(promptRunId);const resumedSearch=await claim('explicitly-resumed-search');assert.equal(resumedSearch.cycle,1);
  await repository.finish(resumedSearch,{id:promptTaskId,kind:'DIAGNOSTIC_RESULT',parentId:promptRunId,value:{diagnostic:true,modelCall:false}},{modelCall:false});await settle();
  console.log(JSON.stringify({ok:true,runId,nonEvaluationDiagnostic:true,staleCompletionRejected:true,interruptedAttemptRecorded:true,resumeVerified:true,attemptCount:attempts.length,cancelBeforeRetestBlocked:true,cancelAfterStartPropagated:true,searchAutoReclaimBlocked:true,searchExplicitResumeVerified:true,modelCalls:0}));
}catch(e){await Promise.allSettled(diagnosticRuns.map(id=>repository.cancel(id)));console.error(JSON.stringify(safeError(e)));process.exitCode=1;}finally{await closePool();}
