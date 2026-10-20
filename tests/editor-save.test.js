import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
function functionSource(name,next){return source.slice(source.indexOf(`function ${name}(`),source.indexOf(next,source.indexOf(`function ${name}(`)));}
test('editor saves actual changed data even without an input event and skips unchanged repeat saves',async()=>{
 const calls=[],elements=new Map();
 const context={invoice:{number:'EDIT-1',notes:'Before'},savedId:'saved-id',dirty:false,lastSavedContent:null,
 read(){},syncURL(){},$:(key)=>{if(!elements.has(key))elements.set(key,{});return elements.get(key);},
 api:async(url,method,body)=>{calls.push({url,method,body:structuredClone(body)});return {...body,id:'saved-id'};}};
 runInNewContext(functionSource('contentKey','\nfunction read')+'\nasync '+functionSource('save','\nasync function action')+'\nlastSavedContent=contentKey();',context);
 context.invoice.notes='After';await context.save();assert.equal(calls.length,1);assert.equal(calls[0].method,'PUT');assert.equal(calls[0].body.notes,'After');
 await context.save();assert.equal(calls.length,1);
 context.invoice.notes='Failed edit';context.api=async()=>{throw new Error('Save failed');};
 await assert.rejects(context.save(),/Save failed/);assert.notEqual(context.lastSavedContent,context.contentKey());
});

test('editor resumes its saved identity while explicit invoice and New invoice take priority',()=>{
 const context={URL,location:{href:'http://localhost:3000/'},localStorage:{getItem:()=> 'remembered-id'}};
 runInNewContext(functionSource('initialInvoiceId','\nfunction syncURL'),context);
 assert.equal(context.initialInvoiceId(),'remembered-id');
 context.location.href='http://localhost:3000/?invoice=explicit-id#editor';assert.equal(context.initialInvoiceId(),'explicit-id');
 context.location.href='http://localhost:3000/?new=1#editor';assert.equal(context.initialInvoiceId(),null);
 context.location.href='http://localhost:3000/';context.localStorage.getItem=()=>{throw new Error('Blocked storage');};assert.equal(context.initialInvoiceId(),null);
});
