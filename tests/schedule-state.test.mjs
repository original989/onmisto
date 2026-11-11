import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {validSchedule,diffSchedules,validScheduleChanges} from '../web/schedule-state.js';
const fixture=(date='2026-11-11')=>({fetchedAt:'2026-11-11T12:00:00Z',days:[{date,queues:Object.fromEntries(Array.from({length:12},(_,i)=>[Math.floor(i/2+1)+'.'+(i%2+1),[[540,600]]]))}]});
test('saved data survives JSON round-trip and invalid snapshots are rejected',()=>{
 const original=fixture();assert.ok(validSchedule(JSON.parse(JSON.stringify(original))));
 for(const value of [null,{}, {...original,fetchedAt:'bad'}, {...original,days:[]}, {fetchedAt:original.fetchedAt,days:[{date:'2026-11-11',queues:{}}]}])assert.equal(validSchedule(value),false);
 const invalid=fixture();invalid.days[0].queues['1.1']=[[60,1500]];assert.equal(validSchedule(invalid),false);
});
test('first load, unchanged outage coverage and new publication dates are not revisions',()=>{
 const initial=fixture();assert.deepEqual(diffSchedules(null,initial),[]);
 const split=fixture();split.days[0].queues['1.1']=[[540,570],[570,600]];assert.deepEqual(diffSchedules(initial,split),[]);
 assert.deepEqual(diffSchedules(initial,fixture('2026-11-12')),[]);
});
test('detects exact added and removed minutes only for the changed queue',()=>{
 const previous=fixture(),next=fixture();next.days[0].queues['1.1']=[[570,660]];
 const changes=diffSchedules(previous,next);
 assert.deepEqual(changes,[{date:'2026-11-11',queue:'1.1',intervals:[{start:540,end:570,wasOff:true,isOff:false},{start:600,end:660,wasOff:false,isOff:true}]}]);
 assert.ok(validScheduleChanges(changes));assert.equal(validScheduleChanges([{...changes[0],queue:'<script>'}]),false);
 assert.equal(validScheduleChanges([{...changes[0],intervals:[{start:0,end:99999,wasOff:true,isOff:false}]}]),false);
});
test('malformed source never replaces a saved schedule',()=>assert.throws(()=>diffSchedules(fixture(),{})));
async function makeServiceWorker(){
 const handlers={};const saved=new Map([['/',new Response('saved shell')]]);
 const cache={async addAll(paths){for(const path of paths)saved.set(path,new Response('saved '+path))},async put(key,value){saved.set(key,value)},async match(key){return saved.get(key)?.clone()}};
 const context={URL,Response,AbortSignal,fetch:async()=>{throw Error('offline')},caches:{open:async()=>cache,keys:async()=>['onmisto-shell-v1'],delete:async()=>true},self:{location:{origin:'https://onmisto.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting(){},clients:{claim:async()=>{}}}};
 vm.runInNewContext(await readFile('web/sw.js','utf8'),context);
 const request=async(path)=>{let result;handlers.fetch({request:new Request('https://onmisto.test'+path),respondWith(promise){result=promise}});return result?await result:null};
 return {handlers,context,request,saved};
}
test('offline shell works while alarm, Telegram and address APIs never use a saved fallback',async()=>{
 const sw=await makeServiceWorker();assert.equal(await (await sw.request('/')).text(),'saved shell');
 for(const path of ['/api/air-raid','/api/telegram','/api/schedules','/api/address?street=1&house=1'])assert.equal(await sw.request(path),null);
});
test('shell cache updates after a successful network response and falls back on errors',async()=>{
 const sw=await makeServiceWorker();sw.context.fetch=async()=>new Response('new shell');assert.equal(await (await sw.request('/')).text(),'new shell');
 sw.context.fetch=async()=>new Response('server error',{status:502});assert.equal(await (await sw.request('/')).text(),'new shell');
});
