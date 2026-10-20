import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
import {createApp} from '../server.js';
import {emailHistory} from '../src/email-history.js';
import {invoiceEmail} from '../src/email-template.js';
import {invoiceHTML} from '../src/invoice-template.js';
import {request} from './http-helper.js';
const invoice=()=>({business:{name:'Demo Studio',email:'demo@example.com',address:''},customer:{name:'Demo Client',email:'original@example.com',address:''},number:'LOG-QA-001',issueDate:'2026-10-20',dueDate:'2026-10-21',notes:'Fictional data',items:[{description:'Saved original service',quantity:'2',unitPrice:'50'}],discount:'10',taxRate:'10',customFields:[{label:'Private',value:'HIDDEN-LOG-MARKER',visible:false}]});
async function temp(fn){const dir=await mkdtemp(join(tmpdir(),'folio-log-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('email history stores preview snapshot, body and inline PDF across app restart',async()=>temp(async dir=>{
 let app=createApp({DATA_DIR:dir});const saved=(await request(app,'/api/invoices',{method:'POST',body:invoice()})).json();const sent=(await request(app,`/api/invoices/${saved.id}/email`,{method:'POST',body:{}})).json();assert.ok(sent.logId);assert.equal(sent.logUrl,`/email-logs/${sent.logId}`);
 app=createApp({DATA_DIR:dir});let response=await request(app,'/api/email-logs');assert.equal(response.status,200);const list=response.json();assert.equal(list.total,1);assert.equal(list.stats.preview,1);assert.equal(list.items[0].status,'preview');assert.ok(!('invoice' in list.items[0]));assert.ok(!('html' in list.items[0]));
 response=await request(app,`/api/email-logs/${sent.logId}`);assert.equal(response.json().invoiceNumber,'LOG-QA-001');assert.ok(response.json().createdAt);assert.equal(response.json().canResend,true);
 response=await request(app,`/api/email-logs/${sent.logId}/pdf`);assert.equal(response.status,200);assert.match(response.headers['content-disposition'],/^inline;/);assert.equal(response.buffer.subarray(0,5).toString(),'%PDF-');
 response=await request(app,`/api/email-logs/${sent.logId}/message`);assert.equal(response.status,200);assert.ok(!response.text.includes('HIDDEN-LOG-MARKER'));assert.match(response.headers['content-security-policy'],/default-src 'none'/);assert.match(response.headers['content-security-policy'],/sandbox/);
}));
test('resend uses immutable saved invoice and current controlled recipient, creating a new log',async t=>temp(async dir=>{
 const sentMessages=[];t.mock.method(nodemailer,'createTransport',()=>({sendMail:async message=>{sentMessages.push(message);return{accepted:['controlled@example.com'],rejected:[]};}}));
 const settings={DATA_DIR:dir,SMTP_HOST:'smtp.example.com',SMTP_PORT:587,SMTP_SECURE:'false',EMAIL_FROM:'sender@example.com',TEST_EMAIL_TO:'controlled@example.com'};const app=createApp(settings);
 const saved=(await request(app,'/api/invoices',{method:'POST',body:invoice()})).json();const first=(await request(app,`/api/invoices/${saved.id}/email`,{method:'POST',body:{}})).json();
 await request(app,`/api/invoices/${saved.id}`,{method:'PUT',body:{...invoice(),number:'MODIFIED',items:[{description:'Different service',quantity:'1',unitPrice:'500'}]}});
 const response=await request(app,`/api/email-logs/${first.logId}/resend`,{method:'POST',body:{to:'attacker@example.com'}});assert.equal(response.status,200,response.text);assert.notEqual(response.json().logId,first.logId);
 const logs=(await request(app,'/api/email-logs')).json();assert.equal(logs.total,2);assert.equal(logs.stats.sent,2);assert.equal(logs.items[0].resendOf,first.logId);assert.equal(logs.items[0].invoiceNumber,'LOG-QA-001');assert.equal(logs.items[0].totalCents,9900);assert.ok(sentMessages[1].html.includes('$99.00'));assert.equal(sentMessages[1].to,'controlled@example.com');assert.ok(!sentMessages[1].html.includes('MODIFIED'));
}));
test('failed SMTP attempts are saved with safe errors and no false Sent status',async t=>temp(async dir=>{
 t.mock.method(nodemailer,'createTransport',()=>({sendMail:async()=>{throw Object.assign(new Error('secret-smtp-password'),{code:'EAUTH'});}}));const app=createApp({DATA_DIR:dir,SMTP_HOST:'smtp.example.com',EMAIL_FROM:'sender@example.com',TEST_EMAIL_TO:'controlled@example.com'});
 const saved=(await request(app,'/api/invoices',{method:'POST',body:invoice()})).json();const response=await request(app,`/api/invoices/${saved.id}/email`,{method:'POST',body:{}});assert.equal(response.status,500);assert.ok(!response.text.includes('secret-smtp-password'));
 const list=(await request(app,'/api/email-logs')).json();assert.equal(list.stats.failed,1);assert.equal(list.stats.sent,0);assert.equal(list.items[0].sentAt,null);assert.match(list.items[0].error,/authentication failed/);assert.ok(!JSON.stringify(list).includes('secret-smtp-password'));assert.equal(list.items[0].hasPdf,true);
}));
test('legacy previews recover once without inventing recipients, delivery or resend snapshots',async()=>temp(async dir=>{
 const id=randomUUID();await mkdir(join(dir,'email-previews'));await writeFile(join(dir,'email-previews',`${id}.html`),'<article><strong>OLD &amp; PREVIEW</strong><p>Saved preview</p></article>');
 const app=createApp({DATA_DIR:dir});let list=(await request(app,'/api/email-logs')).json();assert.equal(list.total,1);assert.equal(list.items[0].invoiceNumber,'OLD & PREVIEW');assert.equal(list.items[0].status,'preview');assert.equal(list.items[0].recipient,'Not recorded');assert.equal(list.items[0].canResend,false);assert.equal(list.items[0].hasPdf,false);
 list=(await request(app,'/api/email-logs')).json();assert.equal(list.total,1);assert.equal((await request(app,`/api/email-logs/${id}/resend`,{method:'POST',body:{}})).status,409);assert.equal((await request(app,`/api/email-logs/${id}/pdf`)).status,404);
}));
test('history pagination, private paths, page routing and invalid IDs are bounded',async()=>temp(async dir=>{
 const history=emailHistory(dir);for(let i=0;i<3;i++){const v={...invoice(),number:`PAGE-${i}`};const record=await history.create({invoice:v,from:'sender@example.com',recipient:'controlled@example.com',mode:'preview',subject:'Test'});await history.finish(record.id,'preview');}
 const app=createApp({DATA_DIR:dir});let res=await request(app,'/api/email-logs?offset=1&limit=1');assert.equal(res.json().items.length,1);assert.equal(res.json().total,3);
 for(const path of ['/api/email-logs?limit=101','/api/email-logs?offset=-1'])assert.equal((await request(app,path)).status,400);
 for(const path of ['/api/email-logs/invalid','/data/email-logs/anything.json'])assert.equal((await request(app,path)).status,404);
 for(const path of ['/email-logs','/email-logs/'+randomUUID()])assert.equal((await request(app,path)).status,200);
 assert.equal((await readdir(join(dir,'email-logs'))).filter(f=>f.endsWith('.tmp')).length,0);
}));
test('pending attempts cannot be resent and original/resend endpoints share one rate limit',async()=>temp(async dir=>{
 const history=emailHistory(dir),record=await history.create({invoice:invoice(),from:'sender@example.com',recipient:'controlled@example.com',mode:'smtp',subject:'Test'});const app=createApp({DATA_DIR:dir});assert.equal((await request(app,`/api/email-logs/${record.id}/resend`,{method:'POST',body:{}})).status,409);
 const saved=(await request(app,'/api/invoices',{method:'POST',body:invoice()})).json();const first=(await request(app,`/api/invoices/${saved.id}/email`,{method:'POST',body:{}})).json();assert.equal((await request(app,`/api/email-logs/${first.logId}/resend`,{method:'POST',body:{}})).status,200);assert.equal((await request(app,`/api/email-logs/${first.logId}/resend`,{method:'POST',body:{}})).status,429);
}));
test('accepted email with a log-update failure is not reported as a send failure',async t=>{
 t.mock.method(nodemailer,'createTransport',()=>({sendMail:async()=>({accepted:['controlled@example.com'],rejected:[]})}));
 const {mailer}=await import('../src/email.js');const history={create:async()=>({id:randomUUID()}),attach:async()=>{},finish:async()=>{throw new Error('Disk full');}};
 const result=await mailer({SMTP_HOST:'smtp.example.com',EMAIL_FROM:'sender@example.com',TEST_EMAIL_TO:'controlled@example.com'},history)(invoice());assert.equal(result.mode,'smtp');assert.match(result.message,/accepted/);assert.match(result.message,/could not be saved/);assert.ok(result.logId);
});

test('older preview links to a uniquely matching saved invoice and editor data remains complete',async()=>temp(async dir=>{
 const app=createApp({DATA_DIR:dir});
 const saved=(await request(app,'/api/invoices',{method:'POST',body:invoice()})).json();
 const id=randomUUID();await mkdir(join(dir,'email-previews'),{recursive:true});
 await writeFile(join(dir,'email-previews',`${id}.html`),`<!doctype html>${invoiceHTML(saved)}`);
 const list=(await request(app,'/api/email-logs')).json();
 assert.equal(list.items[0].invoiceId,saved.id);
 assert.equal(list.items[0].canResend,false);
 const opened=await request(app,`/api/invoices/${list.items[0].invoiceId}`);
 assert.equal(opened.status,200);assert.deepEqual(opened.json(),saved);
 // A duplicate visible invoice must not be guessed by number or appearance.
 const duplicateId=randomUUID();await writeFile(join(dir,'invoices',`${duplicateId}.json`),JSON.stringify({...saved,id:duplicateId}));
 const other=randomUUID();await writeFile(join(dir,'email-previews',`${other}.html`),invoiceHTML(saved));
 const restarted=createApp({DATA_DIR:dir});
 const updated=(await request(restarted,'/api/email-logs')).json();
 assert.equal(updated.items.find(record=>record.id===other).invoiceId,null);
}));

test('historical fractional quantities stay readable but must be corrected before new PDF or email',async()=>temp(async dir=>{
 const app=createApp({DATA_DIR:dir});const saved=(await request(app,'/api/invoices',{method:'POST',body:invoice()})).json();
 const history=emailHistory(dir),record=await history.create({invoice:saved,from:'sender@example.com',recipient:'controlled@example.com',mode:'preview',subject:'Historical'});
 const older={...saved,items:[{description:'Old fractional service',quantity:'1.5',unitPrice:'50'}]};
 await writeFile(join(dir,'invoices',`${saved.id}.json`),JSON.stringify(older));
 await writeFile(join(dir,'email-logs',`${record.id}.json`),JSON.stringify({...record,status:'preview',invoice:older}));
 await mkdir(join(dir,'email-previews'),{recursive:true});
 assert.equal((await request(app,'/api/email-logs')).status,200);
 assert.equal((await request(app,`/api/invoices/${saved.id}`)).json().items[0].quantity,'1.5');
 const pdf=await request(app,`/api/invoices/${saved.id}/pdf`);assert.equal(pdf.status,400);assert.match(pdf.json().error,/whole number/);
 const sent=await request(app,`/api/invoices/${saved.id}/email`,{method:'POST',body:{}});assert.equal(sent.status,400);
 const resent=await request(app,`/api/email-logs/${record.id}/resend`,{method:'POST',body:{}});assert.equal(resent.status,409);assert.match(resent.json().error,/whole numbers/);
 const corrected=await request(app,`/api/invoices/${saved.id}`,{method:'PUT',body:{...invoice(),items:[{description:'Corrected service',quantity:'2',unitPrice:'50'}]}});assert.equal(corrected.status,200);
 assert.equal((await history.get(record.id)).invoice.items[0].quantity,'1.5');
 assert.equal((await request(app,`/api/invoices/${saved.id}/pdf`)).status,200);
}));
