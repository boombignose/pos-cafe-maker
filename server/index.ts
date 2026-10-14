import pg from 'pg';
import { createApp } from './app.js';
import { migrate } from './db.js';

if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; run npm run setup first');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:10});
pool.on('error',()=>console.error('Database connection lost'));
await migrate(pool);
const port=Number(process.env.PORT || 3001);
if(!Number.isInteger(port)||port<1||port>65535) throw new Error('PORT must be an integer from 1 to 65535');
const server=createApp(pool,{setupToken:process.env.SETUP_TOKEN}).listen(port,'0.0.0.0',()=>console.log(`POS server listening on port ${port}`));
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{
  server.close(()=>{void pool.end().then(()=>process.exit(0));});
});
