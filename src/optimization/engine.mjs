import {repository} from '../db/repository.mjs';
import {digest,modelInput} from '../domain/policy.mjs';
import {parseJSON,checkOutput,validateModelResponse} from '../domain/checks.mjs';
import {judgeInput,validateJudge} from '../domain/judge.mjs';
import {assessOutput} from '../domain/decision.mjs';
import {selectOptimizationCandidate} from '../domain/optimization.mjs';
import {assertOptimizer,runGepa} from './bridge.mjs';
import {createCallLedger} from './ledger.mjs';
import {chat} from '../oracle/genai.mjs';
import {getJSON,putJSON} from '../oracle/storage.mjs';
import {IMPROVEMENT_INSTRUCTIONS,validateProposal} from '../services/prompts.mjs';
import {settingsForRole} from '../domain/model-settings.mjs';

function evaluationValidator(c,response){
  const judging=response!==undefined;
  return result=>{
    let parsed;
    try{parsed=parseJSON(result.text);}catch(error){throw Object.assign(new Error(`${judging?'Judge assessment':'Model answer'} is not a JSON object: ${error.message}`),{code:'INVALID_EVALUATION_JSON',evaluationFailure:true});}
    if(judging){
      try{return validateJudge(parsed,response);}catch(error){throw Object.assign(error,{code:'INVALID_JUDGE_ASSESSMENT',evaluationFailure:true});}
    }
    try{return validateModelResponse(c,parsed);}catch(error){
      if(error.code!=='INVALID_OUTPUT_SCHEMA')throw error;
      // Diagnostic guidance only. The shared checker remains the authority.
      const actions=['NO_MATCHING_EXCEPTION','RETAIN_HOLD','REQUEST_EVIDENCE','REVIEW'];
      if(!actions.includes(parsed.action))error.message+=`. action returned ${JSON.stringify(parsed.action)??'missing'}; expected one of ${actions.join(', ')}. Exception codes such as PRICE_TOLERANCE belong in holdReasons.`;
      const calculations=parsed.calculations;
      if(calculations)for(const key of ['billedTotalCents','quantityDiscrepancy','discrepancyAmountCents','priceDeltaCents']){
        if(!Number.isSafeInteger(calculations[key])&&!(key!=='billedTotalCents'&&calculations[key]===null))error.message+=` calculations.${key} returned ${JSON.stringify(calculations[key])??'missing'}; expected an integer${key==='billedTotalCents'?'':' or null'}.`;
      }
      throw Object.assign(error,{evaluationFailure:true});
    }
  };
}

export async function evaluateOptimizationCase({snapshot,jobId,text,c,invoke,store=repository}){
  const source=snapshot.source,outputs=[];
  for(let repeat=0;repeat<3;repeat++){
    const id=digest({jobId,text,caseId:c.id,repeat}),old=await store.doc(id);
    if(old){outputs.push(old);continue;}
    const response=await invoke(`generate/${c.id}/${repeat}`,{modelId:source.models.candidate,mode:source.modes.candidate,messages:modelInput(c,text,source.policy),settings:settingsForRole(source,'candidate'),compartmentId:source.compartmentId,endpoint:source.genaiEndpoint},evaluationValidator(c));
    let parsed=null;try{parsed=parseJSON(response.text);}catch(error){if(!response.evaluationError)throw error;}
    const checks=response.evaluationError?checkOutput(c,parsed):validateModelResponse(c,parsed),judges=[],judgeErrors=[];
    if(!response.evaluationError)for(let assessment=0;assessment<2;assessment++){
      const judged=await invoke(`judge/${c.id}/${repeat}/${assessment}`,{modelId:source.models.judge,mode:source.modes.judge,messages:judgeInput(c,parsed,assessment,source.policy,source.judgeTemplates),settings:settingsForRole(source,'judge'),compartmentId:source.compartmentId,endpoint:source.genaiEndpoint},evaluationValidator(c,parsed));
      if(judged.evaluationError)judgeErrors.push({assessment,error:judged.evaluationError,rawText:judged.text,trace:judged.trace});
      else judges.push({...validateJudge(parseJSON(judged.text),parsed),assessment});
    }
    const value={caseId:c.id,role:'candidate',repeat,response:parsed,checks,judges,judgeErrors,promptDigest:digest(text),caseFacts:c,latencyMs:response.latencyMs,usage:response.usage,trace:response.trace,
      ...(response.evaluationError?{error:response.evaluationError,rawText:response.text}:judgeErrors.length?{error:judgeErrors[0].error}:{})};
    await store.saveDoc({id,kind:'GEPA_OUTPUT',parentId:jobId,value});outputs.push({id,...value});
  }
  const assessments=outputs.map(o=>assessOutput(o));
  const executionErrors=outputs.reduce((n,o)=>n+(o.error?Math.max(1,o.judgeErrors?.length||0):0),0);
  const value={text,caseId:c.id,attempted:outputs.length===3,complete:outputs.length===3&&executionErrors===0&&outputs.every(o=>o.response&&o.judges.length===2),executionErrors,pass:assessments.every(a=>a.pass),critical:assessments.some(a=>a.critical||a.flagged),pending:assessments.some(a=>a.pending||a.disagreement),outputIds:outputs.map(o=>o.id),feedback:{facts:c,outputs:outputs.map(o=>({repeat:o.repeat,response:o.response,checks:o.checks,judges:o.judges,...(o.error?{error:o.error,rawText:o.rawText,judgeErrors:o.judgeErrors}:{} )}))}};
  await store.saveDoc({id:digest({jobId,text,caseId:c.id}),kind:'GEPA_EVALUATION',parentId:jobId,value});return value;
}

export async function optimizePrompt(snapshot,task,{isAlive=()=>true,signal}={}){
  assertOptimizer(snapshot);const source=snapshot.source;
  const guard=async()=>{if(!isAlive()||!await repository.heartbeat(task))throw Object.assign(new Error('GEPA job cancelled or worker lease lost'),{code:'LEASE_LOST'});};
  const invoke=createCallLedger({jobId:task.runId,cycle:task.cycle,maxCalls:snapshot.optimizer.limits.maxCalls,store:repository,guard,call:chat,writeTrace:(id,value)=>putJSON('gepa-traces',id,value),loadTrace:getJSON});
  let evaluated=0,proposed=0;
  const handle=async request=>{
    await guard();
    // Validate all proposed text on the Node side before any tested-model call.
    validateProposal({text:request.text,rationale:'GEPA development candidate validation.'},snapshot);
    if(request.operation==='evaluate'){
      if(!Array.isArray(request.caseIds)||!request.caseIds.length||new Set(request.caseIds).size!==request.caseIds.length||request.caseIds.some(id=>!source.dataset.cases.some(c=>c.id===id)))throw new Error('GEPA requested invalid development cases');
      if(evaluated+request.caseIds.length>snapshot.optimizer.limits.maxCaseEvaluations)throw new Error('GEPA case evaluation limit exceeded');
      evaluated+=request.caseIds.length;const rows=[];
      for(const id of request.caseIds){await guard();rows.push(await evaluateOptimizationCase({snapshot,jobId:task.runId,text:request.text,c:source.dataset.cases.find(c=>c.id===id),invoke}));}
      return{rows};
    }
    if(++proposed>snapshot.optimizer.limits.maxProposals)throw new Error('GEPA proposal limit exceeded');
    const messages=[{role:'SYSTEM',content:IMPROVEMENT_INSTRUCTIONS},{role:'USER',content:JSON.stringify({currentPrompt:request.text,immutablePolicy:source.policy,developmentFeedback:request.feedback})}];
    const response=await invoke(`propose/${proposed}`,{modelId:source.models.judge,mode:source.modes.judge,messages,settings:settingsForRole(source,'judge'),compartmentId:source.compartmentId,endpoint:source.genaiEndpoint},r=>validateProposal(parseJSON(r.text),snapshot));
    const proposal=validateProposal(parseJSON(response.text),snapshot),id=digest({jobId:task.runId,proposal:proposed,text:proposal.text});
    await repository.saveDoc({id,kind:'GEPA_CANDIDATE',parentId:task.runId,value:{...proposal,iteration:proposed,parentPromptDigest:digest(request.text)}});return{text:proposal.text};
  };
  const search=await runGepa({prompt:source.prompt,...snapshot.optimizer.plan,limits:snapshot.optimizer.limits},handle,{signal});
  await guard();const evaluations=await repository.docs('GEPA_EVALUATION',task.runId),validation=source.dataset.cases.filter(c=>snapshot.optimizer.plan.validationIds.includes(c.id));
  const selected=selectOptimizationCandidate(source.prompt,validation,evaluations);
  const artifact=await putJSON('gepa-results',task.runId,{search,selected,evaluations,limits:snapshot.optimizer.limits});
  const proposal=validateProposal({text:selected.text,rationale:selected.rationale},snapshot);
  const promptId=selected.changed?digest({proposal:task.id,text:selected.text}):source.promptId;
  if(selected.changed)await repository.saveDoc({id:promptId,kind:'PROMPT',parentId:source.promptId,version:`gepa-${task.id.slice(0,8)}`,value:{text:selected.text,generated:true,proposalId:task.id,diff:proposal.diff}});
  return{...proposal,promptId,changed:selected.changed,optimizer:'GEPA',optimizerVersion:search.version,artifact,selection:selected,search:{evaluated:search.evaluated,proposed:search.proposed,stopped:search.stopped},callAttempts:(await repository.docs('GEPA_CALL_START',task.runId)).length};
}
