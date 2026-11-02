import React,{useState} from 'react';
import {Badge,Button,Card,Field,when} from './components.jsx';
import {testLabel,promptLabel,modelName,readable} from './presentation.mjs';
export function OptimizationPanel({boot,request,act,busy}){
  const [sourceRun,setSourceRun]=useState(''),[maxCases,setMaxCases]=useState(48),[maxProposals,setMaxProposals]=useState(3),[autoRetest,setAutoRetest]=useState(true);
  const limitsValid=Number.isInteger(maxCases)&&maxCases>=24&&maxCases<=120&&Number.isInteger(maxProposals)&&maxProposals>=1&&maxProposals<=6;
  const source=boot.runs.find(r=>r.id===sourceRun&&r.engineCurrent!==false);
  return <><Card title="Suggest clearer instructions"><p>Use mistakes from a practice test to suggest clearer instructions, then check whether they help. The business rules and final-test examples stay protected.</p>
    <Field label="Practice test"><select value={sourceRun} onChange={e=>setSourceRun(e.target.value)}><option value="">Choose a practice test with results</option>{boot.runs.filter(r=>r.kind==='development'&&['COMPLETED','INCOMPLETE'].includes(r.status)).map(r=><option value={r.id} key={r.id} disabled={r.engineCurrent===false}>{testLabel(r)}{r.engineCurrent===false?' · prepare a new practice test':''}</option>)}</select></Field>
    <details><summary>Search settings</summary><div className="form-grid"><Field label="Maximum case evaluations (24–120)"><input type="number" min="24" max="120" value={maxCases} onChange={e=>setMaxCases(Number(e.target.value))}/></Field><Field label="Maximum prompt proposals (1–6)"><input type="number" min="1" max="6" value={maxProposals} onChange={e=>setMaxProposals(Number(e.target.value))}/></Field></div></details>
    <label className="check"><input type="checkbox" checked={autoRetest} onChange={e=>setAutoRetest(e.target.checked)}/>Retest an acceptable revision on the practice examples</label>
    <p className="inline-note">The app tries a limited set of revisions and keeps the original instructions if it cannot establish an improvement. You can stop the search at any time.</p>
    <Button disabled={busy||!source||!limitsValid} onClick={()=>act(()=>request('/improvements',{method:'POST',body:{sourceRunId:sourceRun,autoRetest,limits:{maxCaseEvaluations:maxCases,maxProposals}}}))}>Suggest improvements{autoRetest?' and test them':''}</Button>
    <small>Policy, financial rules and labels stay frozen. Suggestions need human approval before a final comparison. An uncertain request is recorded and requires explicit resume.</small>
  </Card>
  {!!boot.optimizationJobs?.length&&<Card title="Instruction improvement history">{boot.optimizationJobs.map(job=><article className="proposal" key={job.id}><h3>{'Practice improvement · '+when(job.createdAt)}</h3><div className="button-row"><Badge>{job.status}</Badge></div><p>Tested model: {modelName(job.candidateModel.displayName)}<br/>Original instructions: {promptLabel(boot.prompts.find(p=>p.id===job.promptId))}</p>{job.activeCalls>0&&<p>{job.activeCalls} model request running.</p>}{job.uncertainCalls>0&&<p>{job.uncertainCalls} request outcomes need checking before continuing.</p>}
    {job.evaluationFailures>0&&<p>{job.evaluationFailures} {job.evaluationFailures===1?'answer or review could':'answers or reviews could'} not be evaluated. Recorded as failures; they cannot count as passes.</p>}
    {!!job.evaluationErrors?.length&&<details><summary>See recorded evaluation problems</summary>{job.evaluationErrors.map((error,i)=><p key={i}>{readable(error.message)}</p>)}</details>}
    {job.optimizerCurrent===false&&<p className="inline-note">The improvement code has changed. Start a new improvement after preparing and running a new practice test. This job and its suggestions are preserved.</p>}
    {job.errors.map((error,i)=><p role="alert" key={i}>{readable(error.message)}</p>)}
    <div className="button-row">{job.optimizerCurrent!==false&&['INCOMPLETE','CANCELLED'].includes(job.status)&&<Button secondary disabled={busy} onClick={()=>act(()=>request(`/runs/${job.id}/resume`,{method:'POST',body:{}}))}>Resume with remaining call limit</Button>}{job.status==='RUNNING'&&<Button secondary danger disabled={busy} onClick={()=>act(()=>request(`/runs/${job.id}/cancel`,{method:'POST',body:{}}))}>Cancel new work</Button>}</div>
    {job.candidates.map(c=><details key={c.id}><summary>Suggested version {c.iteration}</summary><p>{c.rationale}</p><pre className="prompt-text">{c.text}</pre></details>)}
  </article>)}</Card>}</>;
}
