import fs from 'node:fs';
import {digest} from './policy.mjs';
const rules=['policy.mjs','checks.mjs','judge.mjs','decision.mjs'];
const files=[...rules,'../oracle/genai.mjs','model-settings.mjs'];
export const ENGINE_DIGEST=digest(Object.fromEntries(files.map(file=>[file,fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/\r\n/g,'\n')])));
export function assertFrozenEngine(snapshot){
  if(snapshot.engineDigest!==ENGINE_DIGEST)throw Object.assign(new Error('Frozen evaluation engine differs from this application version. Create a new run; do not mix evaluator versions during resume.'),{code:'ENGINE_VERSION_MISMATCH'});
  if(!Array.isArray(snapshot.judgeTemplates)||snapshot.judgeTemplates.length!==2||digest(snapshot.judgeTemplates)!==snapshot.judgeTemplateDigest)throw new Error('Frozen judge instructions are missing or corrupt');
}
