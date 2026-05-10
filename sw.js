try {
  importScripts('https://fastly.jsdelivr.net/npm/workbox-sw@7.3.0/build/workbox-sw.min.js');
} catch(e) {
  console.warn('[SW] Workbox 加载失败', e);
}

if (typeof workbox === 'undefined') {
  self.addEventListener('fetch', () => {});
} else {
  init();
}

function init() {
  workbox.setConfig({ debug: false });

  const VER = 'v1';
  workbox.core.setCacheNameDetails({ prefix: 'xsbb', suffix: VER });

  // 预缓存 HTML Shell
  workbox.precaching.precacheAndRoute([
    { url: '/index.html', revision: VER },
  ]);

  // CDN 静态资源（jsdelivr、zeoseven）— CacheFirst 30天
  workbox.routing.registerRoute(
    new RegExp('^https://(?:fastly\\.jsdelivr\\.net|static\\.zeoseven\\.com)'),
    new workbox.strategies.CacheFirst({
      cacheName: 'cdn-' + VER,
      fetchOptions: { mode: 'cors', credentials: 'omit' },
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true,
        }),
      ],
    })
  );

  // 字体文件 — CacheFirst 30天
  workbox.routing.registerRoute(
    new RegExp('\\.woff2?$'),
    new workbox.strategies.CacheFirst({
      cacheName: 'fonts-' + VER,
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    })
  );

  // 图片 — StaleWhileRevalidate
  workbox.routing.registerRoute(
    new RegExp('\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'images-' + VER,
      plugins: [ new workbox.expiration.ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 }) ],
    })
  );

  // 本地 CSS/JS — StaleWhileRevalidate
  workbox.routing.registerRoute(
    ({ url }) => url.origin === self.location.origin && /\.(css|js)$/.test(url.pathname),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'assets-' + VER,
      plugins: [ new workbox.expiration.ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 }) ],
    })
  );

  // Worker API（/api/posts、/api/count）— NetworkFirst 3s超时，离线兜底
  workbox.routing.registerRoute(
    new RegExp('^https://api.xsbb\\.'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'api-' + VER,
      fetchOptions: { mode: 'cors', credentials: 'omit' },
      networkTimeoutSeconds: 3,
      plugins: [
        new workbox.expiration.ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 24 * 60 * 60 }),
        new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    })
  );

  // 默认 — NetworkFirst
  workbox.routing.setDefaultHandler(new workbox.strategies.NetworkFirst({ networkTimeoutSeconds: 3 }));
}
