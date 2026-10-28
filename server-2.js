// TableTap backend - single file (all modules bundled). Needs: package.json, tools.js, schema.sql, seed-menu.json
const __mods={},__cache={};
const __r=k=>{if(__cache[k])return __cache[k].exports;const m=__cache[k]={exports:{}};__mods[k](m,m.exports);return m.exports};
__mods['src/config']=function(module,exports){
require('dotenv').config();
const {PORT=3000,DATABASE_URL,JWT_SECRET,OWNER_PASSWORD_HASH,ADMIN_PASSWORD_HASH,ADMIN_PASSWORD,CORS_ORIGIN='*',PUBLIC_URL='http://localhost:3000',PGSSL,
 ADMIN_EMAIL='mohityadavoffical1@gmail.com',SMTP_HOST,SMTP_PORT=587,SMTP_USER,SMTP_PASS}=process.env;
if(!DATABASE_URL||!JWT_SECRET||(!ADMIN_PASSWORD_HASH&&!ADMIN_PASSWORD)){console.error('Set DATABASE_URL, JWT_SECRET and ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH)');process.exit(1)}
if(ADMIN_PASSWORD_HASH&&!ADMIN_PASSWORD&&!/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(ADMIN_PASSWORD_HASH.trim()))console.warn('WARNING: ADMIN_PASSWORD_HASH is not a valid bcrypt hash. Admin login will fail. Set ADMIN_PASSWORD instead.');
module.exports={ADMIN_PASSWORD,PORT,DATABASE_URL,JWT_SECRET,OWNER_PASSWORD_HASH,ADMIN_PASSWORD_HASH,CORS_ORIGIN,PUBLIC_URL,PGSSL,ADMIN_EMAIL,SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS};
};
__mods['src/db']=function(module,exports){
const {Pool}=require('pg'),{DATABASE_URL,PGSSL}=__r('src/config');
const pool=new Pool({connectionString:DATABASE_URL,ssl:PGSSL==='true'?{rejectUnauthorized:false}:false});
const R=async()=>(await pool.query('select * from restaurant where id=1')).rows[0];
module.exports={pool,R};
};
__mods['src/mailer']=function(module,exports){
const nodemailer=require('nodemailer'),{SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS}=__r('src/config');
module.exports=SMTP_HOST?nodemailer.createTransport({host:SMTP_HOST,port:+SMTP_PORT,secure:+SMTP_PORT===465,auth:{user:SMTP_USER,pass:SMTP_PASS}}):null;
};
__mods['src/util']=function(module,exports){
const rate=require('express-rate-limit'),crypto=require('crypto');
const lim=n=>rate({windowMs:60000,max:n,standardHeaders:true,legacyHeaders:false});
const wrap=f=>(q,s,n)=>f(q,s,n).catch(n);
const bad=(s,m)=>s.status(400).json({error:m}),nf=s=>s.status(404).json({error:'Not found'});
const STATUSES=['New','Accepted','Preparing','Ready','Served','Rejected'];
const same=(a,b)=>{a=Buffer.from(String(a));b=Buffer.from(String(b));return a.length===b.length&&crypto.timingSafeEqual(a,b)};
module.exports={lim,wrap,bad,nf,same,STATUSES};
};
__mods['src/auth']=function(module,exports){
const jwt=require('jsonwebtoken'),{JWT_SECRET}=__r('src/config');
const needRole=r=>(q,s,n)=>{try{if(jwt.verify((q.headers.authorization||'').replace(/^Bearer /,''),JWT_SECRET).role!==r)throw 0;n()}catch{s.status(401).json({error:'Login required'})}};
module.exports={needRole};
};
__mods['src/routes/public']=function(module,exports){
const express=require('express'),crypto=require('crypto'),{pool,R}=__r('src/db'),{lim,wrap,bad,nf,same}=__r('src/util');
const r=express.Router();
r.get('/api/restaurant',wrap(async(q,s)=>{const r=await R();s.json({name:r.name,hours:r.hours,tax_percent:Number(r.tax_percent),order_types:r.order_types,pay_methods:r.pay_methods,photo_url:r.photo_url})}));
r.get('/api/menu',wrap(async(q,s)=>s.json((await pool.query('select id,name,description,price::float,category,emoji,veg,available from menu_items order by category,id')).rows)));
// ---- customer: place order (prices and totals always computed on the server)
r.post('/api/orders',lim(20),wrap(async(q,s)=>{
 const b=q.body||{},table=String(b.table||'').trim().slice(0,10),name=String(b.name||'').trim().slice(0,60),note=String(b.note||'').slice(0,300);
 const type=b.type==='Takeaway'?'Takeaway':'Dine-in',pay=b.pay==='online'?'online_simulated':'reception';
 if(!table||!name)return bad(s,'table and name are required');
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>50)return bad(s,'items required');
 const want=new Map();
 for(const i of b.items){const id=+i.id,qty=Math.floor(+i.qty);if(!(id>0)||!(qty>=1&&qty<=20))return bad(s,'invalid item');want.set(id,(want.get(id)||0)+qty)}
 const tp=Number((await R()).tax_percent),c=await pool.connect();
 try{
  await c.query('begin');
  const rows=(await c.query('select id,name,price::float,available from menu_items where id=any($1)',[[...want.keys()]])).rows;
  if(rows.length!==want.size)throw Object.assign(new Error('Some items no longer exist'),{http:400});
  const off=rows.find(r=>!r.available);if(off)throw Object.assign(new Error(off.name+' is sold out'),{http:409});
  const sub=rows.reduce((a,r)=>a+r.price*want.get(r.id),0),tax=Math.round(sub*tp/100),total=sub+tax,tok=crypto.randomBytes(16).toString('hex'),sim=pay==='online_simulated';
  const o=(await c.query('insert into orders(table_no,customer_name,note,order_type,pay_method,paid,paid_at,subtotal,tax,total,public_token) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id',[table,name,note,type,pay,sim,sim?new Date():null,sub,tax,total,tok])).rows[0];
  for(const r of rows)await c.query('insert into order_items(order_id,item_id,name,price,qty) values($1,$2,$3,$4,$5)',[o.id,r.id,r.name,r.price,want.get(r.id)]);
  await c.query('commit');
  s.status(201).json({id:o.id,token:tok,subtotal:sub,tax,total,pay_method:pay,paid:sim,simulated_payment:sim});
 }catch(e){await c.query('rollback');if(e.http)return s.status(e.http).json({error:e.message});throw e}finally{c.release()}
}));
// customer polls this (needs the token returned at order time): status + paid flag
r.get('/api/orders/:id',wrap(async(q,s)=>{
 const o=(await pool.query('select id,table_no,customer_name,order_type,pay_method,paid,status,subtotal::float,tax::float,total::float,public_token,created_at from orders where id=$1',[+q.params.id])).rows[0];
 if(!o||!same(o.public_token,q.query.token||''))return nf(s);
 delete o.public_token;o.items=(await pool.query('select name,price::float,qty from order_items where order_id=$1',[o.id])).rows;s.json(o)}));
r.post('/api/orders/:id/rating',lim(10),wrap(async(q,s)=>{
 const o=(await pool.query('select public_token,paid from orders where id=$1',[+q.params.id])).rows[0],st=Math.floor(+q.body.stars);
 if(!o||!same(o.public_token,q.body.token||''))return nf(s);
 if(!o.paid)return bad(s,'Rating allowed after payment');if(!(st>=1&&st<=5))return bad(s,'stars must be 1-5');
 await pool.query('insert into ratings(order_id,stars,comment) values($1,$2,$3) on conflict(order_id) do update set stars=$2,comment=$3',[+q.params.id,st,String(q.body.comment||'').slice(0,500)]);s.json({ok:true})}));

module.exports=r;
};
__mods['src/routes/accounts']=function(module,exports){
const express=require('express'),jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs'),{pool}=__r('src/db'),{lim,wrap,bad,nf,same}=__r('src/util'),{needRole}=__r('src/auth'),mailer=__r('src/mailer'),
 {JWT_SECRET,OWNER_PASSWORD_HASH,ADMIN_PASSWORD_HASH,ADMIN_PASSWORD,ADMIN_EMAIL,SMTP_USER}=__r('src/config');
const r=express.Router();
r.post('/api/auth/login',lim(10),wrap(async(q,s)=>{
 if(!OWNER_PASSWORD_HASH||!(await bcrypt.compare(String(q.body.password||''),OWNER_PASSWORD_HASH)))return s.status(401).json({error:'Wrong password'});
 s.json({token:jwt.sign({role:'owner'},JWT_SECRET,{expiresIn:'12h'})})}));
r.post('/api/signup',lim(5),wrap(async(q,s)=>{
 const b=q.body||{},t=k=>String(b[k]||'').trim();
 const d={hotel_name:t('hotel_name').slice(0,100),owner_name:t('owner_name').slice(0,80),phone:t('phone').replace(/\D/g,'').slice(-10),email:t('email').toLowerCase().slice(0,120),address:t('address').slice(0,300),pincode:t('pincode'),city:t('city').slice(0,60),state:t('state').slice(0,60)};
 if(!d.hotel_name||!d.owner_name||!d.address||!d.city||!d.state)return bad(s,'All fields are required');
 if(!/^[6-9]\d{9}$/.test(d.phone))return bad(s,'Enter a valid 10-digit mobile number');
 if(!/^\S+@\S+\.\S+$/.test(d.email))return bad(s,'Enter a valid email');
 if(!/^\d{6}$/.test(d.pincode))return bad(s,'PIN code must be 6 digits');
 const r=await pool.query('insert into accounts(hotel_name,owner_name,phone,email,address,pincode,city,state) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing returning id',Object.values(d));
 if(!r.rows[0])return s.status(409).json({error:'This email or mobile number is already registered'});
 let mailed=false;
 if(mailer){try{await mailer.sendMail({from:SMTP_USER,to:ADMIN_EMAIL,subject:'New TableTap signup: '+d.hotel_name,text:Object.entries(d).map(([k,v])=>k+': '+v).join('\n')});mailed=true}catch(e){console.error('mail failed:',e.message)}}
 s.status(201).json({ok:true,mailed});
}));
r.post('/api/account/login',lim(10),wrap(async(q,s)=>{
 const id=String(q.body.id||'').trim().toLowerCase(),pw=String(q.body.password||''),ph=/^[\d\s+-]+$/.test(id)?id.replace(/\D/g,'').slice(-10):'';
 const a=(await pool.query("select id,hotel_name,owner_name,password_hash from accounts where (email=$1 or phone=$2) and status='active' and password_hash is not null",[id,ph])).rows[0];
 if(!a||!(await bcrypt.compare(pw,a.password_hash)))return s.status(401).json({error:'Wrong email/mobile or password, or account not activated yet'});
 s.json({token:jwt.sign({role:'owner',account:a.id},JWT_SECRET,{expiresIn:'12h'}),hotel_name:a.hotel_name,owner_name:a.owner_name})}));
r.post('/api/admin/login',lim(5),wrap(async(q,s)=>{
 const pw=String(q.body.password||''),ok=ADMIN_PASSWORD?same(pw,ADMIN_PASSWORD):await bcrypt.compare(pw,String(ADMIN_PASSWORD_HASH||'').trim());
 if(!ok)return s.status(401).json({error:'Wrong password'});
 s.json({token:jwt.sign({role:'admin'},JWT_SECRET,{expiresIn:'2h'})})}));
const adm=express.Router();adm.use(needRole('admin'));r.use('/api/admin',adm);
adm.get('/accounts',wrap(async(q,s)=>s.json((await pool.query('select id,hotel_name,owner_name,phone,email,address,pincode,city,state,status,created_at from accounts order by id desc limit 500')).rows)));
adm.post('/accounts/:id/password',wrap(async(q,s)=>{
 const p=String(q.body.password||'');if(p.length<8||p.length>72)return bad(s,'Password must be 8-72 characters');
 const r=await pool.query("update accounts set password_hash=$1,status='active' where id=$2",[await bcrypt.hash(p,12),+q.params.id]);r.rowCount?s.json({ok:true}):nf(s)}));
adm.post('/accounts/:id/disable',wrap(async(q,s)=>{const r=await pool.query("update accounts set status='disabled' where id=$1",[+q.params.id]);r.rowCount?s.json({ok:true}):nf(s)}));

module.exports=r;
};
__mods['src/routes/owner']=function(module,exports){
const express=require('express'),{pool}=__r('src/db'),{wrap,bad,nf,STATUSES}=__r('src/util'),{needRole}=__r('src/auth'),{PUBLIC_URL}=__r('src/config');
const own=express.Router();
own.use(needRole('owner'));
own.get('/orders',wrap(async(q,s)=>s.json((await pool.query(`select o.id,o.table_no,o.customer_name,o.note,o.order_type,o.pay_method,o.paid,o.status,o.total::float,o.created_at,
 (select json_agg(json_build_object('name',i.name,'qty',i.qty,'price',i.price::float)) from order_items i where i.order_id=o.id) items
 from orders o where ($1::text is null or o.status=$1) order by o.id desc limit 200`,[STATUSES.includes(q.query.status)?q.query.status:null])).rows)));
own.patch('/orders/:id/status',wrap(async(q,s)=>{
 if(!STATUSES.includes(q.body.status))return bad(s,'invalid status');
 const r=(await pool.query('update orders set status=$1 where id=$2 returning id,status',[q.body.status,+q.params.id])).rows[0];r?s.json(r):nf(s)}));
own.post('/orders/:id/payment-received',wrap(async(q,s)=>{
 const r=(await pool.query('update orders set paid=true,paid_at=coalesce(paid_at,now()) where id=$1 returning id,paid',[+q.params.id])).rows[0];r?s.json(r):nf(s)}));

const itemVals=b=>{const n=String(b.name||'').trim().slice(0,80),p=+b.price;
 return n&&p>0&&p<100000?[n,String(b.description||'').slice(0,300),p,String(b.category||'Other').slice(0,40),String(b.emoji||'🍽️').slice(0,8),b.veg!==false]:null};
own.post('/menu',wrap(async(q,s)=>{const v=itemVals(q.body);if(!v)return bad(s,'name and a valid price are required');
 s.status(201).json((await pool.query('insert into menu_items(name,description,price,category,emoji,veg) values($1,$2,$3,$4,$5,$6) returning *',v)).rows[0])}));
own.put('/menu/:id',wrap(async(q,s)=>{const v=itemVals(q.body);if(!v)return bad(s,'name and a valid price are required');
 const r=(await pool.query('update menu_items set name=$1,description=$2,price=$3,category=$4,emoji=$5,veg=$6 where id=$7 returning *',[...v,+q.params.id])).rows[0];r?s.json(r):nf(s)}));
own.patch('/menu/:id/availability',wrap(async(q,s)=>{
 const r=(await pool.query('update menu_items set available=$1 where id=$2 returning id,available',[q.body.available===true,+q.params.id])).rows[0];r?s.json(r):nf(s)}));
own.delete('/menu/:id',wrap(async(q,s)=>{const r=await pool.query('delete from menu_items where id=$1',[+q.params.id]);r.rowCount?s.json({ok:true}):nf(s)}));

// sales count only orders marked Served
own.get('/sales',wrap(async(q,s)=>{
 const items=(await pool.query(`select m.id,m.name,m.category,coalesce(sum(i.qty),0)::int sold,coalesce(sum(i.qty*i.price),0)::float revenue
  from menu_items m left join (select oi.item_id,oi.qty,oi.price from order_items oi join orders o on o.id=oi.order_id where o.status='Served') i on i.item_id=m.id
  group by m.id order by sold desc,m.name`)).rows;
 const t=(await pool.query(`select count(*)::int orders,coalesce(sum(total),0)::float revenue from orders where status='Served'`)).rows[0];
 const rt=(await pool.query('select round(avg(stars),2)::float avg,count(*)::int n from ratings')).rows[0];
 s.json({total_orders:t.orders,total_revenue:t.revenue,pieces_sold:items.reduce((a,i)=>a+i.sold,0),best:items[0]||null,lowest:items[items.length-1]||null,items,rating:rt})}));

own.get('/profile',wrap(async(q,s)=>{const r=(await pool.query('select name,phone,email,photo_url,hours,tax_percent::float,plan,subscription_start,subscription_renew,(subscription_renew-current_date)::int days_left from restaurant where id=1')).rows[0];s.json(r)}));
own.patch('/profile',wrap(async(q,s)=>{
 const b=q.body,name=String(b.name||'').trim().slice(0,80),tax=b.tax_percent===undefined?null:+b.tax_percent,ph=b.photo_url?String(b.photo_url).slice(0,500):null;
 if(!name)return bad(s,'name required');if(tax!==null&&!(tax>=0&&tax<=28))return bad(s,'tax must be 0-28');if(ph&&!/^https?:\/\//.test(ph))return bad(s,'photo_url must be http(s)');
 s.json((await pool.query('update restaurant set name=$1,phone=$2,email=$3,photo_url=$4,hours=coalesce($5,hours),tax_percent=coalesce($6,tax_percent) where id=1 returning name,phone,email,photo_url,hours,tax_percent::float',
  [name,String(b.phone||'').slice(0,20),String(b.email||'').slice(0,120),ph,b.hours?String(b.hours).slice(0,40):null,tax])).rows[0])}));
own.get('/qr-link',(q,s)=>{const t=String(q.query.table||'').replace(/[^\w.~-]/g,'').slice(0,10);
 t?s.json({url:PUBLIC_URL.replace(/#.*/,'')+'#table-'+t}):bad(s,'table required')});


module.exports=own;
};
__mods['src/app']=function(module,exports){
const express=require('express'),helmet=require('helmet'),cors=require('cors'),path=require('path'),{CORS_ORIGIN}=__r('src/config'),{nf}=__r('src/util');
const app=express();app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:{directives:{...helmet.contentSecurityPolicy.getDefaultDirectives(),'script-src':["'self'","'unsafe-inline'"]}}}),cors({origin:CORS_ORIGIN==='*'?true:CORS_ORIGIN.split(',')}),express.json({limit:'200kb'}));
app.use(express.static(path.join(__dirname,'web')));
app.get('/health',(q,s)=>s.json({ok:true}));
app.use(__r('src/routes/public'),__r('src/routes/accounts'));
app.use('/api/owner',__r('src/routes/owner'));
app.use('/api',(q,s)=>nf(s));
app.use((e,q,s,n)=>{console.error(e);s.status(500).json({error:'Server error'})});
module.exports=app;
};
const {PORT}=__r('src/config');
__r('src/app').listen(PORT,()=>console.log('TableTap API on :'+PORT));
