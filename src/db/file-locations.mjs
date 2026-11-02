import {repository} from './repository.mjs';
import {withConnection} from './pool.mjs';
import {config} from '../config.mjs';
import {digest} from '../domain/policy.mjs';

// Reuse AIE_DOCUMENTS; only a sequence is added to issue short unique numbers.
const locationId=sourceKey=>digest({operation:'file-location',region:config.storage.region,namespace:config.storage.namespace,bucket:config.storage.bucket,sourceKey});
export const fileLocations={
  async find(sourceKey){
    const doc=await repository.doc(locationId(sourceKey));
    if(!doc)return null;
    if(doc.kind!=='FILE_LOCATION'||doc.sourceKey!==sourceKey)throw new Error('Invalid saved file location');
    return doc;
  },
  async reserve(sourceKey,contentDigest,makeKey){
    const old=await this.find(sourceKey);if(old){if(old.contentDigest!==contentDigest)throw new Error('File location digest mismatch');return old;}
    const number=await withConnection(async c=>(await c.execute('SELECT AIE_FILE_NUMBER.NEXTVAL AS N FROM dual')).rows[0].N);
    const id=locationId(sourceKey),value={sourceKey,key:makeKey(number),contentDigest,fileNumber:number};
    try{await repository.saveDoc({id,kind:'FILE_LOCATION',value});}
    catch(error){
      // Resolve concurrent reservations or an uncertain commit by reading the
      // immutable record, never by replaying or replacing a write.
      const saved=await this.find(sourceKey);
      if(!saved||saved.contentDigest!==contentDigest)throw error;
      return saved;
    }
    return{id,...value};
  }
};
