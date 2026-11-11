const statsHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
function statsReply(data,status=200){return new Response(JSON.stringify(data),{status,headers:statsHeaders})}
export function statsDay(time=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time))}
export function statsDayOffset(day,offset){return new Date(Date.parse(day+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10)}
async function statsHash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('')}
export function statsDevice(ua){return /iPad|Tablet|Android(?!.*Mobile)/i.test(ua)?'tablet':/iPhone|Android|Mobile/i.test(ua)?'mobile':'desktop'}
const statsOwnerCache=new Map();
async function statsOwner(auth){
  if(!/^Bearer [A-Za-z0-9_]{20,255}$/.test(auth))return false;
  const hash=await statsHash(auth);if(statsOwnerCache.get(hash)>Date.now())return true;
  const r=await fetch('https://api.github.com/user',{headers:{Authorization:auth,Accept:'application/vnd.github+json','User-Agent':'onmisto-stats'},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!r.ok)return false;const user=await r.json();if(user.login!=='original989')return false;
  if(statsOwnerCache.size>=20)statsOwnerCache.clear();statsOwnerCache.set(hash,Date.now()+60000);return true;
}
export async function statsRoute(request,env){
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(origin&&origin!==url.origin)return statsReply({error:'Запит з іншого сайту відхилено.'},403);
  try{
    if(url.pathname==='/api/visit'){
      if(request.method!=='POST')return statsReply({error:'Метод не підтримується.'},405);
      if(origin!==url.origin)return statsReply({error:'Невірне джерело запиту.'},403);
      if(/bot|crawl|spider|preview|facebookexternalhit/i.test(request.headers.get('user-agent')||''))return new Response(null,{status:204,headers:{'cache-control':'no-store'}});
      if(!env?.VISIT_STATS)return statsReply({error:'Збір статистики ще не підключений.'},503);
      if(Number(request.headers.get('content-length'))>1024)return statsReply({error:'Завеликий запит.'},413);
      const reader=request.body?.getReader();if(!reader)return statsReply({error:'Немає даних.'},400);let size=0,chunks=[];
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();return statsReply({error:'Завеликий запит.'},413)}chunks.push(value)}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
      let data;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{return statsReply({error:'Невірні дані.'},400)}
      if(!/^[a-f0-9-]{36}$/.test(data.visitor||'')||!/^[a-f0-9-]{36}$/.test(data.session||''))return statsReply({error:'Невірні дані.'},400);
      const source=['instagram','telegram','facebook','search','other'].includes(data.source)?data.source:'direct';
      const visitor=await statsHash('visitor:'+data.visitor),session=await statsHash('session:'+data.session);
      const stub=env.VISIT_STATS.get(env.VISIT_STATS.idFromName('onmisto-visits-v1'));
      return await stub.fetch(new Request('https://stats/record',{method:'POST',body:JSON.stringify({visitor,session,source,device:statsDevice(request.headers.get('user-agent')||'')})}));
    }
    if(request.method!=='GET')return statsReply({error:'Метод не підтримується.'},405);
    if(!await statsOwner(request.headers.get('authorization')||''))return statsReply({error:'Статистика доступна лише власнику original989. Перевір ключ GitHub.'},403);
    if(!env?.VISIT_STATS)return statsReply({error:'Сховище статистики ще не підключене.'},503);
    const stub=env.VISIT_STATS.get(env.VISIT_STATS.idFromName('onmisto-visits-v1'));
    return await stub.fetch(new Request('https://stats/summary'));
  }catch{return statsReply({error:'Статистика тимчасово недоступна. Спробуй оновити.'},503)}
}
// Plain exported Durable Object class; receives only trusted, validated Worker requests.
export class VisitStats {
  constructor(state){
    this.sql=state.storage.sql;this.lastPrune='';
    this.sql.exec(`CREATE TABLE IF NOT EXISTS visits(session TEXT PRIMARY KEY,visitor TEXT NOT NULL,day TEXT NOT NULL,started INTEGER NOT NULL,last_seen INTEGER NOT NULL,source TEXT NOT NULL,device TEXT NOT NULL);CREATE INDEX IF NOT EXISTS visits_day ON visits(day);CREATE INDEX IF NOT EXISTS visits_seen ON visits(last_seen);CREATE TABLE IF NOT EXISTS stats_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  }
  async fetch(request){
    const now=Date.now(),day=statsDay(now);
    if(this.lastPrune!==day){this.sql.exec('DELETE FROM visits WHERE day < ?',statsDayOffset(day,-29));this.lastPrune=day}
    if(new URL(request.url).pathname==='/record'){
      const data=await request.json();
      const session=day+':'+data.session;
      this.sql.exec("INSERT OR IGNORE INTO stats_meta(key,value) VALUES('startedAt',?)",new Date(now).toISOString());
      // Repeated heartbeats update activity, not visit totals. A session belongs to one visitor.
      this.sql.exec('INSERT INTO visits(session,visitor,day,started,last_seen,source,device) VALUES(?,?,?,?,?,?,?) ON CONFLICT(session) DO UPDATE SET last_seen=excluded.last_seen WHERE visits.visitor=excluded.visitor',session,data.visitor,day,now,now,data.source,data.device);
      return new Response(null,{status:204,headers:{'cache-control':'no-store'}});
    }
    const period=days=>{const from=statsDayOffset(day,1-days);return this.sql.exec('SELECT COUNT(*) AS visits,COUNT(DISTINCT visitor) AS visitors FROM visits WHERE day>=?',from).toArray()[0]};
    const daily=this.sql.exec('SELECT day,COUNT(*) AS visits,COUNT(DISTINCT visitor) AS visitors FROM visits WHERE day>=? GROUP BY day ORDER BY day',statsDayOffset(day,-13)).toArray();
    const chart=Array.from({length:14},(_,i)=>{const date=statsDayOffset(day,i-13);return daily.find(r=>r.day===date)||{day:date,visits:0,visitors:0}});
    return statsReply({today:period(1),week:period(7),month:period(30),online:this.sql.exec('SELECT COUNT(DISTINCT visitor) AS n FROM visits WHERE last_seen>=?',now-300000).toArray()[0].n,chart,sources:this.sql.exec('SELECT source AS name,COUNT(*) AS visits FROM visits WHERE day>=? GROUP BY source ORDER BY visits DESC',statsDayOffset(day,-29)).toArray(),devices:this.sql.exec('SELECT device AS name,COUNT(*) AS visits FROM visits WHERE day>=? GROUP BY device ORDER BY visits DESC',statsDayOffset(day,-29)).toArray(),startedAt:this.sql.exec("SELECT value FROM stats_meta WHERE key='startedAt'").toArray()[0]?.value||null,updatedAt:new Date(now).toISOString(),timeZone:'Europe/Kyiv'});
  }
}
