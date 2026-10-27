const rate=require('express-rate-limit'),crypto=require('crypto');
const lim=n=>rate({windowMs:60000,max:n,standardHeaders:true,legacyHeaders:false});
const wrap=f=>(q,s,n)=>f(q,s,n).catch(n);
const bad=(s,m)=>s.status(400).json({error:m}),nf=s=>s.status(404).json({error:'Not found'});
const STATUSES=['New','Accepted','Preparing','Ready','Served','Rejected'];
const same=(a,b)=>{a=Buffer.from(String(a));b=Buffer.from(String(b));return a.length===b.length&&crypto.timingSafeEqual(a,b)};
module.exports={lim,wrap,bad,nf,same,STATUSES};
