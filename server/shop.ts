import {z} from 'zod';
import type {Pool,PoolClient} from 'pg';
export const shopSchema=z.object({name:z.string().trim().min(1).max(120),address:z.string().trim().max(500),phone:z.string().trim().max(40),paper:z.enum(['58','80'])}).strict();
export async function settings(connection:Pool|PoolClient){
 return (await connection.query('SELECT name,address,phone,paper FROM shop_settings WHERE singleton=true')).rows[0] as z.infer<typeof shopSchema>;
}
export async function saveSettings(connection:Pool|PoolClient,input:z.infer<typeof shopSchema>){
 return (await connection.query('UPDATE shop_settings SET name=$1,address=$2,phone=$3,paper=$4 WHERE singleton=true RETURNING name,address,phone,paper',[input.name,input.address,input.phone,input.paper])).rows[0];
}
