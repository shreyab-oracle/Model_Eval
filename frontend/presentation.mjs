export const categories={routine:'Matching invoices',tolerance:'Price limits',payment:'Payment controls',records:'Missing or conflicting records',pressure:'Supplier pressure'};
export const purpose=kind=>kind==='development'?'Practice test':kind==='improvement'?'Instruction improvement':'Final comparison';
export const dateLabel=value=>value?new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Calcutta'}):'Date unavailable';
export const testLabel=run=>purpose(run.kind)+' · '+dateLabel(run.createdAt);
export function modelName(value){
  if(!value||value.startsWith('ocid1.'))return 'Configured model';
  return value.replace(/^openai\./i,'').replace(/^gpt-/i,'GPT-').replace(/-mini$/i,' mini').replace(/^(google\.)?gemini-(\d+(?:\.\d+)?)-flash$/i,'Gemini $2 Flash');
}
export const promptLabel=p=>p?.version&&!/[a-f0-9]{8,}/i.test(p.version)?p.version:(p?.generated?'Suggested instructions':'Saved instructions');
export const caseLabel=(c,index)=>((Number.isInteger(index)?'Example '+(index+1)+' · ':'')+(categories[c.category]||'Invoice review'));
export const roleLabel=role=>role==='baseline'?'Current model':role==='candidate'?'New model':'AI reviewer';
export function stateLabel(value){return({DRAFT:'Ready to start',RUNNING:'In progress',COMPLETED:'Finished',INCOMPLETE:'Needs retry',CANCELLED:'Stopped',PENDING:'Waiting',DONE:'Finished',FAILED:'Processing problem',PASS:'Pass',FAIL:'Fail',APPROVED:'Approved',REJECTED:'Not approved'})[value]||value;}
export function visibleRunId(runs,previous=''){const visible=runs.filter(run=>run.kind!=='improvement');return visible.some(run=>run.id===previous)?previous:visible[0]?.id||'';}
export function shouldPollRun(bundle){return bundle?.run?.status==='RUNNING'||(bundle?.run?.status==='COMPLETED'&&(!bundle.run.reportId||bundle.artifactVerification?.verified!==true||bundle.artifactVerification?.mode==='pending'));}
const words={NO_MATCHING_EXCEPTION:'No matching problem found',RETAIN_HOLD:'Keep the invoice on hold',REQUEST_EVIDENCE:'Ask for missing information',UNKNOWN:'Not verified',VERIFIED_PAID:'Payment verified',VERIFIED_RELEASED:'Hold release verified',MISSING_PO:'Missing purchase order',MISSING_RECEIPT:'Missing receipt',DUPLICATE:'Duplicate invoice',OVER_ORDERED:'Billed quantity exceeds the order',OVER_RECEIVED:'Billed quantity exceeds the receipt',PRICE_TOLERANCE:'Price increase needs review',RECORD_CONFLICT:'Conflicting records'};
export function readable(value){
  if(typeof value!=='string')return value==null?'Not available':typeof value==='object'?'Unreadable value':String(value);
  if(words[value])return words[value];
  if(/Frozen evaluation engine differs|GEPA integration changed/.test(value))return 'This test was prepared before an application update. Prepare a new test.';
  if(/labels evidence approval is pending/.test(value))return 'A person must approve the example answers.';
  if(/calibration evidence approval is pending/.test(value))return 'A person must check the AI reviewer against reviewed examples.';
  if(/release evidence approval is pending/.test(value))return 'Final business approval is still needed.';
  return value.replace(/ocid1\.[\w.-]+/gi,'configured resource').replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,'saved record').replace(/\b[0-9a-f]{32,}\b/gi,'saved reference').replace(/\bOCI\b/g,'model service').replace(/\bOracle\b/g,'data service').replace(/\bObject Storage\b/g,'saved files').replace(/\bartifacts\b/gi,'saved results').replace(/\bmanifest\b/gi,'test settings').replace(/\bimmutable\b/gi,'saved').replaceAll('billedTotalCents','billed total (cents)').replaceAll('quantityDiscrepancy','quantity difference').replaceAll('discrepancyAmountCents','difference value (cents)').replaceAll('priceDeltaCents','price change (cents)').replace(/\b([A-Z]+(?:_[A-Z]+)+)\b/g,word=>words[word]||word.toLowerCase().replaceAll('_',' '));
}
export const ruleLabel=code=>({STRUCTURED_OUTPUT:'Answer format',ACTION:'Recommended action',HOLD_PRESERVATION:'Required invoice holds',MISSING_FACTS:'Missing information',PAYMENT_STATUS:'Payment evidence',RELEASE_STATUS:'Hold-release evidence',SOURCES:'Supporting records',OWNER:'Responsible team',NEXT_STEP:'Useful next step',REPLY:'Written reply',UNSUPPORTED_PAYMENT_CLAIM:'Unsupported payment claim',UNSUPPORTED_RELEASE_CLAIM:'Unsupported hold-release claim',BYPASS_LANGUAGE:'Pressure to ignore the rules'})[code]||(code?.startsWith('CALC_')?'Financial calculation':readable(code));
export function currentReport(value){if(value?.current!==true||!value.report)throw new Error('This report is out of date. Select Check and save report, then download it again.');return value.report;}
