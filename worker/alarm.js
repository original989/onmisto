const alarmApi = 'https://api.ukrainealarm.com/api/v3';
const alarmRegionName = 'Хмельницька область';
const alarmPublicSource = 'https://map.ukrainealarm.com/';
export function findAlarmRegion(tree) {
  if (!tree || !Array.isArray(tree.states)) throw new Error('Unknown regions schema');
  const root = tree.states.find(region=>region.regionName===alarmRegionName);
  if (!root) throw new Error('Region not found');
  const ids = new Set();
  function collect(region) {
    if (!region || typeof region.regionId!=='string' || !region.regionId || typeof region.regionName!=='string') throw new Error('Unknown region');
    ids.add(region.regionId);
    if (region.regionChildIds != null) {
      if (!Array.isArray(region.regionChildIds)) throw new Error('Unknown children');
      region.regionChildIds.forEach(collect);
    }
  }
  collect(root);
  return {id:root.regionId,ids};
}
export function normalizeAirRaid(records, region, now = new Date()) {
  if (!Array.isArray(records)) throw new Error('Unknown alerts schema');
  let whole = false;
  const affected = new Set();
  const types = ['AIR','ARTILLERY','URBAN_FIGHTS','CHEMICAL','NUCLEAR','INFO'];
  for (const record of records) {
    if (!record || typeof record.regionId!=='string' || !Array.isArray(record.activeAlerts)) throw new Error('Incomplete alerts');
    for (const alert of record.activeAlerts) {
      if (!alert || typeof alert.type!=='string') throw new Error('Unknown alert');
      const id = alert.regionId ?? record.regionId;
      if (!region.ids.has(id)) continue;
      if (!types.includes(alert.type)) throw new Error('Unknown alert type');
      if (alert.type!=='AIR') continue;
      if (id===region.id) whole=true;
      else affected.add(record.regionName || 'Окремий район / громада');
    }
  }
  return {status:whole?'active':affected.size?'partial':'inactive',region:alarmRegionName,affected:[...affected],fetchedAt:now.toISOString(),source:alarmPublicSource};
}

const ubillingSource = 'https://ubilling.net.ua/aerialalerts/';
function ubillingKyivTimestamp(value) {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) throw new Error('Unknown source timestamp');
  const parts=value.match(/\d+/g).map(Number);
  const local=Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4],parts[5]);
  const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const rendered=Object.fromEntries(formatter.formatToParts(new Date(local)).map(p=>[p.type,p.value]));
  const asUTC=Date.UTC(+rendered.year,+rendered.month-1,+rendered.day,+rendered.hour,+rendered.minute,+rendered.second);
  const timestamp=local-(asUTC-local);
  const check=Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(p=>[p.type,p.value]));
  if ([+check.year,+check.month,+check.day,+check.hour,+check.minute,+check.second].some((v,i)=>v!==parts[i])) throw new Error('Invalid local timestamp');
  return timestamp;
}
export function normalizeUbilling(data, now = new Date()) {
  const entry=data?.states?.[alarmRegionName];
  if (!entry || typeof entry.alertnow!=='boolean') throw new Error('Unknown Ubilling status');
  const sourceTime=ubillingKyivTimestamp(data.cachedat);
  if (now.getTime()-sourceTime>120000 || sourceTime-now.getTime()>30000) throw new Error('Stale or future source data');
  return {status:entry.alertnow?'active':'inactive',region:alarmRegionName,affected:[],fetchedAt:now.toISOString(),sourceUpdatedAt:new Date(sourceTime).toISOString(),source:ubillingSource,provider:'ubilling',coverage:'oblast-only'};
}
let ubillingResultCache=null;
let ubillingPending=null;
export async function loadUbillingAirRaid() {
  if (ubillingResultCache && Date.now()-ubillingResultCache.at<30000 && Date.now()-Date.parse(ubillingResultCache.data.sourceUpdatedAt)<120000) return ubillingResultCache.data;
  if (ubillingPending) return ubillingPending;
  ubillingPending=(async()=>{
    try{
      const response=await fetch(ubillingSource,{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(10000),cache:'no-store'});
      if (!response.ok) throw new Error('Ubilling unavailable');
      const data=normalizeUbilling(await response.json());
      ubillingResultCache={at:Date.now(),data};
      return data;
    }catch{return {status:'unknown',region:alarmRegionName,source:ubillingSource,provider:'ubilling',coverage:'oblast-only'}}
  })();
  try{return await ubillingPending}finally{ubillingPending=null}
}

let alarmRegionsCache = null;
let alarmResultCache = null;
let alarmPending = null;
export async function loadAirRaid(env) {
  const key = env?.UKRAINEALARM_API_KEY?.trim();
  if (!key) return loadUbillingAirRaid();
  if (alarmResultCache && alarmResultCache.key===key && Date.now()-alarmResultCache.at<30000) return alarmResultCache.data;
  if (alarmPending?.key===key) return alarmPending.promise;
  async function request(path) {
    const response=await fetch(alarmApi+path,{headers:{Authorization:key,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('Alarm API unavailable');
    return response.json();
  }
  const promise=(async()=>{
    if (!alarmRegionsCache || Date.now()-alarmRegionsCache.at>21600000) alarmRegionsCache={region:findAlarmRegion(await request('/regions')),at:Date.now()};
    const data=normalizeAirRaid(await request('/alerts'),alarmRegionsCache.region);
    alarmResultCache={key,data,at:Date.now()};
    return data;
  })();
  alarmPending={key,promise};
  try{return await promise}
  catch{return {status:'unknown',region:alarmRegionName,source:alarmPublicSource}}
  finally{if(alarmPending?.promise===promise)alarmPending=null}
}
