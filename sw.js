const VERSION='gfd-aed-pwa-v52';
const CORE_CACHE=VERSION+'-core';
const RUNTIME_CACHE=VERSION+'-runtime';
const CORE=['./','./index.html','./manifest.webmanifest','./deployment-admin.js'];

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

async function injectDeploymentAdmin(response){
  try{
    const type=response.headers.get('content-type')||'';
    if(!type.includes('text/html')) return response;
    let html=await response.text();
    if(!html.includes('deployment-admin.js')) html=html.replace('</body>','<script src="deployment-admin.js"></script></body>');
    const headers=new Headers(response.headers);headers.delete('content-length');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }catch(e){return response}
}

async function networkFirst(request){
  try{
    const fresh=await fetch(request,{cache:'no-store'});
    const cache=await caches.open(RUNTIME_CACHE);
    cache.put(request,fresh.clone());
    return injectDeploymentAdmin(fresh);
  }catch(err){
    const cached=(await caches.match(request)) || (await caches.match('./index.html'));
    return cached?injectDeploymentAdmin(cached):Response.error();
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
  event.respondWith(staleWhileRevalidate(event.request));
});