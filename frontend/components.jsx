import React,{useId} from 'react';
import {stateLabel} from './presentation.mjs';
export const percent=n=>Number.isFinite(n)?`${(n*100).toFixed(1)}%`:'—';
export const money=n=>Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100):'Unknown';
export const when=s=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Calcutta'}):'—';
export function Badge({children,tone}){const text=value=>Array.isArray(value)?value.map(text).join(''):value&&typeof value==='object'?'Not available':value??'',raw=text(children),display=stateLabel(raw);const t=tone||(/BLOCK|critical|FAIL|FAILED/i.test(String(raw))?'danger':/ELIGIBLE|PASS|APPROVED|COMPLETED|Connected/i.test(String(raw))?'success':'neutral');return <span className={`badge ${t}`}>{display}</span>;}
export function Button({children,secondary=false,danger=false,...props}){return <button className={`button ${secondary?'secondary':''} ${danger?'danger-button':''}`} {...props}>{children}</button>;}
export function Card({title,children,className=''}){return <section className={`card ${className}`}>{title&&<h2>{title}</h2>}{children}</section>;}
export function Field({label,children,hint}){const id=useId();return <div className="field"><label htmlFor={id}>{label}</label>{React.cloneElement(children,{id})}{hint&&<small>{hint}</small>}</div>;}
export function Empty({title,children}){return <div className="empty"><div className="empty-mark">◇</div><h2>{title}</h2><p>{children}</p></div>;}
export function Metric({label,value,note}){return <div className="metric"><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div>;}
