import '../src/config.mjs';
import {verifyGepa} from '../src/optimization/bridge.mjs';
import {safeError} from '../src/config.mjs';
try{console.log(JSON.stringify(await verifyGepa(),null,2));}catch(e){console.error(JSON.stringify({error:safeError(e)}));process.exitCode=1;}
