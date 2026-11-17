import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findAlarmRegion,normalizeAirRaid,loadAirRaid,normalizeUbilling} from '../worker/alarm.js';
const tree={states:[{regionId:'oblast',regionName:'Хмельницька область',regionChildIds:[{regionId:'district',regionName:'Тестовий район',regionChildIds:[{regionId:'community',regionName:'Тестова громада'}]}]}]};
const region=findAlarmRegion(tree);
const row=(id,type)=>({regionId:id,regionName:'Тестовий регіон',activeAlerts:[{regionId:id,type}]});
test('finds oblast and every descendant, rejects incomplete region data',()=>{
 assert.deepEqual([...region.ids],['oblast','district','community']);
 for(const data of [{},{states:[]},{states:[{regionName:'Хмельницька область'}]}])assert.throws(()=>findAlarmRegion(data));
});
test('distinguishes whole oblast, partial district or community, and inactive',()=>{
 assert.equal(normalizeAirRaid([row('oblast','AIR')],region).status,'active');
 assert.equal(normalizeAirRaid([row('district','AIR')],region).status,'partial');
 assert.equal(normalizeAirRaid([row('community','AIR')],region).status,'partial');
 assert.equal(normalizeAirRaid([row('foreign','AIR')],region).status,'inactive');
 assert.equal(normalizeAirRaid([],region).status,'inactive');
 assert.equal(normalizeAirRaid([row('oblast','CHEMICAL')],region).status,'inactive');
 assert.equal(normalizeAirRaid([row('district','AIR'),row('oblast','AIR')],region).status,'active');
});
test('unknown formats and unrecognized relevant types never imply an inactive status',()=>{
 for(const data of [{},[{}],[{regionId:'oblast'}],[row('oblast','UNKNOWN')]])assert.throws(()=>normalizeAirRaid(data,region));
});
test('unavailable public or official API never returns inactive; official key remains server-side',async()=>{
 const original=globalThis.fetch;let count=0;
 try{
 globalThis.fetch=async()=>{throw new Error('source unavailable')};
 assert.equal((await loadAirRaid({})).status,'unknown');
 globalThis.fetch=async(url,options)=>{count++;assert.equal(options.headers.Authorization,'test-key');assert.equal(options.redirect,'manual');if(url.endsWith('/regions'))return Response.json(tree);return new Response('Unavailable',{status:503})};
 const unavailable=await loadAirRaid({UKRAINEALARM_API_KEY:'test-key'});assert.equal(unavailable.status,'unknown');assert.equal(count,2);assert.ok(!JSON.stringify(unavailable).includes('test-key'));
 globalThis.fetch=async()=>Response.json([row('community','AIR')]);
 assert.equal((await loadAirRaid({UKRAINEALARM_API_KEY:'test-key'})).status,'partial');
 }finally{globalThis.fetch=original}
});

test('public provider requires a boolean status and fresh source timestamp, not a recent fetch alone',()=>{
 const now=new Date('2026-11-11T11:46:14Z');
 const data={cachedat:'2026-11-11 13:46:12',states:{'Хмельницька область':{alertnow:false,changed:'2026-11-10 12:00:00'}}};
 assert.equal(normalizeUbilling(data,now).status,'inactive');
 assert.equal(normalizeUbilling(data,now).coverage,'oblast-only');
 assert.equal(normalizeUbilling(data,now).sourceUpdatedAt,'2026-11-11T11:46:12.000Z');
 data.states['Хмельницька область'].alertnow=true;assert.equal(normalizeUbilling(data,now).status,'active');
 for(const cachedat of ['2026-11-11 13:40:00','2026-11-11 14:00:00','2026-02-31 13:46:00','bad',null])assert.throws(()=>normalizeUbilling({...data,cachedat},now));
 assert.throws(()=>normalizeUbilling({...data,states:{}},now));
 assert.throws(()=>normalizeUbilling({...data,states:{'Хмельницька область':{alertnow:'false'}}},now));
});
test('source timestamps are interpreted in Kyiv in summer and winter',()=>{
 const data=(cachedat)=>({cachedat,states:{'Хмельницька область':{alertnow:true}}});
 assert.equal(normalizeUbilling(data('2026-07-01 15:00:00'),new Date('2026-07-01T12:00:10Z')).sourceUpdatedAt,'2026-07-01T12:00:00.000Z');
 assert.equal(normalizeUbilling(data('2026-01-01 14:00:00'),new Date('2026-01-01T12:00:10Z')).sourceUpdatedAt,'2026-01-01T12:00:00.000Z');
});

const liveUbilling=(alertnow=true)=>({
 cachedat:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()),
 states:{'Хмельницька область':{alertnow}}
});
test('prefers fresh explicit provider and coalesces simultaneous alarm requests',async()=>{
 const {loadUbillingAirRaid}=await import('../worker/alarm.js?explicit-feed');
 const original=globalThis.fetch;const calls=[];
 try {
  globalThis.fetch=async url=>{calls.push(url);return Response.json(liveUbilling())};
  const [a,b]=await Promise.all([loadUbillingAirRaid(),loadUbillingAirRaid()]);
  assert.equal(a.status,'active');assert.deepEqual(a,b);
  assert.deepEqual(calls,['https://ubilling.net.ua/aerialalerts/?source=aiu']);
  assert.equal(a.source,calls[0]);await loadUbillingAirRaid();assert.equal(calls.length,1);
 }finally{globalThis.fetch=original}
});
test('rejects stale explicit provider, permits only a fresh fallback and bounds failed retries',async()=>{
 const {loadUbillingAirRaid}=await import('../worker/alarm.js?fallback-feed');
 const original=globalThis.fetch;const calls=[];
 try {
  globalThis.fetch=async url=>{calls.push(url);return Response.json(url.includes('source=aiu')?{...liveUbilling(),cachedat:'2026-01-01 00:00:00'}:liveUbilling(false))};
  assert.equal((await loadUbillingAirRaid()).status,'inactive');assert.equal(calls.length,2);
  const failed=await import('../worker/alarm.js?failed-feeds');let attempts=0;
  globalThis.fetch=async()=>{attempts++;return Response.json({...liveUbilling(),cachedat:'2026-01-01 00:00:00'})};
  assert.equal((await failed.loadUbillingAirRaid()).status,'unknown');
  assert.equal((await failed.loadUbillingAirRaid()).status,'unknown');assert.equal(attempts,2);
 }finally{globalThis.fetch=original}
});
