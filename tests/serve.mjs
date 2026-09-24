import http from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
const root=process.cwd();
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".csv":"text/csv",".png":"image/png",".svg":"image/svg+xml",".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);if(pathname==="/mreo-config.js"){res.writeHead(200,{"Content-Type":"text/javascript"});res.end('window.MREO_CONFIG=Object.freeze({mode:"demo",apiBase:"",defaultDays:1,standardDays:21,participationCents:100,sellerSuccessFee:1000});');return;}const file=resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));if(!file.startsWith(root+"/")){res.writeHead(403);res.end();return;}const bytes=await readFile(file);res.writeHead(200,{"Content-Type":types[extname(file)]||"application/octet-stream"});res.end(bytes);}catch{res.writeHead(404);res.end("Not found");}}).listen(4173,"127.0.0.1");
