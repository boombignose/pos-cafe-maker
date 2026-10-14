# Interface contract
All responses are JSON; errors {error:string}, status 400/401/403/409/500. Auth uses HttpOnly same-origin session cookie. Every write checks Origin and CSRF (token returned by GET /api/session; pass X-CSRF-Token). GET /api/session => {user: User|null, csrfToken:string}. POST /api/login {username,password} => {user,csrfToken}. POST /api/logout.
User {id,username,role:'owner'|'cashier'|'bar'}.
GET /api/catalog => {menus:Menu[],ingredients:Ingredient[]}; Menu {id,name,category,priceSatang,active,recipe:Recipe[],options:Option[]}; Recipe {ingredientId,quantity}; Option {id,group,name,priceSatang,recipe:Recipe[]}; recipe deltas on options permit replacement; final consumed quantity cannot be negative. Each defined option group requires one choice.
Ingredient {id,name,unit,stock,lowStock}; quantity/stock numeric represented as decimal strings, no float accounting.
POST /api/checkout {items:[{menuId,quantity,optionIds:string[]}],paymentMethod:'cash'|'transfer',amountTenderedSatang,idempotencyKey,transferConfirmed:boolean} => Order. Order {id,queueNumber,status:'queued'|'preparing'|'ready'|'completed'|'refunded',totalSatang,changeSatang,paymentMethod,createdAt,items:[{name,quantity,unitPriceSatang,options:string[]}]}.
GET /api/orders => Order[] active/current-day; PATCH /api/orders/:id/status {status}; POST /api/orders/:id/refund {reason,idempotencyKey}.
GET /api/shift => active shift|null; POST /api/shifts/open {openingCashSatang}; POST /api/shifts/:id/close {countedCashSatang}.
Owner: GET /api/reports?date=YYYY-MM-DD => {totalSatang,cashSatang,transferSatang,refundSatang,orderCount,bestSellers:[{name,quantity,totalSatang}],lowStock:Ingredient[]}; GET /api/reports.csv?date=...
GET /api/users => User[]; POST /api/users {username,password,role}; PATCH /api/users/:id {password?,role?,active?}.
POST /api/menus with Menu fields except id; PATCH /api/menus/:id same fields. POST /api/ingredients {name,unit,lowStock}; PATCH /api/ingredients/:id {name?,unit?,lowStock?}; POST /api/stock {ingredientId,quantity:string,reason:string} (delta); POST /api/seed-demo owner-only, empty catalog only, never on startup.
GET /api/health => {ok:true} after DB ping. Reports/day/queues use Asia/Bangkok. Shift fields include id,openingCashSatang,expectedCashSatang; close response includes countedCashSatang,differenceSatang.
