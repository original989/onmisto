let currentAd=null;
function adSlot(){
  const ad=currentAd;
  if(!ad?.enabled)return '<aside id="ad-slot" class="ad-slot ad-empty" aria-label="Рекламне місце"><span class="ad-tag">Реклама</span><span>Місце для вашої реклами</span></aside>';
  return '<aside id="ad-slot" class="ad-slot" aria-label="Реклама"><a class="ad-link" data-campaign="'+escapeHtml(ad.metricId||'')+'" href="'+escapeHtml(ad.link)+'" target="_blank" rel="sponsored noopener noreferrer">'+(ad.image?'<img src="'+escapeHtml(ad.image)+'" alt="" loading="lazy">':'')+'<div class="ad-copy"><span class="ad-tag">Реклама</span><strong>'+escapeHtml(ad.title)+'</strong>'+(ad.description?'<p>'+escapeHtml(ad.description)+'</p>':'')+'<span class="ad-cta">Дізнатися більше ↗</span></div></a></aside>';
}
async function refreshAdvertisement(){
  try{const next=await api('/api/advertisement');currentAd=next.enabled&&typeof next.title==='string'&&typeof next.link==='string'&&next.link.startsWith('https://')?next:null;}catch{currentAd=null;}
  const slot=document.querySelector('#ad-slot');if(slot)slot.outerHTML=adSlot();
}
refreshAdvertisement();
setInterval(()=>{if(!document.hidden)refreshAdvertisement()},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAdvertisement()});

const sentAdEvents=new Set();
async function recordAdEvent(campaign,kind){
 if(!/^[a-f0-9]{64}$/.test(campaign||'')||document.hidden||!navigator.onLine)return;
 const id=analyticsIdentity();if(!id)return;const eventKey=id.day+':'+id.session+':'+campaign+':'+kind;if(sentAdEvents.has(eventKey))return;sentAdEvents.add(eventKey);
 try{const r=await fetch('/api/ad-event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor:id.visitor,session:id.session,campaign,kind}),keepalive:true,signal:AbortSignal.timeout(8000)});if(!r.ok)sentAdEvents.delete(eventKey)}catch{sentAdEvents.delete(eventKey)}
}
let adVisibilityTimer=null,adObserved=null;
const adVisibilityObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries){clearTimeout(adVisibilityTimer);if(entry.isIntersecting&&entry.intersectionRatio>=.5&&!document.hidden){const node=entry.target;adVisibilityTimer=setTimeout(()=>{if(node.isConnected&&!document.hidden)recordAdEvent(node.dataset.campaign,'impression')},1000)}}},{threshold:[.5]}):null;
function observeAdvertisement(){const node=document.querySelector('#ad-slot a[data-campaign]');if(node===adObserved)return;clearTimeout(adVisibilityTimer);adVisibilityObserver?.disconnect();adObserved=node;if(node)adVisibilityObserver?.observe(node)}
new MutationObserver(observeAdvertisement).observe(app,{childList:true,subtree:true});
document.addEventListener('click',event=>{const a=event.target.closest('#ad-slot a[data-campaign]');if(a&&event.isTrusted)recordAdEvent(a.dataset.campaign,'click')});
document.addEventListener('visibilitychange',()=>{clearTimeout(adVisibilityTimer);if(!document.hidden){adObserved=null;observeAdvertisement()}});
observeAdvertisement();
