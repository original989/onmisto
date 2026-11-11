const ADS_SOURCE='https://raw.githubusercontent.com/original989/onmisto/main/data/ads.json';
let adsCache;
export function normalizeAd(value){
  if(!value||typeof value!=='object'||typeof value.enabled!=='boolean')throw new Error('Невірний формат реклами.');
  const text=(key,max)=>{if(typeof value[key]!=='string'||value[key].length>max)throw new Error('Перевірте поле '+key);return value[key].trim()};
  const title=text('title',90),description=text('description',220),link=text('link',1500),image=text('image',240000);
  if(link){const u=new URL(link);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Посилання має починатися з https://');}
  if(image&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))throw new Error('Непідтримуване зображення.');
  if(value.enabled&&(!title||!link))throw new Error('Додайте заголовок і посилання.');
  return {enabled:value.enabled,title,description,link,image};
}
export async function advertisementMetricId(ad){
  const raw=JSON.stringify([ad.title,ad.description,ad.link,ad.image]);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
export async function loadAdvertisement(revision){
  if(!revision&&adsCache?.expires>Date.now())return adsCache.ad;
  try{
    const r=await fetch(ADS_SOURCE+'?v='+(revision||Math.floor(Date.now()/60000)),{signal:AbortSignal.timeout(6000),headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error('ads source');
    const raw=await r.text();if(raw.length>250000)throw new Error('ads size');
    const normalized=normalizeAd(JSON.parse(raw));const ad={...normalized,metricId:await advertisementMetricId(normalized)};adsCache={ad,expires:Date.now()+60000};return ad;
  }catch{return {enabled:false};}
}

export async function manageAdvertisement(request){
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return reply({error:'Запит з іншого сайту відхилено.'},403);
  const auth=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9_]{20,255}$/.test(auth))return reply({error:'Підключи ключ доступу.'},401);
  const endpoint='https://api.github.com/repos/original989/onmisto/contents/data/ads.json';
  const options={method:request.method,headers:{Authorization:auth,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'onmisto-ads-manager'},signal:AbortSignal.timeout(18000)};
  if(request.method==='PUT'){
    if(Number(request.headers.get('content-length'))>260000)return reply({error:'Банер завеликий.'},413);
    const reader=request.body?.getReader();if(!reader)return reply({error:'Немає даних.'},400);
    let size=0,chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>260000){await reader.cancel();return reply({error:'Банер завеликий.'},413)}chunks.push(value)}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    let data,ad;
    try{data=JSON.parse(new TextDecoder().decode(bytes));if(!/^[a-f0-9]{40}$/.test(data.sha))throw Error('Онови сторінку керування.');ad=normalizeAd(data.ad)}catch(e){return reply({error:e.message||'Перевір дані банера.'},400)}
    const raw=new TextEncoder().encode(JSON.stringify(ad,null,2)+'\n');let binary='';for(const b of raw)binary+=String.fromCharCode(b);
    options.headers['Content-Type']='application/json';options.body=JSON.stringify({message:'Update advertisement',branch:'main',sha:data.sha,content:btoa(binary)});
  }else if(request.method!=='GET')return reply({error:'Метод не підтримується.'},405);
  try{
    const r=await fetch(endpoint+(request.method==='GET'?'?ref=main':''),options);
    if(!r.ok)return reply({error:r.status===409?'Банер уже змінено в іншій вкладці. Перепідключись.':([401,403,404].includes(r.status)?'Перевір ключ: onmisto → Contents → Read and write.':'GitHub тимчасово недоступний. Спробуй ще раз.')},r.status);
    const data=await r.json();
    if(request.method==='PUT'){adsCache=undefined;return reply({sha:data.content.sha})}
    const ad=normalizeAd(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\s/g,'')),c=>c.charCodeAt(0)))));
    return reply({sha:data.sha,ad});
  }catch{return reply({error:'Не вдалося завершити збереження. Перевір інтернет і спробуй ще раз.'},502)}
}
