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

test('review search matches exact displayed example numbers rather than digits inside case IDs',()=>{
  const items=[{caseId:'REL-20261428-014',caseIndex:13,category:'routine'},{caseId:'REL-20261428-041',caseIndex:40,category:'tolerance'},{caseId:'CUSTOM-014',caseIndex:1,category:'payment'}];
  assert.equal(typeof view.filterReviewExamples,'function');
  for(const query of ['14','Example 14','example14',' 014 '])assert.deepEqual(view.filterReviewExamples(items,query),[items[0]]);
  assert.deepEqual(view.filterReviewExamples(items,'41'),[items[1]]);
});

test('review search accepts case IDs and invoice categories and clears without losing items',()=>{
  const items=[{caseId:'REL-20261028-014',caseIndex:13,category:'routine'},{caseId:'DEV-20261029-016',caseIndex:15,category:'payment'}];
  assert.equal(typeof view.filterReviewExamples,'function');
  assert.deepEqual(view.filterReviewExamples(items,'rel-20261028-014'),[items[0]]);
  assert.deepEqual(view.filterReviewExamples(items,'payment'),[items[1]]);
  assert.deepEqual(view.filterReviewExamples(items,'Example 99'),[]);
  assert.deepEqual(view.filterReviewExamples(items,'  '),items);
});

test('review example labels use their own saved test order across tests',()=>{
  const bundle={run:{id:'current'},snapshot:{dataset:{cases:[{id:'A',category:'routine'},{id:'B',category:'payment'}]}}};
  assert.equal(typeof view.reviewExample,'function');
  const selected=view.reviewExample({runId:'current',caseId:'B'},bundle);
  assert.equal(selected.caseIndex,1);assert.equal(selected.category,'payment');
  const other=view.reviewExample({runId:'other',caseId:'B',caseIndex:13,category:'pressure'},bundle);
  assert.equal(other.caseIndex,13);assert.equal(other.category,'pressure');
  assert.equal(view.reviewExample({runId:'other',caseId:'A'},bundle).caseIndex,undefined);
});
test('business decisions and unresolved answer outcomes have distinct readable labels',()=>{
  assert.equal(view.stateLabel('BLOCK'),'Upgrade blocked');
  assert.equal(view.stateLabel('REVIEW'),'Needs review');
  assert.equal(view.stateLabel('NEEDS_REVIEW'),'Needs review');
  assert.equal(view.stateLabel('ELIGIBLE FOR PILOT'),'Eligible for pilot');
  assert.equal(view.stateLabel('FAIL'),'Fail');
});
