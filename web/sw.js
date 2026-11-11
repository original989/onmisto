const shellCache='onmisto-shell-v1';
const shellFiles=['/','/manifest.webmanifest','/icons/onmisto-180.png','/icons/onmisto-192.png','/icons/onmisto-512.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(shellCache).then(cache=>cache.addAll(shellFiles)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('onmisto-shell-')&&key!==shellCache).map(key=>caches.delete(key))))]));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never cache APIs, alarm status, Telegram posts or address lookups here.
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!shellFiles.includes(url.pathname))return;
  const key=url.pathname;
  event.respondWith((async()=>{
    const cache=await caches.open(shellCache);
    try{
      const response=await fetch(event.request,{signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('Network response unavailable');
      try{await cache.put(key,response.clone())}catch{}
      return response;
    }catch{
      const saved=await cache.match(key);
      return saved||new Response('Відкрий onmisto з інтернетом хоча б один раз.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
