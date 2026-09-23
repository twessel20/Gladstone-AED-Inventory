const VERSION='gfd-aed-pwa-v28';
const CORE_CACHE=VERSION+'-core';
const RUNTIME_CACHE=VERSION+'-runtime';
const CORE=['./','./index.html','./manifest.webmanifest'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CORE_CACHE).then(cache=>cache.addAll(CORE)));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CORE_CACHE&&k!==RUNTIME_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request){
  try{
    const fresh=await fetch(request,{cache:'no-store'});
    const cache=await caches.open(RUNTIME_CACHE);
    cache.put(request,fresh.clone());
    return fresh;
  }catch(err){
    return (await caches.match(request)) || (await caches.match('./index.html'));
  }
}

async function staleWhileRevalidate(request){
  const cached=await caches.match(request);
  const update=fetch(request).then(async fresh=>{
    const cache=await caches.open(RUNTIME_CACHE);
    try{await cache.put(request,fresh.clone())}catch(e){}
    return fresh;
  }).catch(()=>null);
  return cached || (await update) || Response.error();
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(event.request.mode==='navigate'){
    event.respondWith(networkFirst(event.request));
    return;
  }
  if(url.origin===self.location.origin){
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
  // Runtime-cache third-party assets such as the barcode-scanner library
  // after the first successful online load so they remain available offline.
  event.respondWith(staleWhileRevalidate(event.request));
});