const VERSION='gfd-aed-pwa-v98';
const CORE_CACHE=VERSION+'-core';
const RUNTIME_CACHE=VERSION+'-runtime';
const CORE=['./','./index.html','./manifest.webmanifest','./pdf-export.js','./report-builder.js','./report-pdf.css','./repository-nav.js','./lifecycle.html'];

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

async function withReportBuilder(response){
  if(!response||!response.ok)return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('report-pdf.css'))html=html.replace('</head>','<link rel="stylesheet" href="./report-pdf.css?v=98"></head>');
  if(!html.includes('report-builder.js'))html=html.replace('</body>','<script src="./report-builder.js?v=98"></script></body>');
  if(!html.includes('repository-nav.js'))html=html.replace('</body>','<script src="./repository-nav.js?v=98"></script></body>');
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function networkFirst(request){
  try{
    const fresh=await fetch(request,{cache:'no-store'});
    const cache=await caches.open(RUNTIME_CACHE);
    cache.put(request,fresh.clone());
    return withReportBuilder(fresh);
  }catch(err){
    const cached=(await caches.match(request)) || (await caches.match('./index.html'));
    return withReportBuilder(cached);
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
  if(url.origin===self.location.origin&&(url.pathname.endsWith('/pdf-export.js')||url.pathname.endsWith('/repository-nav.js'))){
    event.respondWith(networkFirst(event.request));
    return;
  }
  if(url.origin===self.location.origin){
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
  event.respondWith(staleWhileRevalidate(event.request));
});