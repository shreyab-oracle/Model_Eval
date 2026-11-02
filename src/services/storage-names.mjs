import {withConnection} from '../db/pool.mjs';
import {listLegacyObjects,renameLegacyObject} from '../oracle/storage.mjs';

export async function renameStorageFiles({apply=false,onProgress=()=>{}}={}){
  const active=await withConnection(async c=>(await c.execute("SELECT 1 AS ACTIVE FROM AIE_RUNS WHERE status='RUNNING' FETCH FIRST 1 ROWS ONLY")).rows.length>0,{readOnly:true});
  if(active)throw new Error('Finish or stop running tests before renaming saved files');
  const objects=await listLegacyObjects();
  if(!apply)return{apply:false,files:objects.length,message:'Use --apply to rename these existing files. No tables or data copies are created.'};
  let next=0,done=0,failure;const examples=[];
  // Keep requests bounded and stop dispatching new work on the first error.
  const worker=async()=>{
    while(next<objects.length&&!failure){
      const object=objects[next++];
      try{
        const moved=await renameLegacyObject(object);done++;
        if(moved.key.includes('/invoice-examples/'))examples.push(moved.key);
        if(done%50===0||done===objects.length)onProgress({renamed:done,total:objects.length});
      }catch(error){failure=Object.assign(error,{file:object.name});}
    }
  };
  await Promise.all(Array.from({length:3},worker));
  if(failure){failure.message=`${done}/${objects.length} files renamed; rerun to continue. ${failure.file}: ${failure.message}`;throw failure;}
  return{renamed:done,remaining:(await listLegacyObjects()).length,invoiceExamples:examples};
}
