import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.js';
import {request} from './http-helper.js';
const fixture=()=>({business:{name:'Test Studio',email:'',address:'Demo address'},customer:{name:'Demo Client',email:'',address:''},number:'QA-DECIMAL',issueDate:'2026-10-20',dueDate:'2026-10-21',notes:'Demo',items:[{description:'Decimal work',quantity:'3',unitPrice:'19.99'}],discount:'0.01',taxRate:'8.875',customFields:[{label:'Private',value:'HIDDEN-MARKER',visible:false}]});
test('Express HTTP stack: create, read, update and preview email',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-http-'));const app=createApp({DATA_DIR:dir});
 try {
 let res=await request(app,'/api/invoices',{method:'POST',body:{...fixture(),totals:{total:1}}});assert.equal(res.status,201,res.text);const invoice=res.json();assert.equal(invoice.totals.total,6528);
 res=await request(app,`/api/invoices/${invoice.id}`);assert.deepEqual(res.json(),invoice);
 res=await request(app,`/api/invoices/${invoice.id}/pdf`);assert.equal(res.status,200);assert.equal(res.headers['content-type'],'application/pdf');assert.ok(res.headers['content-disposition'].includes('attachment;'));assert.ok(res.buffer.subarray(0,5).equals(Buffer.from('%PDF-')));
 res=await request(app,`/api/invoices/${invoice.id}`,{method:'PUT',body:{...fixture(),number:'QA-UPDATED'}});assert.equal(res.json().number,'QA-UPDATED');
 res=await request(app,`/api/invoices/${invoice.id}/email`,{method:'POST',body:{}});assert.equal(res.status,200,res.text);assert.equal(res.json().mode,'preview');const html=await readFile(join(dir,'email-previews',res.json().previewFile),'utf8');assert.ok(html.includes('$65.28'));assert.ok(!html.includes('HIDDEN-MARKER'));const pdf=await readFile(join(dir,'email-previews',res.json().previewPdfFile));assert.ok(pdf.subarray(0,5).equals(Buffer.from('%PDF-')));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Express validation rejects bad values, malformed JSON and excessive payloads',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-validation-'));const app=createApp({DATA_DIR:dir});
 try{
 const good=fixture();const invalid=[
 {...good,discount:'100'}, {...good,discount:'-1'}, {...good,taxRate:'-0.01'},
 {...good,taxRate:'1.12345'}, {...good,dueDate:'2026-10-19'}, {...good,issueDate:'2026-02-30'},
 {...good,items:[]}, {...good,items:[{description:'X',quantity:'-1',unitPrice:'1'}]},
 {...good,items:[{description:'X',quantity:'1',unitPrice:'-1'}]},
 {...good,items:[{description:'X',quantity:'1.12345',unitPrice:'1'}]},
 {...good,items:[{description:'X',quantity:'1',unitPrice:'1.001'}]},
 {...good,items:[{description:'X',quantity:'1e2',unitPrice:'1'}]},
 {...good,business:{...good.business,name:''}}, {...good,customer:{...good.customer,email:'invalid'}},
 {...good,customFields:Array.from({length:31},()=>({label:'X',value:'',visible:true}))}
 ];
 for(const body of invalid){const res=await request(app,'/api/invoices',{method:'POST',body});assert.equal(res.status,400,res.text);}
 let res=await request(app,'/api/invoices',{method:'POST',rawBody:'{"broken":'});assert.equal(res.status,400);
 res=await request(app,'/api/invoices',{method:'POST',rawBody:'x'.repeat(140000)});assert.equal(res.status,413);
 res=await request(app,'/api/invoices',{method:'POST',rawBody:'text',headers:{'content-type':'text/plain'}});assert.equal(res.status,415);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('security: origins, private files, unknown IDs, headers and email rate limiting',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-security-'));const app=createApp({DATA_DIR:dir});
 try{
 let res=await request(app,'/api/invoices',{method:'POST',body:fixture(),headers:{origin:'https://untrusted.example'}});assert.equal(res.status,403);
 for(const path of ['/api/invoices/invalid','/api/invoices/../../secret','/.env','/data/invoices/test.json','/src/config.js'])assert.equal((await request(app,path)).status,404,path);
 res=await request(app,'/api/config');assert.equal(res.status,200);assert.deepEqual(res.json(),{emailMode:'preview'});assert.ok(res.headers['content-security-policy']);assert.equal(res.headers['cache-control'],'no-store');assert.equal(res.headers['x-powered-by'],undefined);
 const created=(await request(app,'/api/invoices',{method:'POST',body:fixture()})).json();
 for(let i=0;i<3;i++)assert.equal((await request(app,`/api/invoices/${created.id}/email`,{method:'POST',body:{}})).status,200);
 res=await request(app,`/api/invoices/${created.id}/email`,{method:'POST',body:{}});assert.equal(res.status,429);assert.ok(res.headers['retry-after']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('maximum 100 long items and 30 custom fields persist without data loss',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-long-'));const app=createApp({DATA_DIR:dir});
 try{
 const body={...fixture(),number:'QA-100-LONG',items:Array.from({length:100},(_,n)=>({description:`ITEM-${String(n+1).padStart(3,'0')} `+'Detailed service description with deliverables. '.repeat(12).slice(0,480),quantity:'3',unitPrice:'19.99'})),customFields:Array.from({length:30},(_,n)=>({label:`Field ${n+1}`,value:'V'.repeat(500),visible:n%2===0})),notes:'Thank you. '.repeat(180)};
 let res=await request(app,'/api/invoices',{method:'POST',body});assert.equal(res.status,201,res.text);const saved=res.json();assert.equal(saved.items.length,100);assert.equal(saved.customFields.length,30);assert.equal(saved.totals.subtotal,599700);
 res=await request(app,`/api/invoices/${saved.id}`);assert.deepEqual(res.json().items,body.items.map(item=>({...item,description:item.description.trim()})));assert.equal(res.json().notes,body.notes.trim());
 res=await request(app,'/api/invoices',{method:'POST',body:{...body,items:[...body.items,body.items[0]]}});assert.equal(res.status,400);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('empty or omitted discount saves as zero and updates successfully',async()=>{const dir=await mkdtemp(join(tmpdir(),'folio-zero-discount-'));const app=createApp({DATA_DIR:dir});try{for(const discount of ['', '   ', undefined]){const body={...fixture(),number:`ZERO-${discount===undefined?'omitted':discount.length}`,items:[{description:'Work',quantity:'2',unitPrice:'50.00'}],taxRate:'10',discount};let response=await request(app,'/api/invoices',{method:'POST',body});assert.equal(response.status,201,response.text);const saved=response.json();assert.equal(saved.discount,'0');assert.equal(saved.totals.total,11000);response=await request(app,`/api/invoices/${saved.id}`,{method:'PUT',body:{...body,discount:''}});assert.equal(response.status,200,response.text);assert.equal(response.json().discount,'0');assert.equal(response.json().totals.total,11000);}}finally{await rm(dir,{recursive:true,force:true});}});

test('duplicate invoice numbers are rejected atomically while updates retain the same ID',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-duplicate-'));const app=createApp({DATA_DIR:dir});
 try {
 const responses=await Promise.all(Array.from({length:5},()=>request(app,'/api/invoices',{method:'POST',body:fixture()})));
 assert.equal(responses.filter(r=>r.status===201).length,1);
 assert.equal(responses.filter(r=>r.status===409).length,4);
 const saved=responses.find(r=>r.status===201).json();
 let result=await request(app,'/api/invoices',{method:'POST',body:{...fixture(),number:'  qa-decimal  '}});
 assert.equal(result.status,409);
 result=await request(app,`/api/invoices/${saved.id}`,{method:'PUT',body:{...fixture(),notes:'Edited'}});
 assert.equal(result.status,200);assert.equal(result.json().id,saved.id);
 const second=(await request(app,'/api/invoices',{method:'POST',body:{...fixture(),number:'OTHER'}})).json();
 result=await request(app,`/api/invoices/${second.id}`,{method:'PUT',body:fixture()});assert.equal(result.status,409);
 assert.equal((await readdir(join(dir,'invoices'))).filter(name=>name.endsWith('.json')).length,2);
 result=await request(app,'/api/invoices',{method:'POST',body:{...fixture(),number:' ',business:{...fixture().business,name:' '}}});assert.equal(result.status,400);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('existing duplicate-number records can still be updated without creating another invoice',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-legacy-update-'));const app=createApp({DATA_DIR:dir});
 try {
 const saved=(await request(app,'/api/invoices',{method:'POST',body:fixture()})).json();
 const {writeFile}=await import('node:fs/promises');const {randomUUID}=await import('node:crypto');const other=randomUUID();
 await writeFile(join(dir,'invoices',`${other}.json`),JSON.stringify({...saved,id:other}));
 const response=await request(app,`/api/invoices/${saved.id}`,{method:'PUT',body:{...fixture(),notes:'Updated existing invoice',items:[{description:'Edited service',quantity:'3',unitPrice:'50'}]}});
 assert.equal(response.status,200,response.text);assert.equal(response.json().id,saved.id);
 const reopened=(await request(app,`/api/invoices/${saved.id}`)).json();
 assert.equal(reopened.notes,'Updated existing invoice');assert.equal(reopened.items[0].quantity,'3');
 assert.equal((await readdir(join(dir,'invoices'))).length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('saved invoice list supports create, add, edit, remove and reopen without another invoice',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-saved-list-'));const app=createApp({DATA_DIR:dir});
 try {
  let response=await request(app,'/api/invoices');assert.equal(response.status,200);assert.deepEqual(response.json(),{items:[]});assert.equal(response.headers['cache-control'],'no-store');
  assert.equal((await request(app,'/invoices')).status,200);
  const body={...fixture(),number:'SAVED-FLOW',items:[{description:'Initial service',quantity:'2',unitPrice:'50'}],discount:'10',taxRate:'10'};
  const created=(await request(app,'/api/invoices',{method:'POST',body})).json();
  let listed=(await request(app,'/api/invoices')).json().items;assert.equal(listed.length,1);assert.equal(listed[0].id,created.id);assert.equal(listed[0].totalCents,9900);assert.equal(listed[0].itemCount,1);assert.ok(!('notes' in listed[0]));assert.ok(!('customFields' in listed[0]));assert.ok(!('business' in listed[0]));
  const added={...body,items:[...body.items,{description:'Added service',quantity:'2',unitPrice:'19.99'}]};
  response=await request(app,`/api/invoices/${created.id}`,{method:'PUT',body:added});assert.equal(response.status,200,response.text);assert.equal(response.json().id,created.id);assert.equal(response.json().totals.total,14298);
  let reopened=(await request(app,`/api/invoices/${created.id}`)).json();assert.deepEqual(reopened.items,added.items);assert.deepEqual(reopened.customFields,body.customFields);
  const edited={...added,notes:'Updated saved invoice',customer:{...body.customer,name:'Updated Client'},items:[{description:'Edited description',quantity:'3',unitPrice:'12.34'},added.items[1]]};
  response=await request(app,`/api/invoices/${created.id}`,{method:'PUT',body:edited});assert.equal(response.status,200);assert.equal(response.json().totals.total,7370);
  listed=(await request(app,'/api/invoices')).json().items;assert.equal(listed.length,1);assert.equal(listed[0].customerName,'Updated Client');assert.equal(listed[0].itemCount,2);assert.equal(listed[0].totalCents,7370);
  const removed={...edited,items:[edited.items[1]]};response=await request(app,`/api/invoices/${created.id}`,{method:'PUT',body:removed});assert.equal(response.status,200);assert.equal(response.json().totals.total,3298);
  const restarted=createApp({DATA_DIR:dir});reopened=(await request(restarted,`/api/invoices/${created.id}`)).json();assert.deepEqual(reopened.items,removed.items);assert.equal(reopened.notes,edited.notes);assert.equal(reopened.customer.name,'Updated Client');assert.equal((await request(restarted,'/api/invoices')).json().items.length,1);
  assert.equal((await readdir(join(dir,'invoices'))).filter(name=>name.endsWith('.json')).length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('failed saved-invoice update never creates a replacement and list ignores unrelated files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-saved-missing-'));const app=createApp({DATA_DIR:dir});
 try{
  const created=(await request(app,'/api/invoices',{method:'POST',body:fixture()})).json();
  const {writeFile}=await import('node:fs/promises');await writeFile(join(dir,'invoices','unrelated.json'),'{}');
  const missing='00000000-0000-4000-8000-000000000000';assert.equal((await request(app,`/api/invoices/${missing}`,{method:'PUT',body:fixture()})).status,404);
  const listed=(await request(app,'/api/invoices')).json().items;assert.equal(listed.length,1);assert.equal(listed[0].id,created.id);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('create and update reject fractional quantities without modifying the saved invoice',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-whole-quantity-'));const app=createApp({DATA_DIR:dir});
 try {
  const body=fixture();const created=(await request(app,'/api/invoices',{method:'POST',body})).json();
  for(const quantity of ['0.5','1.5','1.0','1e2','-1','1000001','']){
   const invalid={...body,number:`INVALID-${quantity}`,items:[{...body.items[0],quantity}]};
   for(const [url,method] of [['/api/invoices','POST'],[`/api/invoices/${created.id}`,'PUT']]){
    const response=await request(app,url,{method,body:invalid});assert.equal(response.status,400,response.text);assert.ok(response.json().issues.some(issue=>issue.path==='items.0.quantity'));
   }
  }
  assert.deepEqual((await request(app,`/api/invoices/${created.id}`)).json(),created);
  assert.equal((await request(app,'/api/invoices')).json().items.length,1);
  const valid={...body,items:[{...body.items[0],quantity:'4'}]};assert.equal((await request(app,`/api/invoices/${created.id}`,{method:'PUT',body:valid})).status,200);
  assert.equal((await request(app,`/api/invoices/${created.id}`)).json().items[0].quantity,'4');
 }finally{await rm(dir,{recursive:true,force:true});}
});
