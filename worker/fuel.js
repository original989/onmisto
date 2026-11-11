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
  return {price:+diesel.Price,fuel:'EURO DIESEL',publishedDate:date,fetchedAt:now.toISOString(),source:fuelSourceUrl,station:{id:524,name:'UPG · АЗК №502',city:'Славута',address:'вул. Приміська, 2-Г'}};
}
let fuelCache=null;
let fuelPending=null;
export async function loadSlavutaDiesel(){
  if(fuelCache&&Date.now()-fuelCache.at<1800000)return fuelCache.data;
  if(fuelPending)return fuelPending;
  fuelPending=(async()=>{
    const response=await fetch(fuelSourceUrl,{headers:{Accept:'text/html'},redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Не вдалося оновити ціну UPG.');
    const html=await response.text();
    if(html.length>2500000)throw new Error('Завелика відповідь UPG.');
    const data=parseSlavutaDiesel(html);
    fuelCache={at:Date.now(),data};
    return data;
  })();
  try{return await fuelPending}finally{fuelPending=null}
}
