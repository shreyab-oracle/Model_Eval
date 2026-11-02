import {AXES,judgePass,judgesDisagree} from './judge.mjs';
const failed=c=>c.status!=='PASS';
export function assessOutput(o,reviews=[]) {
  const review=reviews.filter(r=>r.outputId===o.id).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')).at(-1);
  const failures=(o.checks||[]).filter(failed),critical=failures.some(f=>f.severity==='critical'&&f.confirmed)||reviews.some(r=>r.outputId===o.id&&r.resolution==='CONFIRM_CRITICAL');
  const flagged=failures.some(f=>f.severity==='critical'&&!f.confirmed)||(o.judges||[]).some(j=>j.critical);
  const disagreement=judgesDisagree(o.judges||[]);
  const adjudicated=review?.resolution==='ACCEPT_OUTPUT'||review?.resolution==='REJECT_OUTPUT';
  const pending=(flagged||disagreement)&&!review;
  // Human acceptance can adjudicate judge/prose ambiguity, never deterministic financial facts.
  const factualFailures=failures.filter(f=>f.confirmed);
  const pass=!o.error&&!!o.response&&o.judges?.length===2&&!critical&&!pending&&!factualFailures.length&&(adjudicated?review.resolution==='ACCEPT_OUTPUT':o.judges.every(judgePass))&&!flagged;
  const acceptedAmbiguity=review?.resolution==='ACCEPT_OUTPUT'&&!critical&&!o.error&&!factualFailures.length&&o.judges?.length===2;
  return{pass:pass||acceptedAmbiguity,critical,pending,disagreement,flagged};
}
export function decideRun(run,cases,outputs,reviews=[],evidence={}) {
  const reasons=[],comparisons=[];let complete=cases.length>0&&run.status==='COMPLETED';
  const keys=new Set();
  for(const o of outputs){const key=`${o.caseId}/${o.role}/${o.repeat}`;if(keys.has(key))complete=false;keys.add(key);}
  for(const c of cases){const result={id:c.id,category:c.category};for(const role of ['baseline','candidate']){
    const rows=outputs.filter(o=>o.caseId===c.id&&o.role===role);const full=rows.length===3&&[0,1,2].every(n=>rows.some(o=>o.repeat===n))&&rows.every(o=>o.response&&!o.error&&o.judges?.length===2&&[0,1].every(slot=>o.judges.some(j=>j.assessment===slot))&&o.judges.every(j=>typeof j.critical==='boolean'&&AXES.every(a=>Number.isInteger(j.scores?.[a])&&j.scores[a]>=0&&j.scores[a]<=3))&&Array.isArray(o.checks));
    if(!full)complete=false;const a=rows.map(o=>assessOutput(o,reviews));result[role]={pass:full&&a.every(x=>x.pass),critical:a.filter(x=>x.critical).length,pending:a.filter(x=>x.pending).length};
  }result.change=result.baseline.pass&&!result.candidate.pass?'REGRESSION':!result.baseline.pass&&result.candidate.pass?'IMPROVEMENT':'UNCHANGED';comparisons.push(result);}
  if(outputs.length!==cases.length*6)complete=false;
  if(!complete)for(const c of comparisons)c.change='PENDING';
  const categories=Object.fromEntries([...new Set(cases.map(c=>c.category))].map(category=>{const rows=comparisons.filter(c=>c.category===category);return[category,{total:rows.length,baseline:rows.filter(c=>c.baseline.pass).length/rows.length,candidate:rows.filter(c=>c.candidate.pass).length/rows.length}];}));
  const total=cases.length,baseline=total?comparisons.filter(c=>c.baseline.pass).length/total:0,candidate=total?comparisons.filter(c=>c.candidate.pass).length/total:0;
  const critical=comparisons.reduce((n,c)=>n+c.candidate.critical,0),pending=comparisons.reduce((n,c)=>n+c.baseline.pending+c.candidate.pending,0);
  if(!complete)reasons.push('Incomplete run: every case requires three outputs per model, all checks and two valid judge assessments.');
  if(!run.live)reasons.push('Only live OCI evaluations may qualify.');
  if(!run.artifactsVerified)reasons.push('Frozen dataset, manifest, traces and report artifacts are not fully verified.');
  if(critical)reasons.push(`${critical} confirmed critical candidate failure(s).`);
  if(complete&&candidate<0.9)reasons.push('Candidate overall pass rate is below 90%.');
  if(complete)for(const [name,c] of Object.entries(categories)){if(c.candidate<0.9)reasons.push(`${name}: candidate pass rate is below 90%.`);if(c.candidate<c.baseline)reasons.push(`${name}: category regression against baseline.`);}
  if(pending)reasons.push(`${pending} critical findings or judge disagreements require human review.`);
  if(run.datasetKind!=='release')reasons.push('Development results cannot establish release eligibility.');
  for(const type of ['labels','calibration','release'])if(!evidence[type])reasons.push(`${type} evidence approval is pending.`);
  const numericFailure=critical>0||candidate<0.9||Object.values(categories).some(c=>c.candidate<0.9||c.candidate<c.baseline);
  const decision=!complete||!run.live||!run.artifactsVerified?'REVIEW':numericFailure?'BLOCK':reasons.length?'REVIEW':'ELIGIBLE FOR PILOT';
  return{decision,reasons,complete,total,baseline,candidate,categories,criticalCandidateFailures:critical,pendingReviews:pending,comparisons};
}
