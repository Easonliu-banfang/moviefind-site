// Service Worker: 缓存站点图标，离线可用
const ICON_CACHE = 'icons-v1';
const ICONS = [
  '/icons/sorani.ico',
  '/icons/appmovie.ico',
  '/icons/auete-video.ico',
  '/icons/darkvod.ico',
  '/icons/ppnix.ico',
  '/icons/duse91.ico',
  '/icons/ifn.ico',
  '/icons/fdzys.ico',
  '/icons/juok.ico',
  '/icons/juzong.ico',
  '/icons/jianyunys.ico',
  '/icons/pianku.ico',
  '/icons/66-dapianwang.png',
  '/icons/didahd.ico',
  '/icons/zhuiying.png',
  '/icons/wbbb.ico',
  '/icons/kxyy.png',
  '/icons/dhvideo.ico',
  '/icons/zip0.ico',
  '/icons/sotvla.ico',
  '/icons/libvio.ico',
  '/icons/dbku.ico',
  '/icons/yingmao-cangku.png',
  '/icons/guangsu-yingshi.ico',
  '/icons/naifei-fyi-19.ico',
  '/icons/skr-skr1-cc-9.png',
  '/icons/aikanbot.ico',
  '/icons/zndy.ico',
];

// 安装：预缓存所有图标
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(ICON_CACHE).then(cache => cache.addAll(ICONS))
  );
  self.skipWaiting();
});

// 激活：清除旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== ICON_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 拦截请求：图标从缓存读取，其他请求走网络
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // 只拦截 /icons/ 路径的请求
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(ICON_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});
