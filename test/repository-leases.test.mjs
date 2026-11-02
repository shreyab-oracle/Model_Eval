import test from 'node:test';
import assert from 'node:assert/strict';
import {repository} from '../src/db/repository.mjs';
import {getDriver,closePool} from '../src/db/pool.mjs';

// All database operations below use an in-memory driver; no connection is made.
Object.assign(process.env,{DB_USER:'unit-user',DB_PASSWORD:'unit-password',DB_CONNECT_STRING:'unit-only',DB_WALLET_DIR:'.',DB_WALLET_PASSWORD:'unit-wallet'});
const now=Date.now();
const task=(id,stage,status='RUNNING',extra={})=>({ID:id,RUN_ID:'run',STAGE:stage,CASE_ID:'case',MODEL_ROLE:'candidate',REPETITION:0,ASSESSMENT:null,DEPENDS_ON:null,PAYLOAD:'{}',STATUS:status,OWNER:'old-worker',LEASE_UNTIL:new Date(now-1000),ATTEMPTS:1,RETRY_CYCLE:0,ERROR:null,...extra});
function stageMatches(sql,stage){
  const list=sql.match(/\bstage\s+(NOT IN|IN)\s*\(([^)]+)\)/i);
  if(list){const includes=[...list[2].matchAll(/'([^']+)'/g)].some(match=>match[1]===stage);return list[1].toUpperCase()==='IN'?includes:!includes;}
  const single=sql.match(/\bstage\s*(<>|=)\s*'([^']+)'/i);
  return !single||(single[1]==='='?stage===single[2]:stage!==single[2]);
}
function fixture(tasks){
  const state={run:{STATUS:'RUNNING'},tasks:structuredClone(tasks),attempts:tasks.filter(t=>t.STATUS==='RUNNING').map(t=>({ID:`attempt-${t.ID}`,TASK_ID:t.ID,STATUS:'RUNNING',RESULT:JSON.stringify({trace:{key:`original-${t.ID}`,digest:'original-digest'}})}))};
  const calls=[];let commits=0,rollbacks=0;
  const expired=t=>t.STATUS==='RUNNING'&&new Date(t.LEASE_UNTIL).getTime()<now;
  const dependencyDone=t=>!t.DEPENDS_ON||state.tasks.some(d=>d.ID===t.DEPENDS_ON&&d.STATUS==='DONE');
  const connection={
    async execute(sql,binds={}){
      calls.push({sql,binds:structuredClone(binds)});
      if(sql.startsWith('SELECT t.*')){
        const candidates=state.run.STATUS==='RUNNING'?state.tasks.filter(t=>(t.STATUS==='PENDING'||expired(t)&&stageMatches(sql,t.STAGE))&&dependencyDone(t)&&t.ATTEMPTS<3):[];
        let read=false;return{resultSet:{async getRow(){if(read)return undefined;read=true;return candidates[0]&&structuredClone(candidates[0]);},async close(){}}};
      }
      if(sql.startsWith("UPDATE AIE_ATTEMPTS SET status='UNCERTAIN'")){
        const ids=sql.includes('task_id IN')?state.tasks.filter(t=>expired(t)&&stageMatches(sql,t.STAGE)).map(t=>t.ID):[binds.id];
        for(const attempt of state.attempts)if(attempt.STATUS==='RUNNING'&&ids.includes(attempt.TASK_ID))attempt.STATUS='UNCERTAIN';
        return{rowsAffected:1};
      }
      if(sql.startsWith("UPDATE AIE_TASKS SET status='RUNNING'")){
        const selected=state.tasks.find(t=>t.ID===binds.id);selected.STATUS='RUNNING';selected.OWNER=binds.owner;selected.ATTEMPTS++;selected.LEASE_UNTIL=new Date(now+binds.seconds*1000);return{rowsAffected:1};
      }
      if(sql.startsWith('INSERT INTO AIE_ATTEMPTS')){state.attempts.push({ID:binds.id,TASK_ID:binds.task,STATUS:'RUNNING'});return{rowsAffected:1};}
      if(sql.startsWith("UPDATE AIE_TASKS SET status='FAILED'")){
        const selected=state.tasks.filter(t=>expired(t)&&stageMatches(sql,t.STAGE)&&(!sql.includes('attempts>=3')||t.ATTEMPTS>=3));
        for(const selectedTask of selected){selectedTask.STATUS='FAILED';selectedTask.OWNER=null;selectedTask.LEASE_UNTIL=null;selectedTask.ERROR=binds.e;}
        return{rowsAffected:selected.length};
      }
      if(sql.startsWith("UPDATE AIE_RUNS r SET status='COMPLETED'")){if(state.tasks.every(t=>t.STATUS==='DONE'))state.run.STATUS='COMPLETED';return{rowsAffected:1};}
      if(sql.startsWith("UPDATE AIE_RUNS r SET status='INCOMPLETE'")){
        if(state.run.STATUS==='RUNNING'&&state.tasks.some(t=>t.STATUS==='FAILED')&&!state.tasks.some(t=>t.STATUS==='RUNNING'||t.STATUS==='PENDING'&&dependencyDone(t)))state.run.STATUS='INCOMPLETE';
        return{rowsAffected:1};
      }
      throw new Error(`Unexpected lease-test SQL: ${sql}`);
    },
    async commit(){commits++;},async rollback(){rollbacks++;},async close(){}
  };
  return{state,calls,connection,get commits(){return commits;},get rollbacks(){return rollbacks;}};
}
async function withDatabase(f,work){
  const driver=getDriver(),original=driver.createPool;
  driver.createPool=async()=>({getConnection:async()=>f.connection,close:async()=>{}});
  try{return await work();}finally{await closePool();driver.createPool=original;}
}

test('an expired generation cannot block claiming a different pending answer',async()=>{
  const expired=task('expired-generation','GENERATE'),pending=task('pending-generation','GENERATE','PENDING',{ATTEMPTS:0});
  const f=fixture([expired,pending]),original=structuredClone(f.state.attempts[0]);
  await withDatabase(f,async()=>{const claimed=await repository.claim('new-worker');assert.equal(claimed.id,pending.ID);assert.equal(claimed.attempts,1);});
  assert.deepEqual(f.state.tasks[0],expired);assert.deepEqual(f.state.attempts[0],original);assert.equal(f.state.attempts.length,2);
});

for(const stage of ['GENERATE','JUDGE'])test(`an expired ${stage} is never claimed again even before settlement`,async()=>{
  const f=fixture([task('expired-model',stage)]);
  await withDatabase(f,async()=>assert.equal(await repository.claim('new-worker'),null));
  assert.equal(f.commits,0);assert.equal(f.rollbacks,1);assert.equal(f.state.attempts.length,1);assert.equal(f.state.tasks[0].ATTEMPTS,1);
});

test('an expired retest remains reclaimable without reclaiming earlier model requests',async()=>{
  const f=fixture([task('expired-generation','GENERATE'),task('expired-judge','JUDGE'),task('expired-retest','RETEST')]);
  await withDatabase(f,async()=>assert.equal((await repository.claim('new-worker')).id,'expired-retest'));
  assert.equal(f.state.attempts.find(a=>a.TASK_ID==='expired-generation').STATUS,'RUNNING');
  assert.equal(f.state.attempts.find(a=>a.TASK_ID==='expired-judge').STATUS,'RUNNING');
  assert.equal(f.state.attempts.find(a=>a.ID==='attempt-expired-retest').STATUS,'UNCERTAIN');assert.equal(f.state.tasks[2].ATTEMPTS,2);
});

for(const stage of ['GENERATE','JUDGE'])test(`settlement records uncertain ${stage} evidence and requires reconciliation`,async()=>{
  const f=fixture([task('expired-model',stage)]),originalResult=f.state.attempts[0].RESULT;
  await withDatabase(f,async()=>{await repository.settle();assert.equal(await repository.claim('new-worker'),null);});
  assert.equal(f.state.attempts.length,1);assert.equal(f.state.attempts[0].STATUS,'UNCERTAIN');assert.equal(f.state.attempts[0].RESULT,originalResult);
  assert.equal(f.state.tasks[0].STATUS,'FAILED');assert.equal(f.state.tasks[0].ATTEMPTS,1);assert.equal(JSON.parse(f.state.tasks[0].ERROR).code,'EVALUATION_OUTCOME_UNCERTAIN');assert.equal(f.state.run.STATUS,'INCOMPLETE');
});

test('settlement leaves live calls intact and protects expired judge and proposal outcomes',async()=>{
  const live=task('live-generation','GENERATE','RUNNING',{LEASE_UNTIL:new Date(now+60000)});
  const f=fixture([live,task('expired-judge','JUDGE'),task('expired-proposal','PROPOSE')]);
  await withDatabase(f,()=>repository.settle());
  assert.deepEqual(f.state.tasks[0],live);assert.equal(f.state.tasks[1].STATUS,'FAILED');assert.equal(f.state.attempts[1].STATUS,'UNCERTAIN');assert.equal(JSON.parse(f.state.tasks[1].ERROR).code,'EVALUATION_OUTCOME_UNCERTAIN');
  assert.equal(f.state.tasks[2].STATUS,'FAILED');assert.equal(JSON.parse(f.state.tasks[2].ERROR).code,'GEPA_INTERRUPTED');assert.equal(f.state.attempts[2].STATUS,'UNCERTAIN');
});
