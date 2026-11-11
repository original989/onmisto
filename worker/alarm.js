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
let alarmRegionsCache = null;
let alarmResultCache = null;
let alarmPending = null;
export async function loadAirRaid(env) {
  const key = env?.UKRAINEALARM_API_KEY?.trim();
  if (!key) return {status:'unconfigured',region:alarmRegionName,source:alarmPublicSource};
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
