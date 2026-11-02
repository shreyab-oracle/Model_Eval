import React,{useState,useEffect,useCallback,useRef} from 'react';
import {Button,Empty} from './components.jsx';
import {testLabel,readable,visibleRunId,shouldPollRun} from './presentation.mjs';
import {SetupPage,RunPage,InvestigationPage,ReviewPage,PromptsPage,ConnectionsPage,HistoryPage} from './pages.jsx';
const NAV=[['setup','Start a test'],['history','Past tests'],['decision','Test results'],['investigate','Invoice examples'],['review','Needs review'],['prompts','Improve instructions'],['connections','Approvals']];
export default function App(){
  const [page,setPage]=useState('setup'),[boot,setBoot]=useState(null),[runId,setRunId]=useState(''),[bundle,setBundle]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[caseId,setCaseId]=useState(''),[repeat,setRepeat]=useState(0),[loadingRun,setLoadingRun]=useState(false);
  const currentRun=useRef(runId);currentRun.current=runId;
  const runPolling=useRef(false);runPolling.current=bundle?.run.id===runId&&shouldPollRun(bundle);
  const pendingRuns=useRef(new Map());
  const request=useCallback(async(path,{method='GET',body}={})=>{const r=await fetch(`/api${path}`,{method,headers:method==='GET'?{}:{'content-type':'application/json','x-local-token':boot?.token||''},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok||d.error)throw new Error(`${d.error?.code||r.status}: ${d.error?.message||'Request failed'}`);return d;},[boot?.token]);
  const reload=useCallback(async()=>{const data=await request('/bootstrap'),nextRun=visibleRunId(data.runs,currentRun.current);setBoot(data);if(nextRun!==currentRun.current){setBundle(null);setCaseId('');setRepeat(0);}setRunId(nextRun);return data;},[request]);
  useEffect(()=>{reload().catch(e=>setError(e.message));},[reload]);
  const jobsRunning=boot?.runs.some(r=>r.status==='RUNNING');
  useEffect(()=>{if(!jobsRunning)return;let loading=false;const timer=setInterval(async()=>{if(loading)return;loading=true;try{await reload();}catch(e){setError(e.message);}finally{loading=false;}},10000);return()=>clearInterval(timer);},[jobsRunning,reload]);
  const loadRun=useCallback(()=>{if(!runId){setBundle(null);setLoadingRun(false);return Promise.resolve();}const existing=pendingRuns.current.get(runId);if(existing)return existing;setLoadingRun(true);const pending=(async()=>{try{const b=await request(`/runs/${runId}`);if(currentRun.current===runId)setBundle(b);}finally{pendingRuns.current.delete(runId);if(currentRun.current===runId)setLoadingRun(false);}})();pendingRuns.current.set(runId,pending);return pending;},[runId,request]);
  const selectedRun=boot?.runs.find(r=>r.id===runId),runRevision=selectedRun?[selectedRun.id,selectedRun.status,selectedRun.reportId,selectedRun.updatedAt].join('|'):'';
  useEffect(()=>{let active=true,loading=false;const load=async()=>{if(active&&!loading){loading=true;try{await loadRun();}catch(e){if(active)setError(e.message);}finally{loading=false;}}};load();const timer=setInterval(()=>{if(runPolling.current)load();},10000);return()=>{active=false;clearInterval(timer);};},[loadRun,runRevision]);
  async function act(fn){setBusy(true);setError('');try{const value=await fn();const data=await reload();if(runId&&data.runs.some(r=>r.id===runId))await loadRun();return value;}catch(e){setError(e.message);return null;}finally{setBusy(false);}}
  function openRun(id){setRunId(id);setPage('decision');setCaseId('');setRepeat(0);}
  const ctx={boot,request,act,busy,bundle:bundle?.run.id===runId?bundle:null,runId,setRunId,openRun,caseId,setCaseId,repeat,setRepeat,setPage,loadingRun};
  return <div className="app"><aside className="sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setPage('setup');}}><span className="brand-mark">AI</span><span>Evaluation<br/><b>Workspace</b></span></a><div className="nav-label">YOUR WORKSPACE</div><nav aria-label="Main navigation">{NAV.map(([key,label])=><button key={key} aria-current={page===key?'page':undefined} onClick={()=>setPage(key)}><span className="nav-dot"/>{label}</button>)}</nav></aside>
    <div className="workspace"><header className="topbar"><span>Compare models with confidence</span></header><main><div className="page-heading"><div><div className="eyebrow">AI MODEL EVALUATION &amp; UPGRADES</div><h1>{NAV.find(n=>n[0]===page)?.[1]}</h1></div><Button secondary onClick={()=>act(reload)} disabled={busy}>Refresh</Button></div>
    {error&&<div className="error-banner" role="alert"><strong>Request failed</strong><p>{readable(error)}</p><button onClick={()=>setError('')} aria-label="Dismiss error">×</button></div>}
    {!boot?<Empty title="Connecting to your workspace">{error?'Resolve the connection error above, then refresh.':'Loading your tests and saved examples…'}</Empty>:<>{!['setup','connections','prompts','history'].includes(page)&&<div className="run-switch"><label htmlFor="current-run">Test</label><select id="current-run" value={runId} onChange={e=>{setBundle(null);setRunId(e.target.value);setCaseId('');}}><option value="">Choose a test</option>{boot.runs.filter(r=>r.kind!=='improvement').map(r=><option value={r.id} key={r.id}>{testLabel(r)}</option>)}</select></div>}
    {page==='setup'&&<SetupPage {...ctx}/>}{page==='history'&&<HistoryPage {...ctx}/>}{page==='decision'&&<RunPage {...ctx}/>}{page==='investigate'&&<InvestigationPage {...ctx}/>}{page==='review'&&<ReviewPage {...ctx}/>}{page==='prompts'&&<PromptsPage {...ctx}/>}{page==='connections'&&<ConnectionsPage {...ctx}/>}</>}
    </main></div></div>;
}
