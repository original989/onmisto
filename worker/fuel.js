const fuelSourceUrl='https://upg.ua/merezha_azk/';
export function parseSlavutaDiesel(html, now=new Date()) {
  const marker=/\b(?:var|let|const)\s+objmap\s*=\s*/.exec(html);
  if(!marker)throw new Error('Джерело цін змінило формат.');
  const from=marker.index+marker[0].length;
  if(html[from]!=='{')throw new Error('Невідомий формат цін.');
  let depth=0,quoted=false,escaped=false,end=-1;
  for(let i=from;i<html.length;i++){
    const c=html[i];
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}
    if(c==='"'){quoted=true;continue}
    if(c==='{')depth++;
    if(c==='}'&&--depth===0){end=i+1;break}
  }
  if(end<0)throw new Error('Неповні дані цін.');
  const payload=JSON.parse(html.slice(from,end));
  if(payload.resultCode!==1||!Array.isArray(payload.data))throw new Error('Джерело не повернуло ціни.');
  const station=payload.data.find(item=>item.id===524&&item.Active===true&&typeof item.Address==='string'&&/м\.?\s*Славута/i.test(item.Address)&&/Приміська/i.test(item.Address));
  if(!station||!Array.isArray(station.FuelsAsArray))throw new Error('Ціни АЗК у Славуті недоступні.');
  const diesel=station.FuelsAsArray.find(item=>item.id===5&&item.Title==='EURO DIESEL');
  if(!diesel||typeof diesel.Price!=='string'||!/^\d{1,3}\.\d{2}$/.test(diesel.Price)||+diesel.Price<=0||+diesel.Price>999)throw new Error('Ціна дизеля недоступна.');
  const date=station.LastPriceUpdateDate;
  const parsed=typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(date+'T12:00:00Z'):null;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  if(!parsed||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||date>today)throw new Error('Не вдалося перевірити дату ціни.');
  const fuels=station.FuelsAsArray.filter(item=>Number.isInteger(item.id)&&item.id>0&&typeof item.Title==='string'&&item.Title.length<=60&&typeof item.Price==='string'&&/^[0-9]{1,3}[.][0-9]{2}$/.test(item.Price)&&+item.Price>0).map(item=>({id:item.id,name:item.Title,price:+item.Price}));
  return {fuels,price:+diesel.Price,fuel:'EURO DIESEL',publishedDate:date,fetchedAt:now.toISOString(),source:fuelSourceUrl,station:{id:524,name:'UPG · АЗК №502',city:'Славута',address:'вул. Приміська, 2-Г'}};
}

export function fuelKyivDay(now=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function yesterdayFuelDay(now){
  const day=new Date(fuelKyivDay(now)+'T12:00:00Z');day.setUTCDate(day.getUTCDate()-1);return day.toISOString().slice(0,10);
}
export function recordFuelHistory(history,data,now=new Date()){
  const date=fuelKyivDay(now);
  if(data.station?.id!==524||!Array.isArray(data.fuels)||!data.fuels.length||typeof data.publishedDate!=='string'||data.publishedDate>date)throw new Error('Invalid station snapshot');
  const fuels=Object.fromEntries(data.fuels.map(item=>{
    const cents=Math.round(item.price*100);
    if(!Number.isInteger(item.id)||item.id<1||typeof item.name!=='string'||!Number.isFinite(item.price)||cents<=0)throw new Error('Invalid fuel snapshot');
    return [String(item.id),{name:item.name,priceCents:cents}];
  }));
  if(!history||history.stationId!==524||!Array.isArray(history.days))throw new Error('Invalid fuel history');
  const existing=history.days.find(day=>day.date===date);
  if(existing&&Date.parse(existing.observedAt)>now.getTime())throw new Error('Cannot replace a newer snapshot');
  return {stationId:524,source:fuelSourceUrl,days:[...history.days.filter(day=>day.date!==date),{date,observedAt:now.toISOString(),publishedDate:data.publishedDate,fuels}].filter(day=>typeof day.date==='string'&&day.date<=date).sort((a,b)=>a.date.localeCompare(b.date)).slice(-62)};
}
export function compareFuelPrices(data,history,now=new Date()){
  const date=yesterdayFuelDay(now);
  const previous=history?.stationId===524&&history.source===fuelSourceUrl&&Array.isArray(history.days)?history.days.find(day=>day.date===date):null;
  const validPrevious=previous&&Number.isFinite(Date.parse(previous.observedAt))&&fuelKyivDay(new Date(previous.observedAt))===date;
  return {...data,comparisonDate:date,previousObservedAt:validPrevious?previous.observedAt:null,fuels:data.fuels.map(item=>{
    const old=validPrevious?previous.fuels?.[String(item.id)]:null;
    const matched=old&&old.name===item.name&&Number.isInteger(old.priceCents)&&old.priceCents>0;
    return {...item,changeCents:matched?Math.round(item.price*100)-old.priceCents:null};
  })};
}
let fuelHistoryCache=null;
async function loadFuelHistory(){
  if(fuelHistoryCache&&Date.now()-fuelHistoryCache.at<1800000&&fuelHistoryCache.day===fuelKyivDay())return fuelHistoryCache.data;
  try{
    const response=await fetch('https://raw.githubusercontent.com/original989/onmisto/main/data/fuel-history.json',{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(7000)});
    if(!response.ok)return null;
    const data=await response.json();
    fuelHistoryCache={data,at:Date.now(),day:fuelKyivDay()};
    return data;
  }catch{return null}
}

let fuelCache=null;
let fuelPending=null;
export async function loadSlavutaDiesel(){
  if(fuelCache&&Date.now()-fuelCache.at<1800000&&fuelKyivDay(new Date(fuelCache.data.fetchedAt))===fuelKyivDay())return compareFuelPrices(fuelCache.data,await loadFuelHistory());
  if(fuelPending){const data=await fuelPending;return compareFuelPrices(data,await loadFuelHistory())}
  fuelPending=(async()=>{
    const response=await fetch(fuelSourceUrl,{headers:{Accept:'text/html'},redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Не вдалося оновити ціну UPG.');
    const html=await response.text();
    if(html.length>2500000)throw new Error('Завелика відповідь UPG.');
    const data=parseSlavutaDiesel(html);
    fuelCache={at:Date.now(),data};
    return data;
  })();
  try{const data=await fuelPending;return compareFuelPrices(data,await loadFuelHistory())}finally{fuelPending=null}
}
