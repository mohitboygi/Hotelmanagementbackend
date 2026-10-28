require('dotenv').config();
const fs=require('fs'),{Pool}=require('pg'),bcrypt=require('bcryptjs');
const [,,cmd,arg]=process.argv;
(async()=>{
 if(cmd==='hash'){if(!arg)throw new Error('usage: npm run hash -- "password"');console.log(await bcrypt.hash(arg,12));return}
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:false}:false});
 if(cmd==='migrate'){await pool.query(fs.readFileSync('schema.sql','utf8'));console.log('schema ready')}
 if(cmd==='seed'){
  const n=(await pool.query('select count(*)::int c from menu_items')).rows[0].c;
  if(n)console.log('menu not empty, skipped');
  else{for(const m of JSON.parse(fs.readFileSync('seed-menu.json','utf8')))await pool.query('insert into menu_items(name,price,category,emoji,veg) values($1,$2,$3,$4,$5)',[m.name,m.price,m.category,m.emoji,m.veg]);console.log('menu seeded')}}
 await pool.end();
})().catch(e=>{console.error(e.message);process.exit(1)});

