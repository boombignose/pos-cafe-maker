import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { transaction } from './db.js';
import { canonicalHash, requireCondition, type Checkout, type Menu, type Recipe } from './domain.js';
import {settings} from './shop.js';

type User = {id:string;username:string;role:'owner'|'cashier'|'bar'};
export function ingredient(row:any) {return {id:row.id,name:row.name,unit:row.unit,stock:row.stock,lowStock:row.low_stock};}
export function menu(row:any):Menu {return {id:row.id,name:row.name,category:row.category,priceSatang:Number(row.price_satang),active:row.active,recipe:row.recipe,options:row.options};}
export function shift(row:any) {return row ? {id:row.id,openingCashSatang:Number(row.opening_cash_satang),expectedCashSatang:Number(row.expected_cash_satang),openedAt:row.opened_at,closedAt:row.closed_at,countedCashSatang:row.counted_cash_satang===null?null:Number(row.counted_cash_satang),differenceSatang:row.difference_satang===null?null:Number(row.difference_satang)} : null;}
export function order(row:any) {return {id:row.id,queueNumber:row.queue_number,status:row.status,totalSatang:Number(row.total_satang),changeSatang:Number(row.change_satang),paymentMethod:row.payment_method,createdAt:new Date(row.created_at).toISOString(),shop:row.shop,items:row.items.map((item:any)=>({name:item.name,quantity:item.quantity,unitPriceSatang:item.unitPriceSatang,options:item.options}))};}
export async function catalog(pool:Pool) {
  const [menus,ingredients]=await Promise.all([pool.query('SELECT * FROM menus ORDER BY category,name,id'),pool.query('SELECT * FROM ingredients ORDER BY name,id')]);
  return {menus:menus.rows.map(menu),ingredients:ingredients.rows.map(ingredient)};
}
async function idempotent(client:PoolClient, operation:string, key:string, user:User, body:unknown, work:()=>Promise<unknown>) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${operation}:${key}`]);
  const hash=canonicalHash(body);
  const existing=(await client.query('SELECT * FROM idempotency WHERE operation=$1 AND key=$2',[operation,key])).rows[0];
  if(existing) {
    requireCondition(existing.user_id===user.id && existing.body_hash===hash,409,'IDEMPOTENCY_CONFLICT','Idempotency key already belongs to another request');
    return existing.response;
  }
  const response=await work();
  await client.query('INSERT INTO idempotency(operation,key,body_hash,user_id,response) VALUES($1,$2,$3,$4,$5)',[operation,key,hash,user.id,JSON.stringify(response)]);
  return response;
}
export async function validateMenu(client:PoolClient, input:Omit<Menu,'id'>) {
  const recipes=[...input.recipe,...input.options.flatMap(option=>option.recipe)];
  const ids=[...new Set(recipes.map(row=>row.ingredientId))];
  if(ids.length) {
    const found=await client.query('SELECT id FROM ingredients WHERE id=ANY($1::uuid[])',[ids]);
    requireCondition(found.rowCount===ids.length,400,'INVALID_RECIPE','Recipe refers to an unknown ingredient');
  }
  const negatives=await client.query('SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS r(quantity numeric) WHERE quantity<0 LIMIT 1',[JSON.stringify(input.recipe)]);
  requireCondition(!negatives.rowCount,400,'INVALID_RECIPE','Base recipes must not contain negative quantities');
}
async function sumRecipe(client:PoolClient, recipes:Recipe, multiplier:number):Promise<Recipe> {
  const result=await client.query('SELECT r."ingredientId", (sum(r.quantity)*$2::numeric)::text AS quantity FROM jsonb_to_recordset($1::jsonb) AS r("ingredientId" uuid,quantity numeric) GROUP BY r."ingredientId" ORDER BY r."ingredientId"',[JSON.stringify(recipes),multiplier]);
  return result.rows;
}
async function lockStock(client:PoolClient, consumption:Recipe) {
  const rows=await client.query('SELECT id FROM ingredients WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[consumption.map(row=>row.ingredientId)]);
  requireCondition(rows.rowCount===consumption.length,400,'INVALID_RECIPE','An ingredient is missing');
}
async function moveStock(client:PoolClient, rows:Recipe, user:User, reason:string, orderId:string|null, restore=false) {
  await lockStock(client,rows);
  for(const row of rows) {
    const updated=await client.query(`UPDATE ingredients SET stock=stock ${restore?'+':'-'} $2::numeric WHERE id=$1 AND stock ${restore?'+':'-'} $2::numeric >=0 RETURNING id`,[row.ingredientId,row.quantity]);
    requireCondition(updated.rowCount,409,'INSUFFICIENT_STOCK','Insufficient ingredient stock');
    await client.query(`INSERT INTO stock_movements(id,ingredient_id,quantity,reason,user_id,order_id) VALUES($1,$2,${restore?'':'-'}$3::numeric,$4,$5,$6)`,[randomUUID(),row.ingredientId,row.quantity,reason,user.id,orderId]);
  }
}
export async function checkout(pool:Pool, user:User, input:Checkout) {
  return transaction(pool,client=>idempotent(client,'checkout',input.idempotencyKey,user,input,async()=>{
    const activeShift=(await client.query('SELECT * FROM shifts WHERE closed_at IS NULL FOR UPDATE')).rows[0];
    requireCondition(activeShift,409,'NO_OPEN_SHIFT','Open a shift before accepting payment');
    const ids=[...new Set(input.items.map(item=>item.menuId))];
    const menus=(await client.query('SELECT * FROM menus WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE',[ids])).rows.map(menu);
    const snapshots:any[]=[];
    const rawConsumption:Recipe=[];
    let total=0;
    for(const item of input.items) {
      const selectedMenu=menus.find(menu=>menu.id===item.menuId);
      requireCondition(selectedMenu?.active,400,'MENU_UNAVAILABLE','A selected menu is unavailable');
      requireCondition(new Set(item.optionIds).size===item.optionIds.length,400,'INVALID_OPTIONS','Duplicate option choices');
      const options=item.optionIds.map(id=>selectedMenu.options.find(option=>option.id===id));
      requireCondition(options.every(Boolean),400,'INVALID_OPTIONS','An option is unavailable');
      const chosen=options as Menu['options'];
      const groups=[...new Set(selectedMenu.options.map(option=>option.group))];
      requireCondition(groups.every(group=>chosen.filter(option=>option.group===group).length===1),400,'INVALID_OPTIONS','Choose exactly one option in every group');
      const unitPriceSatang=selectedMenu.priceSatang+chosen.reduce((sum,option)=>sum+option.priceSatang,0);
      total+=unitPriceSatang*item.quantity;
      requireCondition(Number.isSafeInteger(total)&&total<=1_000_000_000,400,'TOTAL_TOO_LARGE','Order amount is too large');
      const perCup=await sumRecipe(client,[...selectedMenu.recipe,...chosen.flatMap(option=>option.recipe)],1);
      const negative=await client.query('SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS r(quantity numeric) WHERE quantity<0 LIMIT 1',[JSON.stringify(perCup)]);
      requireCondition(!negative.rowCount,400,'NEGATIVE_CONSUMPTION','Options may replace a recipe but cannot create negative consumption');
      rawConsumption.push(...await sumRecipe(client,perCup,item.quantity));
      snapshots.push({menuId:selectedMenu.id,name:selectedMenu.name,quantity:item.quantity,unitPriceSatang,options:chosen.map(option=>option.name),recipe:perCup});
    }
    requireCondition(input.amountTenderedSatang>=total,400,'UNDERPAID','Payment does not cover the order');
    if(input.paymentMethod==='transfer') requireCondition(input.transferConfirmed && input.amountTenderedSatang===total,400,'UNCONFIRMED_TRANSFER','Confirm receipt of the exact transfer amount');
    const consumption=await sumRecipe(client,rawConsumption,1);
    const day=(await client.query("SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
    const queue=(await client.query('INSERT INTO queues(day,last_number) VALUES($1,1) ON CONFLICT(day) DO UPDATE SET last_number=queues.last_number+1 RETURNING last_number',[day])).rows[0].last_number;
    const id=randomUUID(), change=input.paymentMethod==='cash'?input.amountTenderedSatang-total:0;
    const inserted=(await client.query('INSERT INTO orders(id,user_id,shift_id,day,queue_number,total_satang,amount_tendered_satang,change_satang,payment_method,items,consumption,shop) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[id,user.id,activeShift.id,day,queue,total,input.amountTenderedSatang,change,input.paymentMethod,JSON.stringify(snapshots),JSON.stringify(consumption),JSON.stringify(await settings(client))])).rows[0];
    await moveStock(client,consumption,user,'Paid sale',id);
    if(input.paymentMethod==='cash') await client.query('UPDATE shifts SET expected_cash_satang=expected_cash_satang+$2 WHERE id=$1',[activeShift.id,total]);
    return order(inserted);
  }));
}
export async function refund(pool:Pool,user:User,id:string,input:{reason:string;idempotencyKey:string}) {
  return transaction(pool,client=>idempotent(client,'refund',input.idempotencyKey,user,{id,...input},async()=>{
    // Lock the original shift before the order: checkout/close/refund share this lock order.
    const found=(await client.query('SELECT shift_id FROM orders WHERE id=$1',[id])).rows[0];
    requireCondition(found,400,'ORDER_NOT_FOUND','Order not found');
    await client.query('SELECT id FROM shifts WHERE id=$1 FOR UPDATE',[found.shift_id]);
    const paid=(await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
    requireCondition(paid.status!=='refunded',409,'ALREADY_REFUNDED','Order has already been refunded');
    const restore=paid.status==='queued';
    if(restore) await moveStock(client,paid.consumption,user,'Queued order refund',id,true);
    if(paid.payment_method==='cash') await client.query('UPDATE shifts SET expected_cash_satang=expected_cash_satang-$2, difference_satang=CASE WHEN closed_at IS NOT NULL THEN counted_cash_satang-(expected_cash_satang-$2) ELSE NULL END WHERE id=$1',[paid.shift_id,paid.total_satang]);
    await client.query('INSERT INTO refunds(order_id,user_id,reason,restocked) VALUES($1,$2,$3,$4)',[id,user.id,input.reason,restore]);
    const updated=(await client.query("UPDATE orders SET status='refunded' WHERE id=$1 RETURNING *",[id])).rows[0];
    return order(updated);
  }));
}
export async function report(pool:Pool,date:string) {
  return transaction(pool,async client=>{
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const summary=(await client.query(`WITH sales AS (
    SELECT coalesce(sum(total_satang),0) AS sales,coalesce(sum(total_satang) FILTER(WHERE payment_method='cash'),0) AS cash,coalesce(sum(total_satang) FILTER(WHERE payment_method='transfer'),0) AS transfer,count(*) AS count FROM orders WHERE day=$1::date
  ), returned AS (
    SELECT coalesce(sum(o.total_satang),0) AS refunds,coalesce(sum(o.total_satang) FILTER(WHERE o.payment_method='cash'),0) AS cash,coalesce(sum(o.total_satang) FILTER(WHERE o.payment_method='transfer'),0) AS transfer FROM refunds r JOIN orders o ON o.id=r.order_id WHERE (r.created_at AT TIME ZONE 'Asia/Bangkok')::date=$1::date
  ) SELECT sales.sales-returned.refunds AS total,sales.cash-returned.cash AS cash,sales.transfer-returned.transfer AS transfer,returned.refunds,sales.count FROM sales,returned`,[date])).rows[0];
  const best=(await client.query(`SELECT item->>'name' AS name,sum((item->>'quantity')::integer)::integer AS quantity,sum((item->>'quantity')::bigint*(item->>'unitPriceSatang')::bigint) AS total FROM orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) item WHERE day=$1::date AND status<>'refunded' GROUP BY item->>'name' ORDER BY quantity DESC,name`,[date])).rows;
  const low=(await client.query('SELECT * FROM ingredients WHERE stock<=low_stock ORDER BY name,id')).rows;
  return {totalSatang:Number(summary.total),cashSatang:Number(summary.cash),transferSatang:Number(summary.transfer),refundSatang:Number(summary.refunds),orderCount:Number(summary.count),bestSellers:best.map(row=>({name:row.name,quantity:row.quantity,totalSatang:Number(row.total)})),lowStock:low.map(ingredient)};
  });
}
