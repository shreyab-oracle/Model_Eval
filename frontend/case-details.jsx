import React from 'react';
import {Badge,money,when} from './components.jsx';
import {readable,ruleLabel} from './presentation.mjs';

export function CaseFacts({value}){
  if(!value)return <p>Case details are not available.</p>;
  const evidence=value.evidence||{};
  return <><div className="facts-grid">{[['What was ordered',value.po],['What arrived',value.receipt],['What was billed',value.invoice]].map(([label,record])=><div key={label}><span>{label}</span><strong>{record?record.quantity+' units':'Record missing'}</strong>{record?.unitCents!=null&&<p>{money(record.unitCents)} each</p>}</div>)}</div>
    {value.supplierMessage&&<><h3>Supplier message</h3><blockquote>{value.supplierMessage}</blockquote></>}
    <h3>Important facts</h3><ul><li>{evidence.duplicate?'This invoice is flagged as a duplicate.':'No duplicate flag supplied.'}</li><li>Existing holds: {evidence.activeHolds?.length?evidence.activeHolds.map(readable).join(', '):'None recorded'}</li><li>Supplier and currency match the order: {value.po&&value.invoice?(value.po.supplierId===value.invoice.supplierId&&value.po.currency===value.invoice.currency?'Yes':'No'):'Cannot compare without the order and invoice'}</li><li>Payment records supplied: {evidence.payments?.length||0}</li><li>Hold-release records supplied: {evidence.releases?.length||0}</li></ul>
    {!!evidence.conflicts?.length&&<><h3>Conflicting information</h3><ul>{evidence.conflicts.map((conflict,i)=><li key={i}>{readable(conflict)}</li>)}</ul></>}
    {[...(evidence.payments||[]),...(evidence.releases||[])].map((record,i)=>{
      const knownHolds=[...new Set([...(evidence.activeHolds||[]),...(evidence.historicalHoldIds||[])])];
      return <div key={i}><h3>Supporting record {i+1}</h3><p>{readable(record.status||'Status not supplied')} · {record.verified&&record.trusted?'Marked verified and trusted':'Not verified and trusted'}{Number.isFinite(record.amountCents)?' · '+money(record.amountCents)+' '+(record.currency||''):''}</p><ul><li>Matches this invoice: {record.invoiceId===value.invoice?.id?'Yes':'No'}</li><li>Matches invoice currency: {record.currency===value.invoice?.currency?'Yes':'No'}</li>{record.supplierId&&<li>Matches the supplier: {record.supplierId===value.invoice?.supplierId?'Yes':'No'}</li>}{Number.isFinite(record.amountCents)&&<li>Matches billed amount: {record.amountCents===value.invoice?.quantity*value.invoice?.unitCents?'Yes':'No'}</li>}<li>Source: {record.source==='AP_LEDGER'?'Accounts Payable ledger':readable(record.source||'Not supplied')}</li><li>{Number.isFinite(Date.parse(record.timestamp))?'Recorded '+when(record.timestamp):'Timestamp not supplied or unreadable'}</li>{Array.isArray(record.holdIds)&&<li>Known holds covered: {knownHolds.filter(id=>record.holdIds.includes(id)).length} of {knownHolds.length}. Unknown hold references: {record.holdIds.filter(id=>!knownHolds.includes(id)).length}</li>}</ul></div>;
    })}
  </>;
}
export function ModelAnswer({value,reference=false,modelContractFailure,rawText}){
  if(modelContractFailure||typeof value==='string'){
    const recordedText=typeof rawText==='string'?rawText:typeof value==='string'?value:JSON.stringify(value,null,2);
    return <><Badge tone="danger">Invalid answer format</Badge><p>This answer failed the required format check.</p>{modelContractFailure?.message&&<p>{readable(modelContractFailure.message)}</p>}<h3>Recorded model reply</h3><pre className="prompt-text">{recordedText}</pre></>;
  }
  if(!value)return <p>This answer is not available yet.</p>;
  return <><Badge>{readable(value.action)}</Badge>{!reference&&<div className="supplier-reply">{typeof value.reply==='string'?value.reply:'The reply field is missing or unreadable. See the answer format check below.'}</div>}
    <dl className="answer-details"><dt>Responsible team</dt><dd>{readable(value.owner)}</dd>{(!reference||value.nextStep)&&<><dt>Next step</dt><dd>{readable(value.nextStep)}</dd></>}<dt>Hold reasons</dt><dd>{Array.isArray(value.holdReasons)?value.holdReasons.map(readable).join(', ')||'None recommended':'Not available'}</dd><dt>{reference?'Expected payment status':'Model payment claim'}</dt><dd>{readable(value.paymentStatus)}</dd><dt>{reference?'Expected hold-release status':'Model hold-release claim'}</dt><dd>{readable(value.holdReleaseStatus)}</dd></dl>
    {value.calculations&&<div className="detail-pairs"><span>Billed total</span><strong>{money(value.calculations.billedTotalCents)}</strong><span>Quantity difference</span><strong>{value.calculations.quantityDiscrepancy??'Not enough information'}</strong><span>Value of difference</span><strong>{money(value.calculations.discrepancyAmountCents)}</strong></div>}
  </>;
}
export function RuleChecks({checks=[]}){return <ul className="checks">{checks.map((finding,i)=><li key={finding.code||i}><Badge>{finding.status}</Badge><span><strong>{ruleLabel(finding.code)}</strong><small>{readable(finding.message)}</small>{finding.status!=='PASS'&&<Badge tone={finding.severity==='critical'?'danger':'neutral'}>{finding.severity==='critical'?'Serious finding':'Finding'}{finding.confirmed?' · confirmed':' · needs review'}</Badge>}</span></li>)}</ul>;}
export function JudgeEvidence({judges=[]}){
  if(!judges.length)return <p>AI reviews are not available yet.</p>;
  const names={policy:'Follows the rules',evidence:'Uses verified facts',tone:'Respectful tone',clarity:'Clear explanation',nextSteps:'Useful next step'};
  return judges.map((judge,i)=><details key={judge.id||i} open><summary>AI review {i+1}{judge.critical?' · serious concern':''}</summary><div className="score-row">{Object.entries(names).map(([key,label])=><span key={key}>{label}<strong>{Number.isInteger(judge.scores?.[key])?judge.scores[key]+'/3':'Not available'}</strong></span>)}</div><p>{readable(judge.rationale)}</p>{(judge.evidence||[]).map((e,index)=><blockquote key={index}>“{e.quote}”<small>{readable(e.reason)}</small></blockquote>)}</details>);
}
