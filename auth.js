const jwt=require('jsonwebtoken'),{JWT_SECRET}=require('./config');
const needRole=r=>(q,s,n)=>{try{if(jwt.verify((q.headers.authorization||'').replace(/^Bearer /,''),JWT_SECRET).role!==r)throw 0;n()}catch{s.status(401).json({error:'Login required'})}};
module.exports={needRole};
