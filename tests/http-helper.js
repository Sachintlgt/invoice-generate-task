// Exercise real Express middleware with in-memory HTTP streams, without a TCP port.
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
export async function request(app, url, {method='GET', body, rawBody, headers={}}={}) {
 const socket = new Duplex({read(){},write(chunk,encoding,done){done();}});
 socket.remoteAddress = '127.0.0.1';
 const req = new IncomingMessage(socket);
 req.complete=true;req.method=method;req.url=url;req.httpVersion='1.1';req.httpVersionMajor=1;req.httpVersionMinor=1;
 const payload=rawBody ?? (body===undefined ? '' : JSON.stringify(body));
 req.headers={host:'localhost', ...(payload?{'content-type':'application/json','content-length':String(Buffer.byteLength(payload))}:{}),...headers};
 const res=new ServerResponse(req);res.assignSocket(socket);
 const chunks=[];const write=res.write.bind(res),end=res.end.bind(res);
 res.write=(chunk,...args)=>{if(chunk)chunks.push(Buffer.from(chunk));return write(chunk,...args);};
 res.end=(chunk,...args)=>{if(chunk)chunks.push(Buffer.from(chunk));return end(chunk,...args);};
 const finished=new Promise((resolve,reject)=>{res.on('finish',resolve);res.on('error',reject);});
 app(req,res);
 req.push(payload||null);if(payload)req.push(null);
 await finished;
 const buffer=Buffer.concat(chunks),text=buffer.toString();socket.destroy();
 return {status:res.statusCode,headers:res.getHeaders(),buffer,text,json:()=>JSON.parse(text)};
}
