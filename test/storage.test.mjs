import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../src/domain/policy.mjs';
import {createStorage} from '../src/oracle/storage.mjs';

// Only the external HTTP and database boundaries are replaced. All naming,
// relocation, content verification and fallback behavior use production code.
function fixture(){
  const storage={region:'ap-hyderabad-1',namespace:'example',bucket:'existing',prefix:'app/'};
  const objects=new Map(),records=new Map(),requests=[];let number=0,renameFailure;
  const missing=()=>Object.assign(new Error('Missing object'),{statusCode:404});
  const locations={
    async find(sourceKey){return records.get(sourceKey)||null;},
    async reserve(sourceKey,contentDigest,makeKey){
      if(records.has(sourceKey))return records.get(sourceKey);
      const entry={sourceKey,contentDigest,key:makeKey(++number)};records.set(sourceKey,entry);return entry;
    }
  };
  const request=async(method,url,options={})=>{
    const u=new URL(url),key=decodeURIComponent(u.pathname.split('/o/')[1]||'');requests.push({method,key,...options});
    if(method==='GET'){
      if(!objects.has(key))throw missing();return{data:structuredClone(objects.get(key)),headers:{etag:'source-etag'}};
    }
    if(method==='PUT'){
      assert.equal(options.headers['if-none-match'],'*');
      if(objects.has(key))throw Object.assign(new Error('Already exists'),{statusCode:412});
      objects.set(key,JSON.parse(options.body));return{headers:{etag:'written-etag'}};
    }
    if(method==='POST'){
      const b=options.body;assert.equal(u.pathname,'/n/example/b/existing/actions/renameObject');
      assert.equal(b.srcObjIfMatchETag,'source-etag');assert.equal(b.newObjIfNoneMatchETag,'*');
      if(renameFailure)throw renameFailure;
      if(objects.has(b.newName))throw Object.assign(new Error('Destination exists'),{statusCode:412});
      if(!objects.has(b.sourceName))throw missing();
      assert.ok(records.has(b.sourceName),'persist reference before moving');
      objects.set(b.newName,objects.get(b.sourceName));objects.delete(b.sourceName);return{headers:{}};
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  return{api:createStorage({storage,request,locations}),objects,records,requests,setRenameFailure:error=>{renameFailure=error;}};
}

test('new datasets have readable names, reuse the same file and retain their fingerprint',async()=>{
  const f=fixture(),data={kind:'release',version:'release-v1',cases:[{}]},hash=digest(data);
  const a=await f.api.putJSON('datasets',hash,data),b=await f.api.putJSON('datasets',hash,data);
  assert.equal(a.key,'app/invoice-examples/final-test-v1-1-cases-file-1.json');assert.equal(b.key,a.key);
  assert.equal(a.digest,hash);assert.deepEqual(await f.api.getJSON(a),data);assert.equal(f.objects.size,1);
});

test('renaming preserves old saved references without copying or editing the evidence',async()=>{
  const f=fixture(),data={taskId:'task',raw:{answer:'retain hold'}},hash=digest(data),key=`app/traces/attempt/${hash}.json`;
  f.objects.set(key,data);const before=digest(data);
  const moved=await f.api.renameLegacyObject({name:key});
  assert.equal(moved.key,'app/model-conversations/conversation-1.json');
  assert.equal(f.objects.has(key),false);assert.equal(f.objects.size,1);
  assert.equal(digest(f.objects.get(moved.key)),before);assert.deepEqual(await f.api.getJSON({key,digest:hash}),data);
  assert.equal((await f.api.renameLegacyObject({name:key})).key,moved.key);
});

test('a refused rename leaves the original usable and can resume with the reserved name',async()=>{
  const f=fixture(),data={value:1},hash=digest(data),key=`app/reports/run/${hash}.json`;f.objects.set(key,data);
  f.setRenameFailure(Object.assign(new Error('Not authorized'),{statusCode:403}));
  await assert.rejects(()=>f.api.renameLegacyObject({name:key}),/Not authorized/);
  assert.deepEqual(await f.api.getJSON({key,digest:hash}),data);assert.equal(f.objects.size,1);
  f.setRenameFailure(null);const moved=await f.api.renameLegacyObject({name:key});assert.equal(moved.key,'app/test-reports/report-1.json');
});

test('a name map cannot hide corrupt content or point outside the application folder',async()=>{
  const f=fixture(),key='app/traces/old.json',hash=digest({correct:true});
  f.records.set(key,{sourceKey:key,key:'app/model-conversations/conversation-1.json',contentDigest:hash});
  f.objects.set('app/model-conversations/conversation-1.json',{correct:false});
  await assert.rejects(()=>f.api.getJSON({key,digest:hash}),/digest mismatch/i);
  f.records.set(key,{sourceKey:key,key:'other-project/answer.json',contentDigest:hash});
  await assert.rejects(()=>f.api.getJSON({key,digest:hash}),/outside/i);
  await assert.rejects(()=>f.api.renameLegacyObject({name:'other-project/file.json'}),/outside/i);
});

test('corrupt original evidence is never renamed and a destination is never overwritten',async()=>{
  const f=fixture(),hash=digest({correct:true}),key=`app/traces/attempt/${hash}.json`;f.objects.set(key,{correct:false});
  await assert.rejects(()=>f.api.renameLegacyObject({name:key}),/digest mismatch/i);assert.equal(f.records.size,0);
  const g=fixture(),data={correct:true};g.objects.set(key,data);g.objects.set('app/model-conversations/conversation-1.json',{unrelated:true});
  await assert.rejects(()=>g.api.renameLegacyObject({name:key}),/Destination exists/);
  assert.deepEqual(g.objects.get(key),data);assert.deepEqual(g.objects.get('app/model-conversations/conversation-1.json'),{unrelated:true});
  assert.deepEqual(await g.api.getJSON({key,digest:hash}),data,'a refused move must not redirect away from the valid original');
});

test('distinct content receives distinct numbered names and storage outages are not hidden',async()=>{
  const f=fixture(),a=await f.api.putJSON('traces','one',{answer:1}),b=await f.api.putJSON('traces','two',{answer:2});
  assert.notEqual(a.key,b.key);assert.equal(f.objects.size,2);
  const api=createStorage({storage:{region:'r',namespace:'n',bucket:'b',prefix:'app/'},request:async()=>{throw Object.assign(new Error('Reset'),{code:'ECONNRESET'});},locations:{find:async()=>{throw new Error('Must not mask transport error');}}});
  await assert.rejects(()=>api.getJSON({key:'app/old.json',digest:digest({})}),e=>e.code==='ECONNRESET');
});
