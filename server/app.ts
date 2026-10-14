import express, { type RequestHandler } from 'express';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { transaction } from './db.js';
import { ApiError, requireCondition, passwordSchema, usernameSchema, roleSchema, nameSchema, decimalSchema, moneySchema, menuSchema, checkoutSchema, hashPassword, verifyPassword, digest, csvCell } from './domain.js';
import { catalog, menu, ingredient, shift, order, checkout, refund, report, validateMenu } from './pos.js';

const publicUser=(row:any)=>({id:row.id,username:row.username,role:row.role,active:row.active});
const cookieName='pos_session';
const userUpdate=z.object({password:passwordSchema.optional(),role:roleSchema.optional(),active:z.boolean().optional()}).strict().refine(input=>Object.keys(input).length>0);
const ingredientInput=z.object({name:nameSchema,unit:nameSchema,lowStock:decimalSchema}).strict();
const refundInput=z.object({reason:nameSchema,idempotencyKey:z.string().min(8).max(128)}).strict();

export function createApp(pool:Pool) {
  const app=express();
  app.disable('x-powered-by');
  app.use((_req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin'}); next();});
  app.use(express.json({limit:'256kb'}));
  app.get('/api/health',async (_req,res)=>{await pool.query('SELECT 1');res.json({ok:true});});
  app.use('/api',async (req,res,next)=>{
    res.set('Cache-Control','no-store');
    const token=req.headers.cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(token && /^[a-f0-9]{64}$/.test(token)) {
      const found=(await pool.query('SELECT s.token_digest,s.csrf_token,u.id,u.username,u.role,u.active FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.token_digest=$1 AND s.expires_at>now() AND (u.id IS NULL OR u.active=true)',[digest(token)])).rows[0];
      if(found) {res.locals.session=found; res.locals.user=found.id?publicUser(found):null;}
    }
    if(['POST','PATCH','PUT','DELETE'].includes(req.method)) {
      const expected=process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
      requireCondition(req.get('origin')===expected,403,'INVALID_ORIGIN','Write requests must originate from this site');
      const provided=Buffer.from(req.get('x-csrf-token') || ''), stored=Buffer.from(res.locals.session?.csrf_token || '');
      requireCondition(stored.length>0 && provided.length===stored.length && timingSafeEqual(provided,stored),403,'INVALID_CSRF','Session CSRF token required');
    }
    next();
  });
  async function newSession(res:express.Response,userId:string|null, connection:Pool|PoolClient=pool) {
    const token=randomBytes(32).toString('hex'),csrfToken=randomBytes(32).toString('hex');
    await connection.query('INSERT INTO sessions(token_digest,user_id,csrf_token) VALUES($1,$2,$3)',[digest(token),userId,csrfToken]);
    res.cookie(cookieName,token,{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true',path:'/',maxAge:12*60*60*1000});
    return csrfToken;
  }
  const allowed=(...roles:string[]):RequestHandler=>(_req,res,next)=>{
    requireCondition(res.locals.user,401,'AUTH_REQUIRED','Sign in first');
    requireCondition(roles.includes(res.locals.user.role),403,'FORBIDDEN','This role cannot perform the action'); next();
  };
  const owner=allowed('owner'),sales=allowed('owner','cashier'),all=allowed('owner','cashier','bar');
  app.get('/api/session',async (_req,res)=>{
    const csrfToken=res.locals.session?.csrf_token || await newSession(res,null);
    res.json({user:res.locals.user || null,csrfToken});
  });
  app.post('/api/login',async (req,res)=>{
    const input=z.object({username:usernameSchema,password:z.string().min(1).max(128)}).strict().parse(req.body);
    const keys=[`user:${input.username}:${req.ip}`,`ip:${req.ip}`];
    const counts=await transaction(pool,async client=>{
      const result:number[]=[];
      for(const key of keys.sort()) {
        const row=(await client.query(`INSERT INTO login_limits(key,attempts) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_limits.window_start<now()-interval '10 minutes' THEN 1 ELSE login_limits.attempts+1 END,window_start=CASE WHEN login_limits.window_start<now()-interval '10 minutes' THEN now() ELSE login_limits.window_start END RETURNING attempts`,[key])).rows[0];
        result.push(row.attempts);
      }
      return result;
    });
    requireCondition(counts.every((count,index)=>count <= (keys[index].startsWith('ip:')?30:5)),429,'LOGIN_RATE_LIMIT','Too many sign-in attempts; try again in ten minutes');
    const result=await transaction(pool,async client=>{
      // Lock through session issuance so password/role updates cannot race invalidation.
      const user=(await client.query('SELECT * FROM users WHERE username=$1 AND active=true FOR SHARE',[input.username])).rows[0];
      const dummy='scrypt:00000000000000000000000000000000:'+ '00'.repeat(64);
      const valid=await verifyPassword(input.password,user?.password_hash || dummy);
      requireCondition(user&&valid,401,'INVALID_CREDENTIALS','Invalid username or password');
      await client.query('DELETE FROM sessions WHERE token_digest=$1',[res.locals.session.token_digest]);
      const csrfToken=await newSession(res,user.id,client);
      return {user:publicUser(user),csrfToken};
    });
    res.json(result);
  });
  app.post('/api/logout',all,async (_req,res)=>{
    await pool.query('DELETE FROM sessions WHERE token_digest=$1',[res.locals.session.token_digest]);
    res.clearCookie(cookieName,{path:'/',httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true'});
    res.json({ok:true});
  });
  app.get('/api/catalog',all,async (_req,res)=>{res.json(await catalog(pool));});
  app.get('/api/users',owner,async (_req,res)=>{res.json((await pool.query('SELECT id,username,role,active FROM users ORDER BY username')).rows.map(publicUser));});
  app.post('/api/users',owner,async (req,res)=>{
    const input=z.object({username:usernameSchema,password:passwordSchema,role:roleSchema}).strict().parse(req.body);
    const row=(await pool.query('INSERT INTO users(id,username,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,username,role,active',[randomUUID(),input.username,await hashPassword(input.password),input.role])).rows[0];
    res.status(201).json(publicUser(row));
  });
  app.patch('/api/users/:id',owner,async (req,res)=>{
    const input=userUpdate.parse(req.body);
    const row=await transaction(pool,async client=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':users',0))");
      const before=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
      requireCondition(before,400,'USER_NOT_FOUND','User not found');
      if(before.role==='owner' && before.active && (input.role && input.role!=='owner' || input.active===false)) {
        const other=await client.query("SELECT 1 FROM users WHERE id<>$1 AND role='owner' AND active=true LIMIT 1",[before.id]);
        requireCondition(other.rowCount,409,'LAST_OWNER','At least one active owner must remain');
      }
      const updated=(await client.query('UPDATE users SET password_hash=$2,role=$3,active=$4 WHERE id=$1 RETURNING id,username,role,active',[before.id,input.password?await hashPassword(input.password):before.password_hash,input.role??before.role,input.active??before.active])).rows[0];
      await client.query('DELETE FROM sessions WHERE user_id=$1',[before.id]);
      return updated;
    });
    res.json(publicUser(row));
  });
  app.post('/api/ingredients',owner,async (req,res)=>{
    const input=ingredientInput.parse(req.body);
    const row=(await pool.query('INSERT INTO ingredients(id,name,unit,low_stock) VALUES($1,$2,$3,$4::numeric) RETURNING *',[randomUUID(),input.name,input.unit,input.lowStock])).rows[0];
    res.status(201).json(ingredient(row));
  });
  app.patch('/api/ingredients/:id',owner,async (req,res)=>{
    const input=ingredientInput.partial().refine(input=>Object.keys(input).length>0).parse(req.body);
    const row=(await pool.query('UPDATE ingredients SET name=coalesce($2,name),unit=coalesce($3,unit),low_stock=coalesce($4::numeric,low_stock) WHERE id=$1 RETURNING *',[req.params.id,input.name??null,input.unit??null,input.lowStock??null])).rows[0];
    requireCondition(row,400,'INGREDIENT_NOT_FOUND','Ingredient not found');res.json(ingredient(row));
  });
  app.post('/api/stock',owner,async (req,res)=>{
    const input=z.object({ingredientId:z.string().uuid(),quantity:decimalSchema,reason:nameSchema}).strict().parse(req.body);
    const row=await transaction(pool,async client=>{
      const updated=(await client.query('UPDATE ingredients SET stock=stock+$2::numeric WHERE id=$1 AND stock+$2::numeric>=0 RETURNING *',[input.ingredientId,input.quantity])).rows[0];
      requireCondition(updated,409,'INVALID_STOCK','Ingredient is missing or adjustment would make stock negative');
      await client.query('INSERT INTO stock_movements(id,ingredient_id,quantity,reason,user_id) VALUES($1,$2,$3::numeric,$4,$5)',[randomUUID(),input.ingredientId,input.quantity,input.reason,res.locals.user.id]);
      return updated;
    });
    res.json(ingredient(row));
  });
  app.post('/api/menus',owner,async (req,res)=>{
    const input=menuSchema.parse(req.body);
    const row=await transaction(pool,async client=>{
      await validateMenu(client,input);
      return (await client.query('INSERT INTO menus(id,name,category,price_satang,active,recipe,options) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[randomUUID(),input.name,input.category,input.priceSatang,input.active,JSON.stringify(input.recipe),JSON.stringify(input.options)])).rows[0];
    });
    res.status(201).json(menu(row));
  });
  app.patch('/api/menus/:id',owner,async (req,res)=>{
    const fields=z.object({name:nameSchema.optional(),category:nameSchema.optional(),priceSatang:moneySchema.optional(),active:z.boolean().optional(),recipe:menuSchema.shape.recipe.optional(),options:menuSchema.shape.options.optional()}).strict().refine(input=>Object.keys(input).length>0).parse(req.body);
    const row=await transaction(pool,async client=>{
      const before=(await client.query('SELECT * FROM menus WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
      requireCondition(before,400,'MENU_NOT_FOUND','Menu not found');
      const {id:_id,...current}=menu(before);
      const input=menuSchema.parse({...current,...fields});
      await validateMenu(client,input);
      return (await client.query('UPDATE menus SET name=$2,category=$3,price_satang=$4,active=$5,recipe=$6,options=$7 WHERE id=$1 RETURNING *',[req.params.id,input.name,input.category,input.priceSatang,input.active,JSON.stringify(input.recipe),JSON.stringify(input.options)])).rows[0];
    });
    res.json(menu(row));
  });
  app.post('/api/checkout',sales,async (req,res)=>{res.json(await checkout(pool,res.locals.user,checkoutSchema.parse(req.body)));});
  app.get('/api/orders',all,async (_req,res)=>{
    const rows=await pool.query("SELECT * FROM orders WHERE day=(now() AT TIME ZONE 'Asia/Bangkok')::date OR status IN ('queued','preparing','ready') ORDER BY created_at DESC");
    res.json(rows.rows.map(order));
  });
  app.patch('/api/orders/:id/status',all,async (req,res)=>{
    const input=z.object({status:z.enum(['preparing','ready','completed'])}).strict().parse(req.body);
    const roles=input.status==='completed'?['owner','cashier']:['owner','bar'];
    requireCondition(roles.includes(res.locals.user.role),403,'FORBIDDEN','This role cannot perform this transition');
    const prior={preparing:'queued',ready:'preparing',completed:'ready'}[input.status];
    const row=(await pool.query('UPDATE orders SET status=$2 WHERE id=$1 AND status=$3 RETURNING *',[req.params.id,input.status,prior])).rows[0];
    requireCondition(row,409,'INVALID_TRANSITION','Order must follow queued → preparing → ready → completed');res.json(order(row));
  });
  app.post('/api/orders/:id/refund',owner,async (req,res)=>{res.json(await refund(pool,res.locals.user,String(req.params.id),refundInput.parse(req.body)));});
  app.get('/api/shift',sales,async (_req,res)=>{res.json(shift((await pool.query('SELECT * FROM shifts WHERE closed_at IS NULL')).rows[0]));});
  app.post('/api/shifts/open',sales,async (req,res)=>{
    const input=z.object({openingCashSatang:moneySchema}).strict().parse(req.body);
    const row=(await pool.query('INSERT INTO shifts(id,opened_by,opening_cash_satang,expected_cash_satang) VALUES($1,$2,$3,$3) RETURNING *',[randomUUID(),res.locals.user.id,input.openingCashSatang])).rows[0];
    res.status(201).json(shift(row));
  });
  app.post('/api/shifts/:id/close',sales,async (req,res)=>{
    const input=z.object({countedCashSatang:moneySchema}).strict().parse(req.body);
    const row=(await pool.query('UPDATE shifts SET closed_at=now(),closed_by=$2,counted_cash_satang=$3,difference_satang=$3-expected_cash_satang WHERE id=$1 AND closed_at IS NULL RETURNING *',[req.params.id,res.locals.user.id,input.countedCashSatang])).rows[0];
    requireCondition(row,409,'SHIFT_ALREADY_CLOSED','Open shift not found');res.json(shift(row));
  });
  async function reportFor(req:express.Request) {
    const today=(await pool.query("SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;
    const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date ?? today);
    return report(pool,date);
  }
  app.get('/api/reports',owner,async (req,res)=>{res.json(await reportFor(req));});
  app.get('/api/reports.csv',owner,async (req,res)=>{
    const data=await reportFor(req);
    const rows=[['metric','satang'],['total',data.totalSatang],['cash',data.cashSatang],['transfer',data.transferSatang],['refunds',data.refundSatang],['order_count',data.orderCount],[],['menu','quantity','total_satang'],...data.bestSellers.map(item=>[item.name,item.quantity,item.totalSatang]),[],['ingredient','unit','stock','low_stock'],...data.lowStock.map(item=>[item.name,item.unit,item.stock,item.lowStock])];
    res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="cafe-report.csv"'}).send('\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'));
  });
  app.post('/api/seed-demo',owner,async (_req,res)=>{
    await transaction(pool,async client=>{
      await client.query('LOCK TABLE menus,ingredients IN SHARE ROW EXCLUSIVE MODE');
      requireCondition(!(await client.query('SELECT 1 FROM menus UNION ALL SELECT 1 FROM ingredients LIMIT 1')).rowCount,409,'CATALOG_NOT_EMPTY','Demo seeding requires an empty catalog');
      const coffee=randomUUID(), milk=randomUUID(), syrup=randomUUID(), espresso=randomUUID(), latte=randomUUID();
      for(const [id,name,unit,stock,low] of [[coffee,'เมล็ดกาแฟ','g','1000','200'],[milk,'นม','ml','3000','500'],[syrup,'น้ำเชื่อม','ml','1000','100']]) {
        await client.query('INSERT INTO ingredients(id,name,unit,stock,low_stock) VALUES($1,$2,$3,$4,$5)',[id,name,unit,stock,low]);
        await client.query('INSERT INTO stock_movements(id,ingredient_id,quantity,reason,user_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,stock,'Explicit demo opening stock',res.locals.user.id]);
      }
      const options=[{id:'normal',group:'ความหวาน',name:'หวานปกติ',priceSatang:0,recipe:[]},{id:'less-sweet',group:'ความหวาน',name:'หวานน้อย',priceSatang:0,recipe:[{ingredientId:syrup,quantity:'-5'}]},{id:'no-sugar',group:'ความหวาน',name:'ไม่หวาน',priceSatang:0,recipe:[{ingredientId:syrup,quantity:'-10'}]}];
      await client.query('INSERT INTO menus(id,name,category,price_satang,recipe,options) VALUES($1,$2,$3,$4,$5,$6),($7,$8,$3,$9,$10,$6)',[espresso,'อเมริกาโน่เย็น','กาแฟ',5000,JSON.stringify([{ingredientId:coffee,quantity:'18'},{ingredientId:syrup,quantity:'10'}]),JSON.stringify(options),latte,'ลาเต้เย็น',6500,JSON.stringify([{ingredientId:coffee,quantity:'18'},{ingredientId:milk,quantity:'150'},{ingredientId:syrup,quantity:'10'}])]);
    });
    res.status(201).json(await catalog(pool));
  });
  app.use('/api',(_req,res)=>{res.status(404).json({error:'API route not found',code:'NOT_FOUND',status:404});});
  const dist=fileURLToPath(new URL('../dist/',import.meta.url));
  app.use(express.static(dist,{index:false}));
  app.get(/^(?!\/api).*/,(_req,res,next)=>{res.sendFile(dist+'index.html',error=>{if(error)next(error);});});
  app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    if(error instanceof ApiError) {res.status(error.status).json({error:error.message,code:error.code,status:error.status});return;}
    if(error instanceof z.ZodError || ['22P02','22003','22007','22008','23514','23503'].includes(error.code) || error.type==='entity.parse.failed' || error.type==='entity.too.large') {
      res.status(400).json({error:error instanceof z.ZodError?error.issues.map(issue=>issue.message).join('; '):'Invalid request values',code:'VALIDATION_ERROR',status:400});return;
    }
    if(error.code==='23505') {res.status(409).json({error:'This value already exists or a shift is already open',code:'CONFLICT',status:409});return;}
    console.error('POS request failed', {code:error.code || 'INTERNAL_ERROR'});
    res.status(500).json({error:'Internal server error',code:'INTERNAL_ERROR',status:500});
  });
  return app;
}
