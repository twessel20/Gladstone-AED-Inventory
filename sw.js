const VERSION='gfd-aed-pwa-v105';
const CORE_CACHE=VERSION+'-core';
const RUNTIME_CACHE=VERSION+'-runtime';
const CORE=['./','./index.html','./manifest.webmanifest','./pdf-export.js','./report-builder.js','./report-pdf.css'];

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

async function decorateMainApp(response){
  if(!response||!response.ok)return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  const isMainApp=html.includes('<title>Gladstone AED Inventory</title>')&&html.includes('data-v="dash"')&&html.includes('data-v="audit"');
  if(isMainApp){
    if(!html.includes('report-pdf.css'))html=html.replace('</head>','<link rel="stylesheet" href="./report-pdf.css?v=105"></head>');
    if(!html.includes('report-builder.js'))html=html.replace('</body>','<script src="./report-builder.js?v=105"></script></body>');
    if(!html.includes('id="repositoryNav"')){
      const auditButton='<button class="tab" data-v="audit">Audit Log</button>';
      const repositoryLink='<a id="repositoryNav" href="./lifecycle.html" style="font:inherit;font-weight:750;border:1px solid var(--l);background:#fff;border-radius:9px;padding:10px 12px;color:var(--n);text-decoration:none;white-space:nowrap">AED Repository</a>';
      html=html.replace(auditButton,auditButton+repositoryLink);
    }
  }
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function networkFirst(request){
  try{
    const fresh=await fetch(request,{cache:'no-store'});
    const cache=await caches.open(RUNTIME_CACHE);
    cache.put(request,fresh.clone());
    return decorateMainApp(fresh);
  }catch(err){
    const cached=(await caches.match(request)) || (await caches.match('./index.html'));
    return decorateMainApp(cached);
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
  if(url.origin===self.location.origin&&url.pathname.endsWith('/pdf-export.js')){
    event.respondWith(networkFirst(event.request));
    return;
  }
  if(url.origin===self.location.origin){
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
  event.respondWith(staleWhileRevalidate(event.request));
});