import test from 'node:test';
import assert from 'node:assert/strict';
const view=await import('../frontend/presentation.mjs').catch(()=>({}));
test('user-facing labels explain purpose without showing technical identifiers',()=>{
  assert.equal(typeof view.testLabel,'function');
  assert.match(view.testLabel({kind:'development',createdAt:'2026-11-01T08:00:00Z'}),/Practice test/);
  assert.doesNotMatch(view.testLabel({id:'internal-id',kind:'release',createdAt:'2026-11-01T08:00:00Z'}),/internal-id/);
  assert.equal(view.modelName('openai.gpt-5.4-mini'),'GPT-5.4 mini');
  assert.equal(view.modelName('google.gemini-2.5-flash'),'Gemini 2.5 Flash');
  assert.equal(view.modelName('ocid1.generativeaimodel.oc1.region.identifier'),'Configured model');
});
test('error presentation preserves the reason while removing resource identifiers',()=>{
  assert.equal(typeof view.readable,'function');
  const message=view.readable('OCI request failed: access denied for ocid1.generativeaimodel.oc1.region.identifier');
  assert.match(message,/access denied/);assert.doesNotMatch(message,/OCI|ocid1/);
});
test('outdated reports cannot be downloaded as the current result',()=>{
  assert.equal(typeof view.currentReport,'function');
  assert.throws(()=>view.currentReport({current:false,report:{decision:'ELIGIBLE FOR PILOT'}}),/out of date/i);
  const report={decision:'REVIEW'};assert.equal(view.currentReport({current:true,report}),report);
});
