import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {DELIVERY_FILES} from './runtime-files.js';
const root=process.cwd(),types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const host=process.argv[2]||'127.0.0.1',port=Number(process.argv[3]||4173);
Object.assign(types,{'.png':'image/png','.webmanifest':'application/manifest+json; charset=utf-8'});
const assets=new Set(DELIVERY_FILES.map(file=>'/'+file));
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const asset=pathname==='/'?'/index.html':pathname;if(!assets.has(asset)){res.writeHead(404).end();return;}const file=path.resolve(root,'.'+asset);const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});res.end(bytes);}catch{if(!res.headersSent)res.writeHead(404);res.end();}}).listen(port,host,()=>console.log(`Preview: http://${host}:${port}`));
