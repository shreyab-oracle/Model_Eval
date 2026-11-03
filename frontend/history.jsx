import React,{useState,useEffect,useCallback} from 'react';
import {Badge,Button,Card,Empty,when} from './components.jsx';
import {testLabel,purpose,modelName,readable,roleLabel,caseLabel} from './presentation.mjs';

export function HistoryList({rows,openRun,setPage}){
  if(!rows.length)return <Empty title="No tests yet">Your saved tests and their actual results will appear here.</Empty>;
  return <div className="history-list">{rows.map(row=><Card key={row.id} title={testLabel(row)}>
    <div className="button-row"><Badge>{row.status}</Badge>{row.decision&&<Badge>{row.decision}</Badge>}<span className="muted">{when(row.createdAt)} · {purpose(row.kind)}</span><Button secondary onClick={()=>openRun(row.id)}>Open test</Button></div>
    {row.historical&&<p className="inline-note">Original review policy: {row.reviewPolicyVersion||'Recorded with the original test'}. Original decisions are retained. Prepare a new test for current eligibility.</p>}
    {row.error?<p role="alert">{readable(row.error)}</p>:<><div className="history-facts"><div><h3>Models used</h3>{['baseline','candidate','judge'].map(role=><p key={role}><strong>{roleLabel(role)}:</strong> {modelName(row.models[role].displayName)}</p>)}</div><div><h3>Instructions used</h3><p>{row.prompt.version&&!/[a-f0-9]{8,}/i.test(row.prompt.version)?row.prompt.version:'Saved instructions'}</p><p>Examples: {row.dataset}</p><small>Saved report information. Open the test to check its latest evidence.</small></div></div>
    <div className="history-facts"><div><h3>What improved</h3><p>{row.improvements===null?'Pending complete results':row.improvements.length?`${row.improvements.length} invoice examples improved.`:'No measured case improvements.'}</p></div><div><h3>What regressed</h3><p>{row.regressions===null?'Pending complete results':row.regressions.length?`${row.regressions.length} invoice examples got worse.`:'No measured case regressions.'}</p></div></div>
    <h3>{row.decision==='BLOCK'?'Why the upgrade was blocked':'Decision reasons'}</h3>{row.reasons.length?<ul>{row.reasons.map((reason,i)=><li key={i}>{readable(reason)}</li>)}</ul>:<p>Saved evaluation requirements passed. Pilot approval remains separate.</p>}
    {row.criticalFindings?<p><strong>New model:</strong> {row.criticalFindings.confirmedCandidateResponses} confirmed critical {row.criticalFindings.confirmedCandidateResponses===1?'response':'responses'} across {row.criticalFindings.confirmedCandidateCases} {row.criticalFindings.confirmedCandidateCases===1?'case':'cases'}. {row.criticalFindings.pendingCandidateResponses} responses with pending critical findings across {row.criticalFindings.pendingCandidateCases} {row.criticalFindings.pendingCandidateCases===1?'case':'cases'}.</p>:<p>Original saved critical-failure count: {row.criticalFailures??'Not recorded'}. Original review policy retained.</p>}
    <div className="button-row"><Badge>{row.executionErrors} processing problems</Badge><Badge>{row.pendingReviews} pending human reviews</Badge></div>
    <h3>What needs human review</h3>{row.reviewItems?.length?<ul>{row.reviewItems.map(o=><li key={o.outputId}>{caseLabel(o,o.caseIndex)} · {roleLabel(o.role)} · attempt {o.repeat+1}</li>)}</ul>:<p>No unresolved answer reviews recorded.</p>}
    {!!row.pendingEvidence?.length&&<p>Pending evidence approval: {row.pendingEvidence.map(key=>({labels:'Example answers',calibration:'AI reviewer reliability',release:'Final business approval'})[key]).join(', ')}.</p>}
    {!row.historical&&row.pendingReviews>0&&setPage&&<Button secondary onClick={()=>{openRun(row.id);setPage('review');}}>Open review list</Button>}
    <small>{row.progress.done} / {row.progress.total} steps finished</small></>}
  </Card>)}</div>;
}
export function HistoryPage({request,openRun,setPage,boot}){
  const [rows,setRows]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const load=useCallback(async()=>{setLoading(true);setError('');try{setRows(await request('/history'));}catch(e){setError(e.message);}finally{setLoading(false);}},[request]);
  useEffect(()=>{load();},[load,boot.runs]);
  return <><p className="page-description">See which models and instructions were tested, what improved, what got worse, and which decisions need your attention.</p><Button secondary disabled={loading} onClick={load}>Refresh history</Button>{error&&<p role="alert">{readable(error)}</p>}{rows?<HistoryList rows={rows} openRun={openRun} setPage={setPage}/>:<p>Loading evaluation history…</p>}</>;
}
