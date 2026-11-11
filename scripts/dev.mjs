import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
spawnSync('node',['scripts/build.mjs'],{stdio:'inherit'});
const worker=await import('../dist/server/index.js');
createServer(async(req,res)=>{
  try {
    const response=await worker.default.fetch(new Request('http://localhost'+req.url),{},{});
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500,{'content-type':'text/plain'});res.end(error.message)}
}).listen(Number(process.env.PORT||4173),'0.0.0.0');
