import {config,safeError} from '../config.mjs';
import {canonical,digest} from '../domain/policy.mjs';
import {readableFileKey,storagePrefix,legacyFileKinds} from '../domain/file-names.mjs';
import {fileLocations} from '../db/file-locations.mjs';
import {ociRequest} from './auth.mjs';

export function createStorage({storage=config.storage,request=ociRequest,locations=fileLocations}={}){
  const prefix=storagePrefix(storage.prefix);
  const bucketURL=()=>{
    if(!storage.region||!storage.namespace||!storage.bucket)throw new Error('Object Storage region, namespace and existing bucket are required');
    return`https://objectstorage.${storage.region}.oraclecloud.com/n/${encodeURIComponent(storage.namespace)}/b/${encodeURIComponent(storage.bucket)}`;
  };
  const checkKey=key=>{if(typeof key!=='string'||!key.startsWith(prefix)||key.split('/').some(p=>p==='..'||p==='.'))throw new Error('Artifact outside configured application prefix');};
  const read=async key=>{
    checkKey(key);
    for(let attempt=0;attempt<2;attempt++){
      try{return await request('GET',`${bucketURL()}/o/${encodeURIComponent(key)}`);}
      catch(error){
        const transient=['ECONNRESET','ECONNABORTED','ETIMEDOUT','EAI_AGAIN'].includes(error.code)||[408,429,500,502,503,504].includes(error.statusCode);
        if(attempt||!transient)throw error;
        console.error(JSON.stringify({event:'artifact-read-retry',attempt:attempt+1,error:safeError(error)}));
        await new Promise(resolve=>setTimeout(resolve,500));
      }
    }
  };
  const verify=(value,hash,key)=>{if(digest(value)!==hash)throw Object.assign(new Error(`Object digest mismatch: ${key}`),{code:'ARTIFACT_DIGEST_MISMATCH'});return value;};
  const checkLocation=(location,sourceKey,hash)=>{
    if(location.sourceKey!==sourceKey||location.contentDigest!==hash)throw new Error('File location digest mismatch');
    checkKey(location.key);return location;
  };
  async function getJSON(artifact){
    if(!artifact?.key||!artifact.digest)throw new Error('Artifact key and digest are required');
    checkKey(artifact.key);let response;
    const legacy=legacyFileKinds.has(artifact.key.slice(prefix.length).split('/')[0]);
    const location=legacy?await locations.find(artifact.key):null;
    if(location){
      checkLocation(location,artifact.key,artifact.digest);
      let relocationError;
      try{return verify((await read(location.key)).data,artifact.digest,artifact.key);}
      catch(error){
        if(error.statusCode!==404&&error.code!=='ARTIFACT_DIGEST_MISMATCH')throw error;
        relocationError=error;
      }
      // A reservation can exist before a refused/interrupted move. The original
      // remains valid until the rename succeeds; never trust an occupied target.
      try{return verify((await read(artifact.key)).data,artifact.digest,artifact.key);}
      catch(error){if(error.statusCode===404&&relocationError.code==='ARTIFACT_DIGEST_MISMATCH')throw relocationError;throw error;}
    }
    try{response=await read(artifact.key);}
    catch(error){
      if(error.statusCode!==404)throw error;
      const location=await locations.find(artifact.key);if(!location)throw error;
      checkLocation(location,artifact.key,artifact.digest);response=await read(location.key);
    }
    return verify(response.data,artifact.digest,artifact.key);
  }
  async function putJSON(kind,id,value){
    if(!/^[a-zA-Z0-9_-]+$/.test(kind)||typeof id!=='string'||!id||/[\\/]/.test(id))throw new Error('Invalid artifact identity');
    const hash=digest(value),sourceKey=`${prefix}${kind}/${id}/${hash}.json`;
    const location=checkLocation(await locations.reserve(sourceKey,hash,n=>readableFileKey(prefix,kind,value,n)),sourceKey,hash);
    const r=await request('PUT',`${bucketURL()}/o/${encodeURIComponent(location.key)}`,{body:canonical(value),headers:{'if-none-match':'*'}}).catch(async error=>{
      if(error.statusCode!==412)throw error;
      verify((await read(location.key)).data,hash,location.key);return{headers:{etag:null}};
    });
    return{key:location.key,digest:hash,etag:r.headers.etag||null,...storage};
  }
  async function listLegacyObjects(){
    const objects=[];let start;
    do{
      const url=new URL(`${bucketURL()}/o`);url.searchParams.set('prefix',prefix);url.searchParams.set('fields','name,etag,timeCreated');
      if(start)url.searchParams.set('start',start);
      const r=await request('GET',url.href);objects.push(...r.data.objects.filter(o=>legacyFileKinds.has(o.name.slice(prefix.length).split('/')[0])));
      if(r.data.nextStartWith===start&&start)throw new Error('Object listing repeated its pagination cursor');start=r.data.nextStartWith;
    }while(start);
    return objects.sort((a,b)=>(a.name.includes('/datasets/')?0:1)-(b.name.includes('/datasets/')?0:1)||a.name.localeCompare(b.name));
  }
  async function renameLegacyObject({name}){
    checkKey(name);const kind=name.slice(prefix.length).split('/')[0];
    if(!legacyFileKinds.has(kind))throw new Error('Only original application file locations can be renamed');
    let original;
    try{original=await read(name);}
    catch(error){
      if(error.statusCode!==404)throw error;
      const location=await locations.find(name);if(!location)throw error;
      checkLocation(location,name,location.contentDigest);verify((await read(location.key)).data,location.contentDigest,location.key);return location;
    }
    const hash=digest(original.data),namedHash=name.match(/\/([a-f0-9]{64})\.json$/)?.[1];
    if(namedHash)verify(original.data,namedHash,name);
    const location=checkLocation(await locations.reserve(name,hash,n=>readableFileKey(prefix,kind,original.data,n)),name,hash);
    if(!original.headers.etag)throw new Error('Source ETag is required before renaming evidence');
    await request('POST',`${bucketURL()}/actions/renameObject`,{body:{sourceName:name,newName:location.key,srcObjIfMatchETag:original.headers.etag,newObjIfNoneMatchETag:'*'}});
    verify((await read(location.key)).data,hash,location.key);return location;
  }
  async function bucketStatus(){const r=await request('GET',bucketURL());return{name:r.data.name,region:storage.region,versioning:r.data.versioning,publicAccessType:r.data.publicAccessType};}
  return{putJSON,getJSON,bucketStatus,listLegacyObjects,renameLegacyObject};
}
export const {putJSON,getJSON,bucketStatus,listLegacyObjects,renameLegacyObject}=createStorage();
