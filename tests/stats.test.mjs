import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {VisitStats,statsDay,statsDayOffset,statsDevice,statsRoute} from '../worker/stats.js';
function storage(){const db=new DatabaseSync(':memory:');return {db,sql:{exec(query,...args){if(!args.length&&query.includes(';')){db.exec(query);return {toArray:()=>[]}}const s=db.prepare(query);const rows=s.columns().length?s.all(...args):(s.run(...args),[]);return {toArray:()=>rows}}}}}
test('Kyiv calendar dates handle midnight and DST; coarse device groups',()=>{assert.equal(statsDay(Date.parse('2026-11-11T22:05:00Z')),'2026-11-12');assert.equal(statsDayOffset('2026-03-29',-1),'2026-03-28');assert.equal(statsDevice('iPhone Mobile'),'mobile');assert.equal(statsDevice('iPad'),'tablet');assert.equal(statsDevice('Windows'),'desktop')});
test('durable SQLite statistics deduplicate heartbeats, count visitors across days, and prune old rows',async()=>{
 const store=storage(),doStats=new VisitStats({storage:store}),old=Date.now;let clock=Date.parse('2026-11-11T18:00:00Z');Date.now=()=>clock;
 const record=(session,visitor='v1')=>doStats.fetch(new Request('https://stats/record',{method:'POST',body:JSON.stringify({visitor,session,source:'instagram',device:'mobile'})}));
 const summary=async()=>await(await doStats.fetch(new Request('https://stats/summary'))).json();
 try{
  await record('a');clock+=60000;await record('a');let d=await summary();assert.deepEqual(d.today,{visits:1,visitors:1});
  await record('b');await record('c','v2');d=await summary();assert.deepEqual(d.today,{visits:3,visitors:2});assert.equal(d.online,2);
  clock+=360000;await record('b');assert.equal((await summary()).online,1);
  clock=Date.parse('2026-11-12T18:00:00Z');await record('next');d=await summary();assert.deepEqual(d.today,{visits:1,visitors:1});assert.deepEqual(d.week,{visits:4,visitors:2});assert.equal(d.chart.length,14);assert.equal(d.sources[0].visits,4);assert.ok(d.startedAt);
  clock=Date.parse('2026-12-13T18:00:00Z');d=await summary();assert.equal(d.month.visits,0);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM visits').get().n,0);
 }finally{Date.now=old;store.db.close()}
});
test('visit endpoint rejects foreign/oversized data and passes only hashed pseudonyms and categories',async()=>{
 const url='https://onmisto.test/api/visit',data={visitor:'11111111-1111-1111-1111-111111111111',session:'22222222-2222-2222-2222-222222222222',source:'instagram'};let recorded;
 const env={VISIT_STATS:{idFromName:()=>1,get:()=>({fetch:async req=>{recorded=await req.json();return new Response(null,{status:204})}})}};
 assert.equal((await statsRoute(new Request(url,{method:'POST',headers:{Origin:'https://other'},body:'{}'}),env)).status,403);
 const r=await statsRoute(new Request(url,{method:'POST',headers:{Origin:'https://onmisto.test','User-Agent':'iPhone','CF-Connecting-IP':'1.2.3.4',Referer:'https://private.example/address'},body:JSON.stringify(data)}),env);
 assert.equal(r.status,204);assert.equal(recorded.visitor.length,64);assert.notEqual(recorded.visitor,data.visitor);assert.deepEqual(Object.keys(recorded).sort(),['device','session','source','visitor']);assert.equal(recorded.device,'mobile');
 assert.equal((await statsRoute(new Request(url,{method:'POST',headers:{Origin:'https://onmisto.test'},body:'x'.repeat(1025)}),env)).status,413);
});
test('admin summary requires original989 GitHub identity and never exposes data to another account',async()=>{
 const old=globalThis.fetch;let read=0;const env={VISIT_STATS:{idFromName:()=>1,get:()=>({fetch:async()=>{read++;return new Response(JSON.stringify({today:{visits:0,visitors:0}}))}})}};
 const request=token=>new Request('https://onmisto.test/api/visitor-stats',{headers:{Authorization:'Bearer '+token}});
 try{
  assert.equal((await statsRoute(request('short'),env)).status,403);
  globalThis.fetch=async()=>new Response(JSON.stringify({login:'other'}));assert.equal((await statsRoute(request('x'.repeat(30)),env)).status,403);assert.equal(read,0);
  globalThis.fetch=async(url,options)=>{assert.equal(options.redirect,'manual');return new Response(JSON.stringify({login:'original989'}))};assert.equal((await statsRoute(request('y'.repeat(30)),env)).status,200);assert.equal(read,1);
 }finally{globalThis.fetch=old}
});

test('ad impressions and clicks are deduplicated by session and campaign, with honest CTR',async()=>{
 const store=storage(),stats=new VisitStats({storage:store});
 const event=(session,kind='impression',campaign='a'.repeat(64))=>stats.fetch(new Request('https://stats/ad-event',{method:'POST',body:JSON.stringify({visitor:'viewer1',session,campaign,title:campaign[0]==='a'?'Taxi':'New banner',kind})}));
 try{
  await event('one');await event('one');await event('one','click');await event('one','click');await event('two');
  let data=await(await stats.fetch(new Request('https://stats/summary'))).json();assert.equal(data.ads.today.impressions,2);assert.equal(data.ads.today.clicks,1);assert.equal(data.ads.today.ctr,50);assert.equal(data.ads.today.viewers,1);assert.equal(data.ads.today.campaigns[0].title,'Taxi');
  await event('one','click','b'.repeat(64));data=await(await stats.fetch(new Request('https://stats/summary'))).json();assert.equal(data.ads.today.impressions,3);assert.equal(data.ads.today.clicks,2);assert.equal(data.ads.today.campaigns.length,2);assert.equal(data.ads.today.ctr,66.67);assert.equal(data.today.visits,0);
  const health=await stats.fetch(new Request('https://stats/health'));assert.equal(health.status,204);
 }finally{store.db.close()}
});
