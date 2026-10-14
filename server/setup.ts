import pg from 'pg';
import { bootstrapOwner, migrate } from './db.js';

if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {
  await migrate(pool);
  await bootstrapOwner(pool,process.env.OWNER_USERNAME,process.env.OWNER_PASSWORD);
  console.log('Database ready; owner exists. Demo catalog is not seeded automatically.');
} finally {await pool.end();}
