// Pseudonymous aggregate audience metrics. Never send addresses, IPs, titles or full referrer URLs.
function visitSource(){
  const source=(new URL(location.href).searchParams.get('utm_source')||'').toLowerCase();
  let host='';try{host=new URL(document.referrer).hostname}catch{}
  if(/instagram|insta|^ig$/.test(source)||/(^|\.)instagram\.com$/.test(host))return 'instagram';
  if(/telegram|^tg$/.test(source)||/(^|\.)(t\.me|telegram\.org)$/.test(host))return 'telegram';
  if(/facebook|^fb$/.test(source)||/(^|\.)facebook\.com$/.test(host))return 'facebook';
  if(/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com)$/.test(host))return 'search';
  return host&&host!==location.hostname?'other':'direct';
}
function analyticsIdentity(){
  if(navigator.doNotTrack==='1')return null;
  try{
    const now=Date.now(),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value])),day=parts.year+'-'+parts.month+'-'+parts.day;
    let visitor=localStorage.getItem('onmisto-visitor-v1');if(!/^[a-f0-9-]{36}$/.test(visitor||'')){visitor=crypto.randomUUID();localStorage.setItem('onmisto-visitor-v1',visitor)}
    let session;try{session=JSON.parse(localStorage.getItem('onmisto-visit-v1'))}catch{}
    if(!session||!/^[a-f0-9-]{36}$/.test(session.id||'')||session.day!==day||now-session.last>1800000)session={id:crypto.randomUUID(),day,last:now,source:visitSource()};
    session.last=now;localStorage.setItem('onmisto-visit-v1',JSON.stringify(session));
    return {visitor,session:session.id,source:session.source,day};
  }catch{return null}
}
async function recordVisit(){
 if(document.hidden||!navigator.onLine)return;
 const id=analyticsIdentity();if(!id)return;
 try{await fetch('/api/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor:id.visitor,session:id.session,source:id.source}),keepalive:true,signal:AbortSignal.timeout(8000)})}catch{}
}
setTimeout(recordVisit,1500);
setInterval(recordVisit,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)recordVisit()});
