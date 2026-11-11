let currentAd=null;
function adSlot(){
  const ad=currentAd;
  if(!ad?.enabled)return '<aside id="ad-slot" class="ad-slot ad-empty" aria-label="Рекламне місце"><span class="ad-tag">Реклама</span><span>Місце для вашої реклами</span></aside>';
  return '<aside id="ad-slot" class="ad-slot" aria-label="Реклама"><a class="ad-link" href="'+escapeHtml(ad.link)+'" target="_blank" rel="sponsored noopener noreferrer">'+(ad.image?'<img src="'+escapeHtml(ad.image)+'" alt="" loading="lazy">':'')+'<div class="ad-copy"><span class="ad-tag">Реклама</span><strong>'+escapeHtml(ad.title)+'</strong>'+(ad.description?'<p>'+escapeHtml(ad.description)+'</p>':'')+'<span class="ad-cta">Дізнатися більше ↗</span></div></a></aside>';
}
async function refreshAdvertisement(){
  try{const next=await api('/api/advertisement');currentAd=next.enabled&&typeof next.title==='string'&&typeof next.link==='string'&&next.link.startsWith('https://')?next:null;}catch{currentAd=null;}
  const slot=document.querySelector('#ad-slot');if(slot)slot.outerHTML=adSlot();
}
refreshAdvertisement();
setInterval(()=>{if(!document.hidden)refreshAdvertisement()},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAdvertisement()});
