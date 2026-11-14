import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const call=(path,options={})=>worker.fetch(new Request('https://onmisto.example'+path,options),{},{});
test('trading page has no public navigation in home',async()=>{
 const r=await call('/');assert.equal(r.status,200);assert.doesNotMatch(await r.text(),/href=["']\/trading["']/);
});
test('market endpoint denies unauthenticated requests',async()=>{
 const r=await call('/api/trading/market');assert.equal(r.status,401);
});
test('market endpoint rejects unsupported methods',async()=>{
 const r=await call('/api/trading/market',{method:'POST'});assert.equal(r.status,405);
});
test('market endpoint rejects cross-origin requests',async()=>{
 const r=await call('/api/trading/market',{headers:{origin:'https://attacker.example'}});assert.equal(r.status,403);
});
test('trading page does not include exchange credentials',async()=>{
 const r=await call('/trading');assert.equal(r.status,200);
 const html=await r.text();assert.match(html,/Приватний доступ/);assert.match(html,/Реальні ордери заблоковані/);
 assert.doesNotMatch(html,/api[_-]?secret\s*[:=]/i);
});
