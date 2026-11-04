const C='field-ready-958d62057002',FILES=['/fitness/','/fitness/manifest.webmanifest','/fitness/icon.png'];
const keep=async(c,u)=>{const r=await fetch(u,{cache:'no-store'});if(r.ok&&r.type==='basic'&&!r.redirected)await c.put(u,r.clone());return r};
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(C);for(const f of FILES)await keep(c,f);self.skipWaiting()})())});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==C&&k.startsWith('field-ready-'))await caches.delete(k);await self.clients.claim()})())});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin||e.request.method!=='GET')return;
 if(u.pathname==='/fitness/unlock')return;
 const f=e.request.mode==='navigate'?'/fitness/':FILES.includes(u.pathname)?u.pathname:null;if(!f)return;
 e.respondWith((async()=>{const c=await caches.open(C),hit=await c.match(f);if(hit){e.waitUntil(keep(c,f).catch(()=>{}));return hit}const r=await fetch(f==='/fitness/'?f:e.request,{cache:'no-store'});if(r.ok&&r.type==='basic'&&!r.redirected)await c.put(f,r.clone());return r})())});
