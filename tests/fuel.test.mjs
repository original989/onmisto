import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSlavutaDiesel,loadSlavutaDiesel} from '../worker/fuel.js';
const now=new Date('2026-11-11T12:00:00Z');
const station=()=>({id:524,Active:true,Address:'Хмельницька обл., м.Славута, вул.Приміська, 2-Г',LastPriceUpdateDate:'2026-11-11',FuelsAsArray:[{id:1,Title:'upgDIESEL',Price:'105.90'},{id:5,Title:'EURO DIESEL',Price:'102.90'}]});
const page=stations=>'<script>var objmap = '+JSON.stringify({resultCode:1,data:stations})+'; throw new Error("do not execute source scripts");</script>';
test('uses regular diesel at the specified Slavuta station, never premium diesel',()=>{
 const result=parseSlavutaDiesel(page([station()]),now);
 assert.equal(result.price,102.9);assert.equal(result.station.id,524);assert.equal(result.publishedDate,'2026-11-11');assert.equal(result.fuel,'EURO DIESEL');
});
test('does not substitute another station, an inactive station or a location outside Slavuta',()=>{
 for(const change of [{id:525},{Active:false},{Address:'м.Київ, вул.Приміська'}])assert.throws(()=>parseSlavutaDiesel(page([{...station(),...change}]),now));
});
test('missing, malformed or zero prices never become a displayed price',()=>{
 for(const Price of ['0.00','not a price','1000.00',null]){const item=station();item.FuelsAsArray[1].Price=Price;assert.throws(()=>parseSlavutaDiesel(page([item]),now))}
 const item=station();item.FuelsAsArray.splice(1);assert.throws(()=>parseSlavutaDiesel(page([item]),now));
});
test('validates published dates and ignores braces within JSON strings',()=>{
 const item=station();item.extra='a } brace and a "quote"';assert.equal(parseSlavutaDiesel(page([item]),now).price,102.9);
 for(const LastPriceUpdateDate of ['2030-01-01','2026-02-31',null])assert.throws(()=>parseSlavutaDiesel(page([{...item,LastPriceUpdateDate}]),now));
 assert.throws(()=>parseSlavutaDiesel('<script>var objmap = "Empty";</script>',now));
 assert.throws(()=>parseSlavutaDiesel('source unavailable',now));
});
test('fails cleanly on network errors and coalesces successful fetches',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://upg.ua/merezha_azk/');assert.equal(options.redirect,'manual');return new Response('unavailable',{status:503})};
 await assert.rejects(loadSlavutaDiesel());
 globalThis.fetch=async()=>{calls++;return new Response(page([station()]))};
 const [a,b]=await Promise.all([loadSlavutaDiesel(),loadSlavutaDiesel()]);assert.deepEqual(a,b);assert.equal(calls,2);
 await loadSlavutaDiesel();assert.equal(calls,2);
 }finally{globalThis.fetch=original}
});
