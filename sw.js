
const CACHE_NAME='yapre-pastel-icons-print-v4-1758069037';
const ASSETS=['./','index.html','style.css?v=1758069037','script.js?v=1758069037','drugs.json','manifest.json',
'favicon-16.png','favicon-32.png','icon-96x96.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))).then(()=>self.clients.claim())});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
