import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {config,safeError} from '../config.mjs';
import {route} from './routes.mjs';
import {authorizeMutation} from './security.mjs';
const dist=path.resolve(fileURLToPath(new URL('../../dist',import.meta.url)));
export function makeServer(){
  const token=process.env.LOCAL_API_TOKEN||randomBytes(32).toString('hex');
  const allowedOrigins=[config.uiOrigin,`http://127.0.0.1:${config.port}`,`http://localhost:${config.port}`];
  return http.createServer(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
    try{
      if(![`127.0.0.1:${config.port}`,`localhost:${config.port}`].includes(req.headers.host))throw Object.assign(new Error('Invalid Host header'),{statusCode:403});
      const url=new URL(req.url,`http://127.0.0.1:${config.port}`);
      if(!url.pathname.startsWith('/api/')){
        if(!['GET','HEAD'].includes(req.method))throw Object.assign(new Error('Method not allowed'),{statusCode:405});
        const requested=path.resolve(dist,'.'+decodeURIComponent(url.pathname));if(!requested.startsWith(dist+path.sep)&&requested!==dist)throw Object.assign(new Error('Invalid path'),{statusCode:403});
        const file=fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:path.join(dist,'index.html');
        if(!fs.existsSync(file)){res.writeHead(200,{'content-type':'text/plain'});res.end('API is running. Start the frontend with npm run ui, or build it with npm run build.');return;}
        const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'content-type':mime,'x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);return;
      }
      let body={};if(req.method!=='GET'){
        authorizeMutation({origin:req.headers.origin,token:req.headers['x-local-token'],expectedToken:token,allowedOrigins});
        if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(new Error('JSON content type required'),{statusCode:415});
        let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>1024*1024)throw Object.assign(new Error('Request body exceeds 1 MiB'),{statusCode:413});}body=raw?JSON.parse(raw):{};
      }
      send(200,await route(req.method,url.pathname,body,token));
    }catch(e){send(e.statusCode>=400&&e.statusCode<600?e.statusCode:400,{error:safeError(e)});}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=makeServer();server.listen(config.port,config.host,()=>console.log(`AI Model Evaluation API: http://${config.host}:${config.port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
