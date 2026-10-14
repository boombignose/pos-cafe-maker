import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool, PoolClient } from 'pg';
import { hashPassword, passwordSchema, usernameSchema } from './domain.js';

export async function transaction<T>(pool:Pool, work:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client=await pool.connect();
  try {await client.query('BEGIN'); const result=await work(client); await client.query('COMMIT'); return result;}
  catch(error) {await client.query('ROLLBACK'); throw error;}
  finally {client.release();}
}
export async function migrate(pool:Pool):Promise<void> {
  const sql=await readFile(new URL('./migration.sql',import.meta.url),'utf8');
  await transaction(pool,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':migrations',0))");
    const exists=await client.query("SELECT to_regclass(current_schema() || '.schema_migrations') AS present");
    if(exists.rows[0].present) {
      const applied=await client.query('SELECT version FROM schema_migrations WHERE version=1');
      if(!applied.rowCount) await client.query(sql);
    }else{
      await client.query(sql);
    }
    for(const [version,path] of [[2,'./migrations/002-shop.sql'],[3,'./migrations/003-recovery.sql']] as const){
      if(!(await client.query('SELECT 1 FROM schema_migrations WHERE version=$1',[version])).rowCount)
        await client.query(await readFile(new URL(path,import.meta.url),'utf8'));
    }
  });
}
export async function bootstrapOwner(pool:Pool, username?:string, password?:string):Promise<void> {
  await transaction(pool,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':users',0))");
    if((await client.query('SELECT 1 FROM users LIMIT 1')).rowCount) return;
    const validUsername=usernameSchema.parse(username), validPassword=passwordSchema.parse(password);
    await client.query("INSERT INTO users(id,username,password_hash,role) VALUES($1,$2,$3,'owner')",[randomUUID(),validUsername,await hashPassword(validPassword)]);
  });
}
