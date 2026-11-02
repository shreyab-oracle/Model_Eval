import {spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import {config} from '../src/config.mjs';
if(!fs.existsSync('node_modules/vite/bin/vite.js')){console.error('Frontend dependencies are missing. Run npm.cmd install --ignore-scripts from the project root.');process.exit(1);}
const apiPort=config.port,uiPort=5173,uiURL=`http://127.0.0.1:${uiPort}/`;
if(!Number.isInteger(apiPort)||apiPort<1||apiPort>65535){console.error('The configured API port must be an integer from 1 to 65535. No services were started.');process.exit(1);}
function portState(port){return new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});let settled=false;const finish=state=>{if(settled)return;settled=true;socket.destroy();resolve(state);};socket.setTimeout(750,()=>finish('unavailable'));socket.once('connect',()=>finish('occupied'));socket.once('error',error=>finish(error.code==='ECONNREFUSED'?'free':'unavailable'));});}
async function isOurAPI(){try{const response=await fetch(`http://127.0.0.1:${apiPort}/api/bootstrap`,{redirect:'error',signal:AbortSignal.timeout(4000)});if(!response.ok)return false;const data=await response.json();return ['datasets','prompts','policies','runs'].every(key=>Array.isArray(data?.[key]))&&['baseline','candidate','judge'].every(role=>typeof data.configuration?.models?.[role]==='string');}catch{return false;}}
async function isOurUI(){try{const response=await fetch(uiURL,{redirect:'error',signal:AbortSignal.timeout(4000)});if(!response.ok)return false;const html=await response.text();return /id=["']root["']/.test(html)&&/<title>AI Model Evaluation &amp; Upgrades<\/title>/.test(html);}catch{return false;}}
const [apiState,uiState]=await Promise.all([portState(apiPort),portState(uiPort)]);
if(apiState!=='free'||uiState!=='free'){
  const [apiMatches,uiMatches]=await Promise.all([apiState==='occupied'?isOurAPI():false,uiState==='occupied'?isOurUI():false]);
  if(apiMatches&&uiMatches){console.log(`AI Model Evaluation is already running: ${uiURL}`);console.log('Use the existing application. No additional workers were started.');process.exit(0);}
  for(const [name,port,state,matches] of [['API',apiPort,apiState,apiMatches],['UI',uiPort,uiState,uiMatches]])if(state!=='free')console.error(state==='occupied'?`${name} port ${port} is already in use${matches?' by this application':' by an unidentified service'}.`:`${name} port ${port} could not be checked within the startup timeout.`);
  console.error('No services were started. Reuse the running application, or stop the service using these ports before starting again.');process.exit(1);
}
const commands=[['API',['--env-file=.env.local','src/http/server.mjs']],['Worker',['--env-file=.env.local','src/services/worker.mjs']],['UI',['node_modules/vite/bin/vite.js','--host','127.0.0.1']]];
const children=commands.map(([name,args])=>{const child=spawn(process.execPath,args,{stdio:'inherit',windowsHide:true});child.on('error',e=>{console.error(`${name}: ${e.message}`);stop(1);});child.on('exit',code=>{if(!stopping&&code)stop(code);});return child;});
let stopping=false;function stop(code=0){if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');process.exitCode=code;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
