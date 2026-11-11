import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAd,manageAdvertisement,loadAdvertisement} from '../worker/ads.js';
const valid={enabled:true,title:'Доставка квітів',description:'Славута',link:'https://example.com',image:''};
test('advertisement validates content and keeps off switch',()=>{assert.deepEqual(normalizeAd(valid),valid);assert.equal(normalizeAd({...valid,enabled:false,title:'',link:''}).enabled,false)});
test('rejects executable links, credentials, remote image and oversized content',()=>{for(const link of ['javascript:alert(1)','http://example.com','https://a:b@example.com'])assert.throws(()=>normalizeAd({...valid,link}));for(const image of ['https://tracker.example/a.png','data:image/svg+xml;base64,PHN2Zz4='])assert.throws(()=>normalizeAd({...valid,image}));assert.throws(()=>normalizeAd({...valid,title:'x'.repeat(91)}));assert.throws(()=>normalizeAd({...valid,title:''}));assert.throws(()=>normalizeAd({...valid,enabled:'false'}));});
test('compiled routes serve isolated manager and disabled public ad',async()=>{const {default:worker}=await import('../dist/server/index.js?test');const manager=await worker.fetch(new Request('https://test/ads-manager'),{},{});assert.equal(manager.status,200);assert.equal(manager.headers.get('cache-control'),'no-store');assert.match(manager.headers.get('content-security-policy'),/connect-src 'self'/);assert.match(await manager.text(),/Попередній перегляд/);const oldFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({...valid,enabled:false}));try{const api=await worker.fetch(new Request('https://test/api/advertisement'),{},{});assert.equal((await api.json()).enabled,false)}finally{globalThis.fetch=oldFetch}const home=await worker.fetch(new Request('https://test/'),{},{});const html=await home.text();assert.match(html,/function adSlot/);assert.doesNotMatch(html,/\/\* ADVERTISEMENT \*\//);});

test('management rejects unsigned and cross-origin writes; proxies only fixed validated advertisement',async()=>{
  assert.equal((await manageAdvertisement(new Request('https://site/api/ad-management'))).status,401);
  const auth='Bearer '+'x'.repeat(30),url='https://site/api/ad-management';
  assert.equal((await manageAdvertisement(new Request(url,{headers:{authorization:auth,origin:'https://evil'}}))).status,403);
  const old=globalThis.fetch;let captured;
  globalThis.fetch=async(u,opts)=>{captured={u,opts};return new Response(JSON.stringify({content:{sha:'b'.repeat(40)}}))};
  try{
    const res=await manageAdvertisement(new Request(url,{method:'PUT',headers:{authorization:auth,origin:'https://site'},body:JSON.stringify({sha:'a'.repeat(40),ad:valid})}));
    assert.equal(res.status,200);assert.equal((await res.json()).sha,'b'.repeat(40));
    assert.equal(captured.u,'https://api.github.com/repos/original989/onmisto/contents/data/ads.json');
    const sent=JSON.parse(captured.opts.body);assert.equal(sent.branch,'main');assert.deepEqual(JSON.parse(Buffer.from(sent.content,'base64').toString()),valid);
    const bad=await manageAdvertisement(new Request(url,{method:'PUT',headers:{authorization:auth},body:JSON.stringify({sha:'a'.repeat(40),ad:{...valid,link:'javascript:alert(1)'}})}));assert.equal(bad.status,400);
  }finally{globalThis.fetch=old}
});

test('publication verification bypasses an older cached banner',async()=>{const old=globalThis.fetch;let ad={...valid,title:'Old'};let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify(ad))};try{const first=await loadAdvertisement('a'.repeat(40));assert.equal(first.title,'Old');ad={...valid,title:'New'};assert.equal((await loadAdvertisement()).title,'Old');assert.equal((await loadAdvertisement('b'.repeat(40))).title,'New');assert.equal(calls,2)}finally{globalThis.fetch=old}});
