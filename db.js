const {Pool}=require('pg'),{DATABASE_URL,PGSSL}=require('./config');
const pool=new Pool({connectionString:DATABASE_URL,ssl:PGSSL==='true'?{rejectUnauthorized:false}:false});
const R=async()=>(await pool.query('select * from restaurant where id=1')).rows[0];
module.exports={pool,R};
