// Human-readable locations are independent of immutable evidence fingerprints.
const folders={
  datasets:['invoice-examples','invoice-examples'],
  snapshots:['test-settings','settings'],
  reports:['test-reports','report'],
  traces:['model-conversations','conversation'],
  'error-traces':['processing-errors','error'],
  'improvement-snapshots':['instruction-improvement/settings','search-settings'],
  'gepa-traces':['instruction-improvement/conversations','conversation'],
  'gepa-results':['instruction-improvement/results','search-result'],
  '_verification':['diagnostics/connections','connection-check'],
  smoke:['diagnostics/model-connections','model-check'],
  'smoke-reports':['diagnostics/model-connections','check-report'],
  'protocol-diagnostics':['diagnostics/response-format','format-check'],
  'gepa-diagnostics':['diagnostics/instruction-improvement','search-check'],
  'gepa-diagnostic-traces':['diagnostics/instruction-improvement/conversations','conversation'],
};
export const legacyFileKinds=new Set(Object.keys(folders));
export const storagePrefix=prefix=>`${prefix.replace(/\/+$/,'')}/`;
const slug=value=>String(value).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'version';
export function readableFileKey(prefix,kind,value,number){
  if(!Number.isSafeInteger(number)||number<1)throw new Error('A positive file number is required');
  const [folder,label]=folders[kind]||['diagnostics/other','record'];
  let name=`${label}-${number}`;
  if(kind==='datasets'){
    const version=slug(value.version).replace(/^(release|development)-/,'');
    const title=value.kind==='release'?'final-test':value.kind==='development'?'practice':'invoice-examples';
    name=`${title}-${version}-${value.cases?.length||0}-cases-file-${number}`;
  }
  return`${storagePrefix(prefix)}${folder}/${name}.json`;
}
