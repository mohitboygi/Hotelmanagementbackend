const express=require('express'),jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs'),{pool}=require('../db'),{lim,wrap,bad,nf}=require('../util'),{needRole}=require('../auth'),mailer=require('../mailer'),
 {JWT_SECRET,OWNER_PASSWORD_HASH,ADMIN_PASSWORD_HASH,ADMIN_EMAIL,SMTP_USER}=require('../config');
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
 if(!(await bcrypt.compare(String(q.body.password||''),ADMIN_PASSWORD_HASH)))return s.status(401).json({error:'Wrong password'});
 s.json({token:jwt.sign({role:'admin'},JWT_SECRET,{expiresIn:'2h'})})}));
const adm=express.Router();adm.use(needRole('admin'));r.use('/admin',adm);
adm.get('/accounts',wrap(async(q,s)=>s.json((await pool.query('select id,hotel_name,owner_name,phone,email,address,pincode,city,state,status,created_at from accounts order by id desc limit 500')).rows)));
adm.post('/accounts/:id/password',wrap(async(q,s)=>{
 const p=String(q.body.password||'');if(p.length<8||p.length>72)return bad(s,'Password must be 8-72 characters');
 const r=await pool.query("update accounts set password_hash=$1,status='active' where id=$2",[await bcrypt.hash(p,12),+q.params.id]);r.rowCount?s.json({ok:true}):nf(s)}));
adm.post('/accounts/:id/disable',wrap(async(q,s)=>{const r=await pool.query("update accounts set status='disabled' where id=$1",[+q.params.id]);r.rowCount?s.json({ok:true}):nf(s)}));

module.exports=r;
