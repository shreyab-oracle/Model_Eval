import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest} from '../domain/policy.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const pythonPath=()=>process.env.GEPA_PYTHON||path.join(root,'.local','gepa-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
export const OPTIMIZER_DIGEST=digest(Object.fromEntries(['bridge.mjs','ledger.mjs','engine.mjs','../domain/optimization.mjs','../services/prompts.mjs','../../python/gepa_runner.py'].map(f=>[f,fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')])));
export function assertOptimizer(snapshot){if(snapshot.optimizer?.digest!==OPTIMIZER_DIGEST)throw new Error('GEPA integration changed; create a new optimization job rather than mixing implementations');}
export function runGepa(input,handle,{python=pythonPath(),timeoutMs=3600000,signal,verify=false}={}){
  return new Promise((resolve,reject)=>{
    const env=Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
    Object.assign(env,{PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1'});
    const child=spawn(python,['-u',path.join(root,'python/gepa_runner.py'),...(verify?['--verify']:[])],{cwd:root,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let buffer='',stderr='',result,failed,settled=false,chain=Promise.resolve();
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error){child.kill();reject(error);}else resolve(result);};
    const abort=()=>finish(Object.assign(new Error('GEPA subprocess cancelled'),{code:'GEPA_CANCELLED'}));
    const timer=setTimeout(()=>finish(Object.assign(new Error('GEPA subprocess timed out'),{code:'GEPA_TIMEOUT'})),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    child.on('error',e=>finish(Object.assign(new Error(`GEPA Python dependency: ${e.message}. Run the GEPA setup instructions.`),{code:e.code})));
    child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-16000);});
    child.stdin.on('error',e=>{if(!settled)failed=e;});
    child.stdout.on('data',data=>{
      buffer+=data.toString();if(buffer.length>2*1024*1024){finish(new Error('GEPA protocol message exceeds 2 MiB'));return;}
      let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);
        chain=chain.then(async()=>{if(settled)return;const message=JSON.parse(line);
          if(verify){result=message;return;}
          if(message.type==='done'){result=message.result;return;}
          if(message.type==='error'){failed=new Error(message.error);return;}
          if(message.type!=='request'||!Number.isInteger(message.id)||!['evaluate','propose'].includes(message.operation))throw new Error('Invalid GEPA subprocess message');
          try{if(failed)throw failed;const value=await handle(message);if(!settled)child.stdin.write(JSON.stringify({id:message.id,result:value})+'\n');}
          catch(e){failed=e;if(!settled)child.stdin.write(JSON.stringify({id:message.id,error:e.message})+'\n');}
        }).catch(e=>finish(e));
      }
    });
    child.on('close',code=>{chain.then(()=>finish(failed||(!result||code!==0?new Error(`GEPA exited ${code}: ${stderr||'no result returned'}`):null)));});
    if(!verify&&!settled)child.stdin.write(JSON.stringify(input)+'\n');
  });
}
export const verifyGepa=()=>runGepa(null,null,{verify:true,timeoutMs:15000});
