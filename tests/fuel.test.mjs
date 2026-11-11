import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSlavutaDiesel,loadSlavutaDiesel,recordFuelHistory,compareFuelPrices,fuelKyivDay} from '../worker/fuel.js';
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
 globalThis.fetch=async(url)=>{if(url.includes('raw.githubusercontent.com'))return Response.json({stationId:524,source:'https://upg.ua/merezha_azk/',days:[]});calls++;return new Response(page([station()]))};
 const [a,b]=await Promise.all([loadSlavutaDiesel(),loadSlavutaDiesel()]);assert.deepEqual(a,b);assert.equal(calls,2);
 await loadSlavutaDiesel();assert.equal(calls,2);
 }finally{globalThis.fetch=original}
});

test('includes every fuel actually offered at this exact station',()=>{
 const result=parseSlavutaDiesel(page([station()]),now);
 assert.deepEqual(result.fuels.map(item=>item.name),['upgDIESEL','EURO DIESEL']);
 assert.deepEqual(result.fuels.map(item=>item.price),[105.9,102.9]);
});
test('comparison uses exact previous Kyiv calendar day and integer cents',()=>{
 const today=new Date('2026-11-12T00:30:00+02:00'),yesterday=new Date('2026-11-11T23:55:00+02:00');
 const data=parseSlavutaDiesel(page([station()]),now);
 const history=recordFuelHistory({stationId:524,source:data.source,days:[]},data,yesterday);
 const next={...data,fuels:[{id:1,name:'upgDIESEL',price:106.15},{id:5,name:'EURO DIESEL',price:101.9},{id:4,name:'Газ',price:60.9}]};
 const compared=compareFuelPrices(next,history,today);
 assert.deepEqual(compared.fuels.map(item=>item.changeCents),[25,-100,null]);
 assert.equal(compared.comparisonDate,'2026-11-11');
 next.fuels[0].price=105.9;assert.equal(compareFuelPrices(next,history,today).fuels[0].changeCents,0);
 assert.equal(fuelKyivDay(new Date('2026-11-11T22:30:00Z')),'2026-11-12');
});
test('does not compare with an older day, another station or changed fuel name',()=>{
 const data=parseSlavutaDiesel(page([station()]),now);
 const history=recordFuelHistory({stationId:524,source:data.source,days:[]},{...data,publishedDate:'2026-11-10'},new Date('2026-11-10T12:00:00Z'));
 assert.ok(compareFuelPrices(data,history,new Date('2026-11-12T12:00:00Z')).fuels.every(item=>item.changeCents===null));
 assert.ok(compareFuelPrices(data,{...history,stationId:999},now).fuels.every(item=>item.changeCents===null));
 const renamed={...data,fuels:data.fuels.map(item=>({...item,name:'other'}))};
 assert.ok(compareFuelPrices(renamed,history,now).fuels.every(item=>item.changeCents===null));
});
test('daily snapshots replace only their own day and reject rollback',()=>{
 const data=parseSlavutaDiesel(page([station()]),now);
 const initial={stationId:524,source:data.source,days:[]};
 const first=recordFuelHistory(initial,{...data,publishedDate:'2026-11-10'},new Date('2026-11-10T12:00:00Z'));
 const second=recordFuelHistory(first,data,new Date('2026-11-11T12:00:00Z'));
 const third=recordFuelHistory(second,data,new Date('2026-11-11T20:00:00Z'));
 assert.equal(third.days.length,2);assert.equal(third.days[1].observedAt,'2026-11-11T20:00:00.000Z');
 assert.throws(()=>recordFuelHistory(third,data,new Date('2026-11-11T13:00:00Z')));
});
