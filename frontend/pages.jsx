import React,{useState,useEffect} from 'react';
import {Badge,Button,Card,Field,Empty,Metric,percent,when} from './components.jsx';
import {categories,purpose,testLabel,modelName,promptLabel,caseLabel,roleLabel,readable,currentReport,stateLabel} from './presentation.mjs';
import {CaseFacts,ModelAnswer,RuleChecks,JudgeEvidence} from './case-details.jsx';
import {OptimizationPanel} from './optimization.jsx';
export {HistoryPage,HistoryList} from './history.jsx';

function WorkflowSteps({active=1}){
  return <div className="steps" aria-label="Evaluation workflow">{['Choose configuration','Run evaluation','Inspect results','Review or improve','Retest'].map((label,index)=><span key={label} aria-current={active===index+1?'step':undefined}>{index+1}. {label}</span>)}</div>;
}

export function ResultSummary({result,historical=false}){
  if(!result.outcomes?.baseline||!result.outcomes?.candidate)return <Card title="Original saved case pass rate"><div className="metrics">{['baseline','candidate'].map(role=><Metric key={role} label={roleLabel(role)} value={result.complete?percent(result[role]):'Waiting for results'}/>)}</div><p>Response outcomes and review coverage were not recorded under the current review policy. These original saved statistics have not been recalculated.</p><p>Original saved critical-failure count: {result.criticalCandidateFailures??'Not recorded'}. Original pending review count: {result.pendingReviews??'Not recorded'}.</p></Card>;
  const critical=result.criticalFindings;
  return <><div className="two-column">{['baseline','candidate'].map(role=>{
    const {responses,cases,reviews}=result.outcomes[role];
    return <Card key={role} title={roleLabel(role)}><div className="metrics outcome-metrics"><Metric label="Response pass rate" value={percent(responses.passRate)} note={`${responses.pass} of ${responses.total} planned responses`}/><Metric label="Case pass rate" value={percent(cases.passRate)} note={`${cases.pass} of ${cases.total} cases`}/><Metric label="Review coverage" value={percent(reviews.coverage)} note={reviews.required?`${reviews.resolved} of ${reviews.required} required reviews resolved`:'0 of 0 required reviews; none required'}/></div><p><strong>Responses:</strong> Pass: {responses.pass} · Fail: {responses.fail} · Needs review: {responses.needsReview}</p><small>{responses.recorded??'Not recorded'} of {responses.expected??responses.total} responses recorded.</small><p><strong>Cases:</strong> Pass: {cases.pass} · Fail: {cases.fail} · Needs review: {cases.needsReview}</p><p><strong>Review evidence:</strong> {reviews.pending} pending. Needs review can mean missing evidence or a disputed assessment; it does not establish a model error. Missing responses remain in the planned-response denominator.</p></Card>;
  })}</div>{critical&&<p className="inline-note"><strong>New model critical findings:</strong> {critical.confirmedCandidateResponses} confirmed critical {critical.confirmedCandidateResponses===1?'response':'responses'} across {critical.confirmedCandidateCases} {critical.confirmedCandidateCases===1?'case':'cases'}. {critical.pendingCandidateResponses} responses with pending critical findings across {critical.pendingCandidateCases} {critical.pendingCandidateCases===1?'case':'cases'}. Pending findings require review before they can be treated as confirmed. A failed response can also have a pending critical review; outcome totals and pending review counts can overlap.</p>}{historical&&<small>These are the original saved outcome counts and review policy.</small>}</>;
}

export function SetupPage({boot,request,act,busy,openRun}){
  const [datasetId,setDataset]=useState(''),[promptId,setPrompt]=useState(''),[policyId,setPolicy]=useState(''),[baseline,setBaseline]=useState(boot.configuration.models.baseline),[candidate,setCandidate]=useState(boot.configuration.models.candidate),[judge,setJudge]=useState(boot.configuration.models.judge);
  useEffect(()=>{
    setDataset(v=>v||boot.datasets.find(d=>d.kind==='development')?.id||boot.datasets[0]?.id||'');
    setPrompt(v=>v||boot.prompts.find(p=>!p.generated)?.id||'');
    setPolicy(v=>v||boot.policies[0]?.id||'');
  },[boot]);
  const dataset=boot.datasets.find(d=>d.id===datasetId),models=[...new Set(Object.values(boot.configuration.models))].filter(Boolean);
  const name=id=>{const role=Object.keys(boot.configuration.models).find(role=>boot.configuration.models[role]===id);return modelName(boot.configuration.modelNames?.[role]||roleLabel(role));};
  const options=models.map(id=><option key={id} value={id}>{name(id)}</option>);
  async function prepare(){
    const run=await request('/runs',{method:'POST',body:{datasetId,promptId,policyId,baselineModelId:baseline,candidateModelId:candidate,judgeModelId:judge}});
    openRun(run.id);
  }
  return <>
    <div className="intro-banner"><div><span className="eyebrow">START HERE</span><h2>Can the new model handle invoices safely?</h2><p>Give both models the same invoice examples. Check what improves, what gets worse, and whether the new model follows your business rules.</p></div></div>
    <WorkflowSteps/>
    <div className="two-column"><Card title="Choose what to compare">
      <div className="form-grid"><Field label="Current model"><select value={baseline} onChange={e=>setBaseline(e.target.value)}>{options}</select></Field><Field label="New model"><select value={candidate} onChange={e=>setCandidate(e.target.value)}>{options}</select></Field></div>
      <Field label="Invoice examples"><select value={datasetId} onChange={e=>setDataset(e.target.value)}><option value="">Choose examples</option>{boot.datasets.map(d=><option key={d.id} value={d.id}>{purpose(d.kind)} · {d.caseCount} examples · {d.version}</option>)}</select></Field>
      <p className="muted">Use the practice examples to learn and improve instructions. Keep the final comparison examples separate.</p>
      <Field label="Instructions for the models"><select value={promptId} onChange={e=>setPrompt(e.target.value)}><option value="">Choose saved instructions</option>{boot.prompts.filter(p=>!p.generated||boot.promptApprovals.some(a=>a.parentId===p.id&&a.approved)).map(p=><option key={p.id} value={p.id}>{promptLabel(p)}</option>)}</select></Field>
      <details><summary>Advanced: business rules and AI reviewer</summary><Field label="Business rules"><select value={policyId} onChange={e=>setPolicy(e.target.value)}>{boot.policies.map((p,i)=><option key={p.id} value={p.id}>Invoice rules · version {i+1}</option>)}</select></Field><Field label="AI reviewer"><select value={judge} onChange={e=>setJudge(e.target.value)}>{options}</select></Field><p>Each answer receives two AI reviews. A person must check the reviewer's reliability before final approval.</p><p>Each model uses its supported generation settings. These settings are saved with the test.</p></details>
      {dataset&&<p className="inline-note">{dataset.caseCount} invoice examples. Both models answer each example three times. Example answers still need business review.</p>}
      <Button disabled={busy||!datasetId||!promptId||!policyId} onClick={()=>act(prepare)}>Prepare test</Button><small>This saves your choices. The next screen lets you start the test.</small>
    </Card><Card title="How to read the result">
      <p><Badge>BLOCK</Badge> A confirmed requirement failed. Do not approve the model switch.</p>
      <p><Badge>REVIEW</Badge> Testing, investigation or approval is still needed.</p>
      <p><Badge>ELIGIBLE FOR PILOT</Badge> The test requirements passed. People can consider a controlled pilot.</p>
      <h3>What must pass?</h3><ul className="requirements"><li>All model answers and reviews must finish.</li><li>At least 90% of cases pass overall and in each category.</li><li>No category gets worse than the current model.</li><li>No confirmed serious failure from the new model.</li><li>Example answers, AI reviewer and final evidence are approved.</li></ul>
      <small>The assistant recommends actions. People remain responsible for real invoice decisions.</small>
    </Card></div>
    <Card title="Your recent tests">{boot.runs.filter(r=>r.kind!=='improvement').length?boot.runs.filter(r=>r.kind!=='improvement').map(r=><div className="report-row" key={r.id}><div><strong>{testLabel(r)}</strong><small><Badge>{r.status}</Badge></small></div><Button secondary onClick={()=>openRun(r.id)}>Open test</Button></div>):<p>No tests yet. Prepare your first practice test above.</p>}</Card>
  </>;
}

export function CaseOutcome({bundle,comparison,role}){
  const rows=bundle.outputs.filter(o=>o.caseId===comparison.id&&o.role===role),assessment=comparison[role];
  if(bundle.historical)return <Badge>{assessment.outcome||(assessment.pending>0?'NEEDS_REVIEW':assessment.pass?'PASS':'FAIL')}</Badge>;
  if(rows.some(o=>o.modelContractFailure))return <Badge>FAIL</Badge>;
  if(bundle.tasks.some(t=>t.caseId===comparison.id&&t.role===role&&t.status==='FAILED')||rows.some(o=>o.error))return <Badge tone="danger">Processing problem</Badge>;
  if(assessment.outcome)return <Badge>{assessment.outcome}</Badge>;
  if(!rows.length)return 'Waiting';
  if(assessment.critical>0||rows.some(o=>o.checks?.some(check=>check.status!=='PASS'&&check.confirmed)))return <Badge>FAIL</Badge>;
  if(assessment.pending>0)return <Badge>NEEDS_REVIEW</Badge>;
  const complete=bundle.result.complete||(rows.length===3&&[0,1,2].every(repeat=>rows.some(o=>o.repeat===repeat))&&rows.every(o=>o.response&&o.judges?.length===2));
  return complete?<Badge>{assessment.pass?'PASS':'FAIL'}</Badge>:'Waiting for checks';
}

export function RunPage({bundle,runId,request,act,busy,setCaseId,setPage,boot,loadingRun=false}){
  if(!bundle)return runId?<Empty title={loadingRun?'Loading test results':'Test results are not loaded'}>The selected test will appear here. Use Refresh if its results could not be loaded.</Empty>:<Empty title="Choose a test">Prepare a test from Start a test, or open an existing one from Past tests.</Empty>;
  const {run,result,progress,snapshot}=bundle;
  const reportReady=!bundle.historical&&run.status==='COMPLETED'&&progress.total>0&&progress.done===progress.total&&progress.failed===0&&progress.running===0;
  const recoveredReviews=(bundle.attempts||[]).filter(a=>a.status==='FAILED'&&bundle.tasks.some(t=>t.id===a.taskId&&t.stage==='JUDGE'&&t.status==='DONE')).length;
  const recoveredResults=(bundle.attempts||[]).filter(a=>a.modelCall===false&&a.recoveryKind==='LOCAL_JOURNAL').length;
  const formatFailures=Object.fromEntries(['baseline','candidate'].map(role=>[role,bundle.outputs.filter(o=>o.role===role&&o.modelContractFailure).length]));
  const prompt=boot?.prompts?.find(p=>p.id===snapshot.promptId);
  async function download(){
    const saved=await request('/runs/'+runId+'/report'),value=bundle.historical?saved.report:currentReport(saved),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='test-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const explanation=result.decision==='BLOCK'?'A confirmed requirement prevents this upgrade. See the reasons below.':result.decision==='ELIGIBLE FOR PILOT'?'The test requirements passed. A person still decides whether to approve a pilot.':'This is not approved yet. Complete the test and resolve the outstanding items below.';
  return <>
    <WorkflowSteps active={run.status==='DRAFT'?2:run.status==='RUNNING'?2:3}/>
    <div className={'decision-banner '+(result.decision==='BLOCK'?'blocked':result.decision==='ELIGIBLE FOR PILOT'?'eligible':'')}><div><div className="eyebrow">MODEL UPGRADE DECISION</div><h2>{stateLabel(result.decision)}</h2><p>{explanation}</p></div><Badge>{run.status}</Badge></div>
    {bundle.historical&&<p className="inline-note">Original historical decision. This report keeps its original rules and evidence. Prepare a new test for current release eligibility.</p>}
    <Card title="Choices saved with this test"><div className="history-facts"><div>{['baseline','candidate','judge'].map(role=><p key={role}><strong>{roleLabel(role)}:</strong> {modelName(snapshot.modelMetadata?.[role]?.displayName||snapshot.models?.[role])}</p>)}</div><div><p><strong>Instructions:</strong> {promptLabel(prompt)}</p><p><strong>Invoice rules:</strong> {readable(snapshot.policy?.version||'Saved invoice rules')}</p><p><strong>Examples:</strong> {purpose(snapshot.datasetKind)} · {snapshot.dataset.cases?.length??result.total??'Saved'} examples · {readable(snapshot.dataset.version)}</p></div></div><details><summary>Read the saved instructions</summary><pre className="prompt-text">{snapshot.prompt||'Saved instruction text is not available in this view.'}</pre></details></Card>
    <ResultSummary result={result} historical={bundle.historical}/>
    <p className="inline-note">A case passes only when all three answers pass and required human reviews are resolved; pending reviews do not count as passed.{!bundle.evidence.labels&&' The reference answers still need business approval.'}</p>
    <div className="two-column"><Card title="Test progress">
      <div className="progress-label"><strong>{progress.done} / {progress.total} steps finished</strong><Badge>{progress.failed} processing problems</Badge></div><progress aria-label="Test progress" value={progress.done} max={progress.total||1}/>
      <p>Each example needs several steps: model answers, rule checks and AI reviews. {progress.running} steps are running now.</p>
      <small>Received answers with invalid format: current model {formatFailures.baseline}; new model {formatFailures.candidate}.</small>
      <div className="button-row">{!bundle.historical&&['DRAFT','INCOMPLETE','CANCELLED'].includes(run.status)&&<Button disabled={busy} onClick={()=>act(()=>request('/runs/'+runId+'/'+(run.status==='DRAFT'?'start':'resume'),{method:'POST',body:{}}))}>{run.status==='DRAFT'?'Start evaluation':'Resume test'}</Button>}{run.status==='RUNNING'&&<Button secondary danger disabled={busy} onClick={()=>act(()=>request('/runs/'+runId+'/cancel',{method:'POST',body:{}}))}>Stop test</Button>}</div>
      <p>Examples: {snapshot.dataset.version} · {purpose(snapshot.datasetKind)}<br/>Rules and instructions stay the same throughout this test.</p>
      {bundle.artifactVerification?.mode==='saved-report'&&<p>Saved report validated{bundle.artifactVerification.reportGeneratedAt?' · report saved '+when(bundle.artifactVerification.reportGeneratedAt):''}. Check and save report verifies all original records again.</p>}
      <div className="button-row"><Button secondary disabled={busy||!reportReady} onClick={()=>act(()=>request('/runs/'+runId+'/report',{method:'POST',body:{}}))}>Check and save report</Button><Button secondary disabled={busy||!run.reportId} onClick={()=>act(download)}>Download report</Button></div>
      {!reportReady&&!bundle.historical&&<small>Reports are available after every evaluation step finishes.</small>}
    </Card><Card title="Why this decision?">{result.reasons.length?<ul className="reason-list">{result.reasons.map((reason,i)=><li key={i}>{readable(reason)}</li>)}</ul>:<p>The required checks and approvals passed.</p>}
      {snapshot.judgeCandidateOverlap&&<p className="inline-note">The new model also reviews answers. A person must check reviewer reliability before final approval.</p>}
      {!snapshot.judgeCandidateOverlap&&snapshot.judgeFamilyOverlap&&Object.values(snapshot.judgeFamilyOverlap).some(Boolean)&&<p className="inline-note">The AI reviewer shares a model family with {snapshot.judgeFamilyOverlap.baseline&&snapshot.judgeFamilyOverlap.candidate?'both tested models':snapshot.judgeFamilyOverlap.baseline?'the current model':'the new model'}. A person must check reviewer reliability before final approval.</p>}
      <div className="evidence-row">{Object.entries(bundle.evidence).map(([key,value])=><div key={key}>{({labels:'Example answers',calibration:'AI reviewer',release:'Final approval'})[key]}<Badge>{value?'APPROVED':'PENDING'}</Badge></div>)}</div>
    </Card></div>
    <Card title="Results by type of invoice"><div className="table-scroll"><table><thead><tr><th>Invoice type</th><th>Examples</th><th>Current model</th><th>New model</th><th>Change</th></tr></thead><tbody>{Object.entries(result.categories).map(([key,value])=><tr key={key}><td>{categories[key]||key}</td><td>{value.total}</td><td>{result.complete?percent(value.baseline):'Waiting'}</td><td>{result.complete?percent(value.candidate):'Waiting'}</td><td>{!result.complete?'Waiting':value.candidate<value.baseline?'Worse':value.candidate>value.baseline?'Better':'Same'}</td></tr>)}</tbody></table></div></Card>
    <Card title="Inspect individual examples"><p>Pass means every answer met the requirements. Fail means a business requirement failed. Needs review means the evidence or a human decision is still pending. Processing problems identify steps that could not finish.</p><div className="table-scroll"><table><thead><tr><th>Example</th><th>Current model</th><th>New model</th><th>Change</th><th/></tr></thead><tbody>{result.comparisons.map((c,i)=><tr key={c.id}><td>{caseLabel(c,i)}</td><td><CaseOutcome bundle={bundle} comparison={c} role="baseline"/></td><td><CaseOutcome bundle={bundle} comparison={c} role="candidate"/></td><td>{({PENDING:'Waiting',IMPROVEMENT:'Better',REGRESSION:'Worse',UNCHANGED:'Same'})[c.change]}</td><td><Button secondary onClick={()=>{setCaseId(c.id);setPage('investigate');}}>See answers</Button></td></tr>)}</tbody></table></div></Card>
    {run.status!=='DRAFT'&&<Card title="Next: review or improve, then retest"><p>{bundle.historical?'Inspect the original results, then prepare a new test under the current review policy. Original decisions are retained.':'Inspect the answers behind a failure or pending finding. Resolve human review items, or revise the instructions using practice examples. Prepare a new test to measure the change.'}</p><div className="button-row"><Button secondary disabled={!result.comparisons.length} onClick={()=>{setCaseId?.(result.comparisons.find(c=>c.candidate.outcome!=='PASS')?.id||result.comparisons[0]?.id);setPage?.('investigate');}}>Inspect answers</Button><Button secondary disabled={bundle.historical} onClick={()=>setPage?.('review')}>Review findings</Button><Button secondary onClick={()=>setPage?.('prompts')}>Improve instructions</Button><Button secondary onClick={()=>setPage?.('setup')}>Retest with saved instructions</Button></div></Card>}
    <details><summary>Advanced test details: reviewer settings, retries and fingerprints</summary>
      <h3>Saved generation and reviewer settings</h3><pre className="prompt-text">{JSON.stringify(snapshot.modelSettings||{answers:snapshot.settings,reviewer:snapshot.judgeSettings},null,2)}</pre>
      <h3>Review policy</h3><p>{result.reviewPolicyVersion||'Original policy; current review version was not recorded.'}</p>
      <h3>Saved fingerprints</h3><pre className="prompt-text">{JSON.stringify({examples:snapshot.datasetDigest,instructions:snapshot.promptDigest,rules:snapshot.policyDigest,reviewerInstructions:snapshot.judgeTemplateDigest,evaluationEngine:snapshot.engineDigest,runner:snapshot.runner},null,2)}</pre>
      <h3>Processing problems and retries</h3>
      {recoveredResults>0&&<small>{recoveredResults} saved {recoveredResults===1?'result':'results'} recovered after connection interruptions. The original responses were reused.</small>}
      {recoveredReviews>0&&<small>{recoveredReviews} AI review requests needed another attempt. Original failed attempts remain saved in the report.</small>}
      {bundle.tasks.filter(t=>t.error&&t.status!=='DONE').map(t=>{const index=snapshot.dataset.cases?.findIndex(c=>c.id===t.caseId),c=snapshot.dataset.cases?.[index];return <p key={t.id}>{caseLabel(c||{},index>=0?index:undefined)} · {t.stage==='JUDGE'?'AI review of the '+roleLabel(t.role).toLowerCase():roleLabel(t.role)} · answer attempt {t.repeat+1}: {readable(t.error.message)}</p>;})}
      {!bundle.tasks.some(t=>t.error&&t.status!=='DONE')&&<p>No unresolved processing errors recorded.</p>}
    </details>
  </>;
}

export function InvestigationPage({bundle,caseId,setCaseId,repeat=0,setRepeat=()=>{},setPage}){
  if(!bundle)return <Empty title="Choose a test first">Open a test to explore its invoices and model answers.</Empty>;
  const cases=bundle.snapshot.dataset.cases,c=cases.find(c=>c.id===caseId)||cases[0];
  return <>
    <WorkflowSteps active={3}/>
    <p className="page-description">Read the facts first. Then compare each answer with the rule checks and the AI reviews.</p>
    <div className="case-toolbar"><Field label="Invoice example"><select value={c.id} onChange={e=>setCaseId(e.target.value)}>{cases.map((item,i)=><option value={item.id} key={item.id}>{caseLabel(item,i)}</option>)}</select></Field><Field label="Answer attempt"><select value={repeat} onChange={e=>setRepeat(Number(e.target.value))}>{[0,1,2].map(n=><option key={n} value={n}>Attempt {n+1} of 3</option>)}</select></Field></div>
    <Card title="What happened in this invoice?"><CaseFacts value={c}/><details><summary>What should a correct answer do?</summary><p><Badge>{bundle.evidence.labels?'Reviewed by the business':'Needs business review'}</Badge> This generated answer guide is used for assessment. The models being tested do not receive it.</p><ModelAnswer value={c.expected} reference/>{c.expectedBehaviour&&<p>{readable(c.expectedBehaviour)}</p>}</details></Card>
    <div className="two-column">{['baseline','candidate'].map(role=>{
      const output=bundle.outputs.find(o=>o.caseId===c.id&&o.role===role&&o.repeat===repeat);
      return <Card key={role} title={roleLabel(role)+' · '+modelName(bundle.snapshot.modelMetadata[role].displayName)}>{output?<>{output.assessment?.outcome&&<p><strong>Response outcome:</strong> <Badge>{output.assessment.outcome}</Badge></p>}<ModelAnswer value={output.response} modelContractFailure={output.modelContractFailure} rawText={output.rawText}/><h3>Rule checks</h3><RuleChecks checks={output.checks}/><details><summary>AI reviewer evidence</summary><JudgeEvidence judges={output.judges}/></details></>:<p>No answer yet. Start the test or check its processing problems.</p>}</Card>;
    })}</div>
    {setPage&&<div className="button-row"><Button secondary disabled={bundle.historical} onClick={()=>setPage('review')}>Review findings</Button><Button secondary onClick={()=>setPage('prompts')}>Improve instructions</Button><Button secondary onClick={()=>setPage('setup')}>Retest with saved instructions</Button></div>}
    {(bundle.attempts||[]).filter(a=>a.error&&(bundle.tasks||[]).some(t=>t.id===a.taskId&&t.caseId===c.id&&t.repeat===repeat&&t.status!=='DONE')).map(a=><Card key={a.id} title="A processing step needs attention"><p>{readable(a.error.message)}</p><small>Execution attempt {a.attempt}. Original records are retained in the test report.</small></Card>)}
  </>;
}

export function ReviewFindings({item}){
  return <>{item.optimization&&<><Badge>Practice answer</Badge><CaseFacts value={item.caseFacts}/><h3>Model answer</h3><ModelAnswer value={item.response} modelContractFailure={item.modelContractFailure} rawText={item.rawText}/></>}<h3>Rule checks</h3><RuleChecks checks={item.checks}/><h3>AI review evidence</h3><JudgeEvidence judges={item.judges}/></>;
}
export function ReviewActions({item,reason='',setReason,onResolve,busy=false}){
  const locked=item.historical||item.reviewReady===false;
  return <>{item.historical?<p className="inline-note">Original review policy: {item.reviewPolicyVersion||'Recorded with the original test'}. Original decisions are retained. Prepare a new test to make decisions under the current policy.</p>:item.reviewReady===false&&<p className="inline-note">AI review evidence is still processing. Both valid recorded AI reviews must be available before a person can resolve this item. Resume unfinished steps from Test results if needed.</p>}<Field label="Explain your decision"><textarea disabled={locked} value={reason} onChange={e=>setReason(e.target.value)}/></Field><div className="button-row">{[['CONFIRM_CRITICAL','Confirm serious failure'],['REJECT_OUTPUT','Reject this answer'],['ACCEPT_OUTPUT','Accept this disputed answer']].map(([resolution,label])=><Button key={resolution} secondary disabled={busy||locked||!reason.trim()||(resolution==='ACCEPT_OUTPUT'&&item.checks?.some(c=>c.status!=='PASS'&&c.confirmed))} onClick={()=>onResolve(resolution)}>{label}</Button>)}</div>{!locked&&<small>Your decision is saved with its reason. Refresh the test report after reviewing.</small>}</>;
}
export function ReviewPage({request,act,busy,runId,setRunId,setCaseId,setPage,setRepeat=()=>{},boot,bundle}){
  const [queue,setQueue]=useState([]),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[reasons,setReasons]=useState({}),[includeAll,setAll]=useState(false);
  const load=async()=>{setError('');try{setQueue(await request('/reviews'));setLoaded(true);}catch(e){setError(e.message);}};
  useEffect(()=>{load();},[request,bundle?.inputDigest]);
  const rows=queue.filter(q=>includeAll||!runId||q.runId===runId);
  async function review(q,resolution){await request('/reviews',{method:'POST',body:{runId:q.runId,outputId:q.outputId,resolution,reason:reasons[q.outputId]}});await load();}
  return <><WorkflowSteps active={4}/><p className="page-description">A person checks serious findings and AI reviewer disagreements here. A confirmed financial or policy mistake cannot be approved away. After reviewing, check the results again; improve the instructions and retest if a business requirement failed.</p><label className="check"><input type="checkbox" checked={includeAll} onChange={e=>setAll(e.target.checked)}/>Show items from all tests and instruction improvements</label><Button secondary disabled={busy} onClick={()=>act(load)}>Refresh review list</Button>{error&&<p role="alert">{readable(error)}</p>}
    {!loaded?<p>Loading review items…</p>:!rows.length?<Empty title="No answers need review in this selection">Items appear after model answers have been checked. This does not mean an unstarted test has passed.</Empty>:rows.map(q=><Card key={q.outputId} title={roleLabel(q.role)+' · attempt '+(q.repeat+1)}>
      <p className="muted">{testLabel(boot?.runs?.find(r=>r.id===q.runId)||{kind:q.optimization?'improvement':'development'})}{q.runId===bundle?.run.id&&(()=>{const cases=bundle.snapshot.dataset.cases,index=cases.findIndex(c=>c.id===q.caseId);return index>=0?' · '+caseLabel(cases[index],index):'';})()}</p>
      <div className="button-row"><Badge tone={q.critical?'danger':'neutral'}>{q.critical?'Confirmed serious failure':'Needs a person to decide'}</Badge>{q.disagreement&&<Badge>AI reviews disagree</Badge>}{!q.optimization&&<Button secondary onClick={()=>{setRunId(q.runId);setCaseId(q.caseId);setRepeat(q.repeat);setPage('investigate');}}>See invoice and answers</Button>}</div>
      <ReviewFindings item={q}/><ReviewActions item={q} reason={reasons[q.outputId]||''} setReason={reason=>setReasons({...reasons,[q.outputId]:reason})} onResolve={resolution=>act(()=>review(q,resolution))} busy={busy}/>
    </Card>)}<div className="button-row"><Button secondary onClick={()=>setPage('decision')}>Inspect updated results</Button><Button secondary onClick={()=>setPage('prompts')}>Improve instructions</Button><Button secondary onClick={()=>setPage('setup')}>Retest with saved instructions</Button></div></>;
}

export function PromptsPage({boot,request,act,busy,openRun}){
  const [selected,setSelected]=useState(''),[text,setText]=useState(''),[version,setVersion]=useState(''),[reason,setReason]=useState('');
  const prompt=boot.prompts.find(p=>p.id===selected)||boot.prompts[0];
  return <><WorkflowSteps active={4}/><p className="page-description">A prompt is the instruction text given to a model. Save versions so you can compare them fairly. Suggestions use practice examples only. Select the revised saved instructions when preparing your next test.</p><div className="two-column"><Card title="Saved instructions"><Field label="Choose a version"><select value={prompt?.id||''} onChange={e=>setSelected(e.target.value)}>{boot.prompts.map(p=><option key={p.id} value={p.id}>{promptLabel(p)}{p.generated?' · suggested':''}</option>)}</select></Field>{prompt&&<><pre className="prompt-text">{prompt.text}</pre><small>Saved {when(prompt.createdAt)}</small>{prompt.generated&&!boot.promptApprovals.some(a=>a.parentId===prompt.id&&a.approved)&&<><Field label="Why should this version be approved?"><textarea value={reason} onChange={e=>setReason(e.target.value)}/></Field><Button secondary disabled={busy||!reason.trim()} onClick={()=>act(()=>request('/prompts/approve',{method:'POST',body:{promptId:prompt.id,reason}}))}>Approve these instructions</Button><small>This makes the version available for selection. It does not switch models automatically.</small></>}</>}</Card>
      <div className="stack"><OptimizationPanel boot={boot} request={request} act={act} busy={busy}/><Card title="Write your own revision"><Field label="Name this version"><input value={version} onChange={e=>setVersion(e.target.value)} placeholder="For example: clearer missing-record instructions"/></Field><Field label="Complete instructions"><textarea rows={6} value={text} onChange={e=>setText(e.target.value)}/></Field><Button secondary disabled={busy||text.length<40||!version.trim()} onClick={()=>act(()=>request('/prompts',{method:'POST',body:{text,version,parentId:prompt?.id}}))}>Save new instructions</Button></Card></div></div>
      {boot.proposals.length>0&&<Card title="Suggested improvements">{boot.proposals.map(p=><article className="proposal" key={p.id}><h3>Suggestion saved {when(p.createdAt)}</h3><p>{readable(p.rationale)}</p><Badge>{p.changed===false?'Original instructions kept':'Needs human approval'}</Badge>{p.selection&&<p>{p.selection.selectedPassed} of {p.selection.validationCases} practice-validation examples passed with this version, compared with {p.selection.baselinePassed} before. These are practice results.</p>}<div className="diff">{p.diff.map((line,i)=><div key={i} className={line.type}>{line.type==='added'?'+':'−'} {line.text}</div>)}</div>{boot.retestLinks.filter(l=>l.parentId===p.id&&l.runId).map(l=><Button secondary key={l.id} onClick={()=>openRun(l.runId)}>See the repeat practice test</Button>)}</article>)}</Card>}
    </>;
}

export function ConnectionsPage({boot,request,act,busy,openRun}){
  const [status,setStatus]=useState(null),[error,setError]=useState(''),[target,setTarget]=useState(''),[type,setType]=useState('labels'),[reason,setReason]=useState(''),[reference,setReference]=useState(''),[approved,setApproved]=useState(true);
  const names={database:'Saved tests',objectStorage:'Saved reports',baseline:'Current model',candidate:'New model',judge:'AI reviewer',gepa:'Instruction improvement'};
  const evidenceNames={labels:'Example answers',calibration:'AI reviewer reliability',release:'Final business approval'};
  const check=async()=>{setError('');try{setStatus(await request('/status'));}catch(e){setError(e.message);}};
  useEffect(()=>{check();},[request]);
  return <><Card title="Application availability"><p>Check whether the services needed by a test can be reached. A completed test is still needed to measure model behaviour.</p><Button secondary disabled={busy} onClick={()=>act(check)}>Check availability</Button>{error&&<p role="alert">{readable(error)}</p>}{status?<div className="connection-grid">{Object.entries(status.checks).map(([key,value])=><div className="connection" key={key}><h3>{names[key]||'Application service'}</h3><Badge>{value.ok?'Connected':'Connection problem'}</Badge>{!value.ok&&<p>{readable(value.error?.message)}</p>}</div>)}</div>:<p>Checking availability…</p>}</Card>
    <div className="two-column"><Card title="Record a business approval"><p>Only record an approval after the review actually happened. This cannot turn an unfinished or failing test into a pass.</p>
      <Field label="What was reviewed?"><select value={type} onChange={e=>{setType(e.target.value);setTarget('');}}>{Object.entries(evidenceNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
      <Field label={type==='labels'?'Example set':'Test'}><select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choose what was reviewed</option>{(type==='labels'?boot.datasets:boot.runs.filter(r=>r.kind!=='improvement')).map(item=><option key={item.id} value={item.id}>{type==='labels'?purpose(item.kind)+' · '+item.caseCount+' examples · '+item.version:testLabel(item)}</option>)}</select></Field>
      <Field label="Review reference"><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Review document, ticket or sign-off reference"/></Field><Field label="Reason"><textarea value={reason} onChange={e=>setReason(e.target.value)}/></Field><Field label="Decision"><select value={approved?'yes':'no'} onChange={e=>setApproved(e.target.value==='yes')}><option value="yes">Approved</option><option value="no">Not approved</option></select></Field>
      <Button secondary disabled={busy||!target||!reason.trim()||!reference.trim()} onClick={()=>act(()=>request('/evidence',{method:'POST',body:{targetId:target,type,approved,reason,sourceId:reference}}))}>Save approval decision</Button>
    </Card><Card title="Reports and invoice rules"><p>Open a test to inspect or download its current report.</p>{boot.runs.filter(r=>r.kind!=='improvement').map(r=><div className="report-row" key={r.id}><div><strong>{testLabel(r)}</strong><small>{r.reportId?'Report saved':'No report yet'}</small></div><Button secondary onClick={()=>openRun(r.id)}>Open test</Button></div>)}<h3>Demonstration rules</h3><p>{boot.policies[0]?.policy.text}</p><small>These are project rules and need business approval before operational use.</small></Card></div>
    </>;
}
