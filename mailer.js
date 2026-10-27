const nodemailer=require('nodemailer'),{SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS}=require('./config');
module.exports=SMTP_HOST?nodemailer.createTransport({host:SMTP_HOST,port:+SMTP_PORT,secure:+SMTP_PORT===465,auth:{user:SMTP_USER,pass:SMTP_PASS}}):null;
