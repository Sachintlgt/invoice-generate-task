import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import config from './src/config.js';
import { storage } from './src/storage.js';
import { invoiceSchema } from './src/validation.js';
import { calculate } from './shared/calculations.js';
import { mailer } from './src/email.js';
import { invoicePDF, invoicePdfFilename } from './src/invoice-pdf.js';
import { emailHistory } from './src/email-history.js';
export function createApp(settings = config) {
const app=express(), store=storage(settings.DATA_DIR),history=emailHistory(settings.DATA_DIR),send=mailer(settings,history),root=fileURLToPath(new URL('.',import.meta.url));
app.disable('x-powered-by');app.use(helmet());app.use(express.json({limit:'128kb'}));
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(!['GET','HEAD'].includes(req.method)){const origin=req.get('origin');if(origin && origin!==`${req.protocol}://${req.get('host')}`) return res.status(403).json({error:'Cross-origin requests are not allowed.'});if(!req.is('application/json'))return res.status(415).json({error:'Use application/json.'});}next();});
app.get('/api/config',(req,res)=>res.json({emailMode:settings.SMTP_HOST?'smtp':'preview',...(settings.TEST_EMAIL_TO?{testRecipient:settings.TEST_EMAIL_TO}:{})}));
app.get('/api/invoices',async(req,res)=>res.json({items:await store.list()}));
app.get('/api/invoices/:id/pdf',async(req,res)=>{const invoice=await store.get(req.params.id);res.type('application/pdf').attachment(invoicePdfFilename(invoice.number)).send(await invoicePDF(invoice));});
app.get('/api/invoices/:id',async(req,res)=>res.json(await store.get(req.params.id)));
async function save(req,res){const parsed=invoiceSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Please check the invoice fields.',issues:parsed.error.issues.map(i=>({path:i.path.join('.'),message:i.message}))});let totals;try{totals=calculate(parsed.data);}catch(e){return res.status(400).json({error:e.message});}const id=req.params.id||randomUUID();if(req.params.id)await store.get(id);const invoice={...parsed.data,id,totals,updatedAt:new Date().toISOString()};await store.save(id,invoice);res.status(req.params.id?200:201).json(invoice);}
app.post('/api/invoices',save);app.put('/api/invoices/:id',save);
const emailLimit=rateLimit({windowMs:60000,limit:3,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Please wait a minute before sending another email.'}});
app.post('/api/invoices/:id/email',emailLimit,async(req,res)=>res.json(await send(await store.get(req.params.id))));
app.get('/api/email-logs',async(req,res)=>{const offset=Number(req.query.offset??0),limit=Number(req.query.limit??50);if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)return res.status(400).json({error:'Use a non-negative offset and a limit between 1 and 100.'});res.json(await history.list({offset,limit}));});
app.get('/api/email-logs/:id',async(req,res)=>{const record=await history.get(req.params.id);res.json({...history.summary(record),text:record.text});});
app.get('/api/email-logs/:id/pdf',async(req,res)=>{const record=await history.get(req.params.id);res.type('application/pdf').set('Content-Disposition',`inline; filename="${invoicePdfFilename(record.invoiceNumber)}"`).send(await history.pdf(record.id));});
app.get('/api/email-logs/:id/message',async(req,res)=>{const record=await history.get(req.params.id);if(!record.html)return res.status(404).send('Email body is unavailable.');res.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox").type('html').send(record.html);});
app.post('/api/email-logs/:id/resend',emailLimit,async(req,res)=>{const record=await history.get(req.params.id);if(!record.invoice)return res.status(409).json({error:'This older preview has no invoice snapshot. Open or create an invoice in the editor to send it.'});if(record.status==='pending')return res.status(409).json({error:'This attempt has no confirmed result. Check the provider logs before sending again.'});const parsed=invoiceSchema.parse(record.invoice);res.json(await send({...parsed,id:record.invoiceId},{resendOf:record.id}));});
app.get('/email-logs', (req,res)=>res.sendFile(resolve(root,'public/email-logs.html')));
app.get('/invoices', (req,res)=>res.sendFile(resolve(root,'public/invoices.html')));
app.get('/email-logs/:id', (req,res)=>res.sendFile(resolve(root,'public/email-detail.html')));
app.use('/shared',express.static(resolve(root,'shared')));
app.get('/invoice-template.js',(req,res)=>res.sendFile(resolve(root,'src/invoice-template.js')));
app.use(express.static(resolve(root,'public')));
app.use((req,res)=>res.status(404).json({error:'Not found.'}));
app.use((error,req,res,next)=>{const status=error.status||500;if(status>=500)console.error('Request failed:',error.code||error.name);res.status(status).json({error:status>=500?'Unable to complete the request. Check server configuration and try again.':error.message});});
return app;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp().listen(config.PORT,config.HOST,()=>console.log(`Folio invoice: http://${config.HOST}:${config.PORT}`));
}
