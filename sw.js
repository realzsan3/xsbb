// ─── Workbox 加载（带降级处理）────────────────────────────────
// 原来直接 importScripts，jsdelivr 挂了整个 SW 就废了
// 现在用 try/catch 兜底，SW 至少能正常注册不报错
try {
  importScripts('https://fastly.jsdelivr.net/npm/workbox-sw@7.3.0/build/workbox-sw.min.js');
} catch (e) {
  console.warn('[SW] Workbox 加载失败，离线缓存不可用', e);
}

if (typeof workbox === 'undefined') {
  // Workbox 加载失败时，SW 静默退出，不影响页面正常使用
  self.addEventListener('fetch', () => {});
} else {
  initWorkbox();
}

function initWorkbox() {
  // ─── 基础配置 ──────────────────────────────────────────────
  workbox.setConfig({ debug: false });

  // 版本号改为语义化，方便识别
  // ⚠️ 每次改动 SW 逻辑时更新这里，会触发旧缓存清理
  const VER = 'v3';

  workbox.core.setCacheNameDetails({
    prefix: 'xsbb',
    suffix: VER,
  });

  // ─── 预缓存：只缓存 HTML Shell ────────────────────────────
  // 原来的版本号用日期字符串，现在改为语义化版本
  workbox.precaching.precacheAndRoute([
    { url: '/index.html', revision: VER },
  ]);

  // ─── 静态不可变资源：CacheFirst，缓存 30 天 ───────────────
  // jsdelivr / zeoseven 字体 CDN — 内容不会变，长期缓存
  workbox.routing.registerRoute(
    new RegExp('^https://(?:fastly\\.jsdelivr\\.net|static\\.zeoseven\\.com|unpkg\\.com)'),
    new workbox.strategies.CacheFirst({
      cacheName: 'cdn-immutable-' + VER,
      fetchOptions: { mode: 'cors', credentials: 'omit' },
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 30 * 24 * 60 * 60,
          purgeOnQuotaError: true,
        }),
      ],
    })
  );

  // ─── 字体文件：CacheFirst，缓存 30 天 ─────────────────────
  workbox.routing.registerRoute(
    new RegExp('\\.woff2?$'),
    new workbox.strategies.CacheFirst({
      cacheName: 'fonts-' + VER,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 20,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        }),
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
      ],
    })
  );

  // ─── 图片：StaleWhileRevalidate，缓存 7 天 ────────────────
  workbox.routing.registerRoute(
    new RegExp('\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'images-' + VER,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        }),
      ],
    })
  );

  // ─── 本地 CSS / JS：StaleWhileRevalidate ──────────────────
  // 只匹配自己域名下的静态资源，不误匹配 CDN（CDN 已在上面单独处理）
  workbox.routing.registerRoute(
    ({ url }) => url.origin === self.location.origin &&
      /\.(css|js)$/.test(url.pathname),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'assets-' + VER,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        }),
      ],
    })
  );

  // ─── LeanCloud API：NetworkFirst，3 秒超时降级缓存 ────────
  // 核心数据接口，优先网络保证新鲜，超时或离线时用缓存兜底
  workbox.routing.registerRoute(
    new RegExp('^https://(?:lecdapi\\.767373\\.xyz)'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'leancloud-api-' + VER,
      fetchOptions: { mode: 'cors', credentials: 'omit' },
      networkTimeoutSeconds: 3,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 20,
          // API 缓存保留 1 天（离线时兜底用）
          maxAgeSeconds: 24 * 60 * 60,
        }),
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
      ],
    })
  );

  // ─── 默认：NetworkFirst，3 秒超时 ─────────────────────────
  workbox.routing.setDefaultHandler(
    new workbox.strategies.NetworkFirst({
      networkTimeoutSeconds: 3,
    })
  );

  // ─── 离线降级页（可选）────────────────────────────────────
  // 如果你有一个 /offline.html，可以在完全离线时展示它
  // workbox.routing.setCatchHandler(async ({ event }) => {
  //   if (event.request.destination === 'document') {
  //     return caches.match('/offline.html');
  //   }
  //   return Response.error();
  // });
}
