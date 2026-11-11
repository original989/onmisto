import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findAlarmRegion,normalizeAirRaid,loadAirRaid} from '../worker/alarm.js';
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
test('missing key never fetches; unavailable API never returns inactive; key is sent server-side only',async()=>{
 const original=globalThis.fetch;let count=0;
 try{
 globalThis.fetch=async()=>{throw new Error('must not fetch')};
 assert.equal((await loadAirRaid({})).status,'unconfigured');
 globalThis.fetch=async(url,options)=>{count++;assert.equal(options.headers.Authorization,'test-key');assert.equal(options.redirect,'manual');if(url.endsWith('/regions'))return Response.json(tree);return new Response('Unavailable',{status:503})};
 const unavailable=await loadAirRaid({UKRAINEALARM_API_KEY:'test-key'});assert.equal(unavailable.status,'unknown');assert.equal(count,2);assert.ok(!JSON.stringify(unavailable).includes('test-key'));
 globalThis.fetch=async()=>Response.json([row('community','AIR')]);
 assert.equal((await loadAirRaid({UKRAINEALARM_API_KEY:'test-key'})).status,'partial');
 }finally{globalThis.fetch=original}
});
