const express=require('express'),crypto=require('crypto'),{pool,R}=require('../db'),{lim,wrap,bad,nf,same}=require('../util');
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
