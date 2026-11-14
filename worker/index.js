// Cloudflare Access JWT: verify signature, issuer, audience, expiry and owner email.
// Fail closed when Access is not configured. Do not trust identity headers alone.
const tradingJwksCache=new Map();
async function verifyTradingAccess(request,env){
 const team=String(env?.TRADING_ACCESS_TEAM||'').trim().toLowerCase();
 const aud=String(env?.TRADING_ACCESS_AUD||'').trim();
 const owner=String(env?.TRADING_OWNER_EMAIL||'').trim().toLowerCase();
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)||!aud||!owner)return {ok:false,status:503,error:'Cloudflare Access не налаштовано'};
 const jwt=request.headers.get('cf-access-jwt-assertion')||'';
 const parts=jwt.split('.');if(parts.length!==3)return {ok:false,status:401,error:'Потрібен вхід через Cloudflare Access'};
 try{
  const decode=s=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0))));
  const header=decode(parts[0]),claims=decode(parts[1]);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256)return {ok:false,status:403,error:'Невірний токен'};
  const now=Math.floor(Date.now()/1000);
  if(claims.iss!=='https://'+team||!(Array.isArray(claims.aud)?claims.aud.includes(aud):claims.aud===aud)||typeof claims.exp!=='number'||claims.exp<=now||typeof claims.nbf==='number'&&claims.nbf>now||String(claims.email||'').toLowerCase()!==owner)return {ok:false,status:403,error:'Доступ заборонено'};
  let entry=tradingJwksCache.get(team);
  if(!entry||entry.until<Date.now()){
   const response=await fetch('https://'+team+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(8000),redirect:'manual'});
   if(!response.ok)return {ok:false,status:503,error:'Неможливо перевірити доступ'};
   const jwks=await response.json();if(!Array.isArray(jwks.keys))throw Error('Invalid JWKS');
   entry={keys:jwks.keys,until:Date.now()+300000};tradingJwksCache.set(team,entry);
  }
  const jwk=entry.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig');
  if(!jwk)return {ok:false,status:403,error:'Невірний підпис'};
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const signature=Uint8Array.from(atob(parts[2].replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(parts[2].length/4)*4,'=')),c=>c.charCodeAt(0));
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,new TextEncoder().encode(parts[0]+'.'+parts[1]));
  return valid?{ok:true}:{ok:false,status:403,error:'Невірний підпис'};
 }catch{return {ok:false,status:403,error:'Не вдалося перевірити авторизацію'}}
}
const tradingHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
async function tradingMarket(request,envForTrading){
 const fail=(error,status)=>new Response(JSON.stringify({error}),{status,headers:tradingHeaders});
 if(request.method!=='GET')return fail('Метод не підтримується',405);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return fail('Невірне джерело',403);
 const access=await verifyTradingAccess(request,envForTrading);
 if(!access.ok)return fail(access.error,access.status);
 try{
  const result=await fetch('https://whitebit.com/api/v4/public/ticker',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'manual'});
  if(!result.ok)return fail('WhiteBIT тимчасово не відповідає',502);
  const data=await result.json();const pairs=['BTC_USDT','ETH_USDT','SOL_USDT','ADA_USDT','XRP_USDT'];const tickers={};
  for(const pair of pairs){const t=data[pair];if(t)tickers[pair]={last_price:String(t.last_price||''),change:Number(t.change||0)}}
  return new Response(JSON.stringify({tickers,mode:'read-only',asOf:new Date().toISOString()}),{headers:tradingHeaders});
 }catch{return fail('Не вдалося отримати дані біржі',502)}
}
import { statsRoute } from './stats.js';
import { loadAdvertisement, manageAdvertisement } from './ads.js';
import { loadSlavutaDiesel } from './fuel.js';
import { loadAirRaid } from './alarm.js';
import { loadTelegramFeed } from './telegram.js';
import { sourceUrl, scheduleUrl, parseSchedules, parseEvents, parseQueues } from './parse.js';

const responseHeaders = {'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff'};
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:responseHeaders});
async function fetchSource(path,params,post=false) {
  const url=new URL(path,'https://hoe.com.ua');
  const headers={'X-Requested-With':'XMLHttpRequest','Accept':post?'text/html':'*/*'};
  const options={headers,signal:AbortSignal.timeout(18000)};
  if(post){options.method='POST';options.body=new URLSearchParams(params);}
  else url.search=new URLSearchParams(params||{}).toString();
  const response=await fetch(url,options);
  if(!response.ok)throw new Error('Сайт обленерго тимчасово не відповідає.');
  const body=await response.text();
  if(body.length>2500000)throw new Error('Завелика відповідь джерела.');
  return body;
}
function numeric(value) {
  if(!/^\d{1,10}$/.test(value||''))throw new Error('Оберіть адресу зі списку.');
  return value;
}
const memoryCache = new Map();
async function cached(request,seconds,load,ctx) {
  const key=request.url;
  const entry=memoryCache.get(key);
  if(entry&&entry.expires>Date.now())return json(entry.data);
  const data=await load();
  if(memoryCache.size>=300)memoryCache.delete(memoryCache.keys().next().value);
  memoryCache.set(key,{data,expires:Date.now()+seconds*1000});
  return json(data);
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/visit'||url.pathname==='/api/visitor-stats'||url.pathname==='/api/ad-event')return statsRoute(request,env);
    if(url.pathname==='/api/ad-management')return manageAdvertisement(request);
    if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'Метод не підтримується.'},405);
    if(url.pathname==='/trading'){
      const access=await verifyTradingAccess(request,env);
      if(!access.ok)return new Response('Access denied: '+access.error,{status:access.status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
      return new Response(tradingPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}});}
    if(url.pathname==='/api/trading/market')return tradingMarket(request,env);
    if(url.pathname==='/ads-manager')return new Response(adsManagerPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data: blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
    if(url.pathname==='/sw.js')return new Response(serviceWorkerCode,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-cache','service-worker-allowed':'/','x-content-type-options':'nosniff'}});
    if(url.pathname==='/manifest.webmanifest')return new Response(JSON.stringify(appManifest),{headers:{'content-type':'application/manifest+json; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'}});
    if(appAssets[url.pathname]){
      const bytes=Uint8Array.from(atob(appAssets[url.pathname]),character=>character.charCodeAt(0));
      return new Response(request.method==='HEAD'?null:bytes,{headers:{'content-type':'image/png','content-length':String(bytes.length),'cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
    }
    if(url.pathname==='/')return new Response(request.method==='HEAD'?null:page,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'}});
    try {
      if(url.pathname==='/api/advertisement')return json(await loadAdvertisement(/^[a-f0-9]{40}$/.test(url.searchParams.get('revision')||'')?url.searchParams.get('revision'):null));
      if(url.pathname==='/api/fuel')return json(await loadSlavutaDiesel());
      if(url.pathname==='/api/air-raid')return json(await loadAirRaid(env));
      if(url.pathname==='/api/telegram')return json(await loadTelegramFeed(await loadAirRaid(env)));
      if(url.pathname==='/api/schedules')return await cached(request,120,async()=>parseSchedules(await fetchSource(new URL(scheduleUrl).pathname)),ctx);
      if(url.pathname==='/api/settlements'||url.pathname==='/api/streets'){
        const term=(url.searchParams.get('term')||'').trim();
        if(term.length<2||term.length>100)return json({error:'Введіть від 2 до 100 символів.'},400);
        const path=url.pathname==='/api/settlements'?'/settlements/':'/streets/'+numeric(url.searchParams.get('settlement'));
        return await cached(request,3600,async()=>{
          const list=JSON.parse(await fetchSource(path,{term}));
          if(!Array.isArray(list)||!list.every(item=>/^\d+$/.test(String(item.id))&&typeof item.text==='string'))throw new Error('Змінився формат списку адрес.');
          return list.map(({id,text})=>({id:String(id),text}));
        },ctx);
      }
      if(url.pathname==='/api/houses')return await cached(request,3600,async()=>{
        const list=JSON.parse(await fetchSource('/houses/'+numeric(url.searchParams.get('street'))));
        if(!Array.isArray(list)||!list.every(item=>typeof item==='string'))throw new Error('Не вдалося завантажити будинки.');
        return list;
      },ctx);
      if(url.pathname==='/api/address') {
        const streetId=numeric(url.searchParams.get('street'));
        const house=url.searchParams.get('house')?.trim();
        if(!house||house.length>40)return json({error:'Оберіть будинок.'},400);
        return await cached(request,60,async()=>{
          const [events,queues]=await Promise.all([
            fetchSource('/shutdown-events',{streetId,house},true),
            fetchSource('/shutdown-queues',{streetId,house},true)
          ]);
          return {...parseEvents(events),queues:parseQueues(queues),source:sourceUrl,fetchedAt:new Date().toISOString()};
        },ctx);
      }
      return json({error:'Сторінку не знайдено.'},404);
    }catch(error){
      return json({error:error.name==='TimeoutError'?'Джерело відповідає надто довго. Спробуйте оновити.':error.message||'Не вдалося отримати дані обленерго.'},502);
    }
  }
};
