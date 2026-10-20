import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
export function storage(directory) {
 const root = resolve(directory, 'invoices');
 let queue = Promise.resolve();
 const path = id => {if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw Object.assign(new Error('Invoice not found.'), {status:404}); return join(root, `${id}.json`);};
 return {
 async list() {
  await queue;
  let files;try{files=await readdir(root);}catch(error){if(error.code==='ENOENT')return [];throw error;}
  const invoices=await Promise.all(files.filter(file=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/.test(file)).map(async file=>{
   const invoice=JSON.parse(await readFile(join(root,file),'utf8'));
   return {id:file.slice(0,-5),number:invoice.number,customerName:invoice.customer.name,issueDate:invoice.issueDate,dueDate:invoice.dueDate,updatedAt:invoice.updatedAt,totalCents:invoice.totals.total,itemCount:invoice.items.length};
  }));
  return invoices.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))||a.id.localeCompare(b.id));
 },
 async get(id) {try {return JSON.parse(await readFile(path(id), 'utf8'));} catch(e) {if(e.code==='ENOENT') throw Object.assign(new Error('Invoice not found.'),{status:404}); throw e;}},
 save(id, invoice) {const operation = queue.then(async()=>{await mkdir(root,{recursive:true});const target=path(id);
 // Check uniqueness inside the same queue as the write so concurrent requests
 // cannot both create an invoice with the same number.
 const key=String(invoice.number).trim().toLowerCase();
 let previous;try{previous=JSON.parse(await readFile(target,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const unchangedNumber=previous&&String(previous.number).trim().toLowerCase()===key;
 for(const file of await readdir(root)) {
  if(!/^[0-9a-f-]{36}\.json$/.test(file)||file===`${id}.json`)continue;
  const existing=JSON.parse(await readFile(join(root,file),'utf8'));
  if(!unchangedNumber&&String(existing.number).trim().toLowerCase()===key)throw Object.assign(new Error('Invoice number already exists. Open the saved invoice to edit it, or choose a different invoice number.'),{status:409});
 }
 const temp=target+`.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(invoice,null,2),{mode:0o600});await rename(temp,target);return invoice;});queue=operation.catch(()=>{});return operation;}
 };
}
