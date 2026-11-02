// Read-only setup diagnostic using the application's driver and connection pool.
import fs from 'node:fs';
import path from 'node:path';
import {withConnection,getDriver,closePool} from '../src/db/pool.mjs';
import {required,safeError} from '../src/config.mjs';

const report={checkedAt:new Date().toISOString(),diagnostic:'database',sqlLoginVerified:false,applicationDataChanged:false};
try{
  const walletDir=path.resolve(required('DB_WALLET_DIR'));
  for(const name of ['tnsnames.ora','ewallet.pem'])if(!fs.existsSync(path.join(walletDir,name)))throw new Error(`Missing wallet file: ${name}`);
  const driver=getDriver();report.driverVersion=driver.versionString;report.thinMode=driver.thin;
  await withConnection(async connection=>{
    const ping=await connection.execute('SELECT 1 AS OK, USER AS SCHEMA_NAME FROM dual');
    report.sqlLoginVerified=ping.rows[0].OK===1;report.schema=ping.rows[0].SCHEMA_NAME;report.databaseVersion=connection.oracleServerVersionString;
    const privileges=await connection.execute("SELECT privilege FROM session_privs WHERE privilege IN ('CREATE SESSION', 'CREATE TABLE', 'CREATE SEQUENCE', 'UNLIMITED TABLESPACE') ORDER BY privilege");
    report.sessionPrivileges=privileges.rows.map(row=>row.PRIVILEGE);
    const quotas=await connection.execute('SELECT tablespace_name, bytes, max_bytes FROM user_ts_quotas ORDER BY tablespace_name');
    report.tablespaceQuotas=quotas.rows;
    report.migrationPrerequisitesReported=report.sessionPrivileges.includes('CREATE TABLE')&&report.sessionPrivileges.includes('CREATE SEQUENCE')&&(report.sessionPrivileges.includes('UNLIMITED TABLESPACE')||quotas.rows.some(row=>row.MAX_BYTES===-1||row.MAX_BYTES>row.BYTES));
    report.note='This diagnostic performs read-only SQL; it does not apply migrations or change application data.';
  });
}catch(error){report.error={...safeError(error),errorNum:error.errorNum};process.exitCode=1;}
finally{
  try{await closePool();}catch(error){report.cleanupError=safeError(error);process.exitCode=1;}
  console.log(JSON.stringify(report,null,2));
}
