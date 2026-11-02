import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const bridge=await import('../src/optimization/bridge.mjs').catch(()=>({}));
const python=bridge.pythonPath?.()||process.env.GEPA_PYTHON||'.local/gepa-venv/Scripts/python.exe';
test('actual GEPA package searches through the private adapter without a model provider',{skip:!fs.existsSync(python)},async()=>{
  assert.equal(typeof bridge.runGepa,'function');let evaluated=0,proposed=0;
  const result=await bridge.runGepa({prompt:'seed',trainIds:['a','b'],validationIds:['c','d'],limits:{maxCaseEvaluations:24,maxProposals:1}},async request=>{
    if(request.operation==='propose'){proposed++;return{text:'revised'};}
    evaluated+=request.caseIds.length;
    return{rows:request.caseIds.map(caseId=>({caseId,pass:request.text==='revised',feedback:'software-test feedback only'}))};
  },{python,timeoutMs:20000});
  assert.equal(result.version,'0.1.4');assert.ok(evaluated>0);assert.equal(proposed,1);assert.ok(result.candidates.some(c=>c.system_prompt==='revised'));assert.ok(evaluated<=24);
});
test('missing Python produces a real dependency error without fallback',async()=>{
  assert.equal(typeof bridge.runGepa,'function');await assert.rejects(()=>bridge.runGepa({},async()=>{}, {python:'missing-gepa-python-executable',timeoutMs:1000}),/ENOENT|Python/i);
});
