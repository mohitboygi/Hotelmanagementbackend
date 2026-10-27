const {PORT}=require('./src/config');
require('./src/app').listen(PORT,()=>console.log('TableTap API on :'+PORT));
