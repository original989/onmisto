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
export async function loadAdvertisement(){
  if(adsCache?.expires>Date.now())return adsCache.ad;
  try{
    const r=await fetch(ADS_SOURCE+'?v='+Math.floor(Date.now()/60000),{signal:AbortSignal.timeout(6000),headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error('ads source');
    const raw=await r.text();if(raw.length>250000)throw new Error('ads size');
    const ad=normalizeAd(JSON.parse(raw));adsCache={ad,expires:Date.now()+60000};return ad;
  }catch{return {enabled:false};}
}
