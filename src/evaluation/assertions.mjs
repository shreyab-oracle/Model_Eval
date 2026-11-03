import {observeModelAnswer} from '../services/model-answer.mjs';
import {parseJSON} from '../domain/checks.mjs';
import {AXES,validateJudge,judgePass} from '../domain/judge.mjs';

export function parseJudgeAssessment(text,response){
  try{return validateJudge(parseJSON(text),response);}
  catch(error){throw Object.assign(error,{code:'INVALID_JUDGE_ASSESSMENT'});}
}

export function invoiceAssertion(c){
  return{type:'javascript',value:text=>{
    const business=observeModelAnswer(c,text),checks=business.checks,pass=checks.every(c=>c.status==='PASS');
    return{pass,score:pass?1:0,reason:pass?'Invoice checks passed':'Invoice findings require the business gate',
      metadata:{business},componentResults:checks.map(check=>({pass:check.status==='PASS',score:check.status==='PASS'?1:0,
        reason:check.message,metadata:{finding:check}}))};
  }};
}

export function judgeAssertion(evaluatedOutput,state){
  return{type:'javascript',value:text=>{
    let assessmentResult;
    try{assessmentResult=parseJudgeAssessment(text,evaluatedOutput);}
    catch(error){state.error=error;return{pass:false,score:0,reason:error.message,metadata:{invalidJudgment:true}};}
    const pass=judgePass(assessmentResult);
    return{pass,score:pass?1:0,reason:assessmentResult.rationale,
      namedScores:Object.fromEntries(AXES.map(axis=>[axis,assessmentResult.scores[axis]])),
      metadata:{business:{assessmentResult}}};
  }};
}
