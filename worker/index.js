import { loadAdvertisement } from './ads.js';
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
    if(request.method!=='GET')return json({error:'Метод не підтримується.'},405);
    if(url.pathname==='/ads-manager')return new Response(adsManagerPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https://api.github.com; img-src data: blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
    if(url.pathname==='/sw.js')return new Response(serviceWorkerCode,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-cache','service-worker-allowed':'/','x-content-type-options':'nosniff'}});
    if(url.pathname==='/manifest.webmanifest')return new Response(JSON.stringify(appManifest),{headers:{'content-type':'application/manifest+json; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'}});
    if(appAssets[url.pathname]){
      const bytes=Uint8Array.from(atob(appAssets[url.pathname]),character=>character.charCodeAt(0));
      return new Response(bytes,{headers:{'content-type':'image/png','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
    }
    if(url.pathname==='/')return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'}});
    try {
      if(url.pathname==='/api/advertisement')return json(await loadAdvertisement());
      if(url.pathname==='/api/fuel')return json(await loadSlavutaDiesel());
      if(url.pathname==='/api/air-raid')return json(await loadAirRaid(env));
      if(url.pathname==='/api/telegram')return json(await loadTelegramFeed());
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
