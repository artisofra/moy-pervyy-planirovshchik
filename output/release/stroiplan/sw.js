/* Interface cache only. No plans, IndexedDB records, downloads or external URLs. */
importScripts('./app-assets.js');
const {version,assets}=self.STROIPLAN_RELEASE;
const prefix='stroiplan-ui:'+self.registration.scope+':',cacheName=prefix+version;
const urls=new Map(assets.map(asset=>[new URL(asset.url,self.registration.scope).href,asset]));
const home=new URL('index.html',self.registration.scope).href;
let repairing;
async function fillCache(){
  if(repairing)return repairing;
  repairing=(async()=>{
    const responses=await Promise.all(assets.map(async asset=>{
      const url=new URL(asset.url,self.registration.scope).href,response=await fetch(new Request(url,{cache:'reload',credentials:'same-origin'}));
      if(!response.ok||new URL(response.url).origin!==self.location.origin)throw Error('Incomplete interface');
      const digest=await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
      const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      if(hash!==asset.sha256)throw Error('Interface version mismatch');
      return[url,response];
    }));
    const cache=await caches.open(cacheName);
    await Promise.all(responses.map(([url,response])=>cache.put(url,response)));
  })();
  try{await repairing;}finally{repairing=null;}
}
async function ready(){const cache=await caches.open(cacheName);for(const url of urls.keys())if(!await cache.match(url))return false;return true;}
self.addEventListener('install',event=>{event.waitUntil(fillCache().catch(async error=>{await caches.delete(cacheName);throw error;}));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(prefix)&&key!==cacheName)await caches.delete(key);await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  url.search='';url.hash='';
  let key=url.href;if(key===self.registration.scope)key=home;
  if(!urls.has(key))return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName),cached=await cache.match(key);
    if(cached)return cached;
    // Cache repair is explicit. Never cache arbitrary network responses or plan files.
    return fetch(event.request);
  })());
});
self.addEventListener('message',event=>{
  if(!event.source?.url?.startsWith(self.registration.scope))return;
  if(event.data?.type==='APPLY_UPDATE'){event.waitUntil(self.skipWaiting());return;}
  if(!['CACHE_STATUS','REPAIR_CACHE'].includes(event.data?.type))return;
  event.waitUntil((async()=>{
    try{if(event.data.type==='REPAIR_CACHE')await fillCache();event.ports[0]?.postMessage({ready:await ready(),version,files:assets.length});}
    catch{event.ports[0]?.postMessage({ready:false,version,files:assets.length});}
  })());
});
