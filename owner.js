const express=require('express'),{pool}=require('../db'),{wrap,bad,nf,STATUSES}=require('../util'),{needRole}=require('../auth'),{PUBLIC_URL}=require('../config');
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
