// importScripts("https://cdn.jsdelivr.net/npm/workbox-sw@4.3.1/build/workbox-sw.min.js");
// workbox.setConfig({
//     modulePathPrefix: 'https://cdn.jsdelivr.net/npm/workbox-sw@4.3.1/build/workbox-sw.min.js',
// });
importScripts("./js/workbox-sw.min.js");
workbox.setConfig({
    modulePathPrefix: './js/',
});

let cacheSuffixVersion = '-220806'; // 缓存版本号
const maxEntries = 100; // 最大条目数

core.setCacheNameDetails({
    prefix: 'xsbb', // 前缀
    suffix: cacheSuffixVersion, // 后缀
});

// workbox.core.setCacheNameDetails({
//     prefix: "xsbb",
//     suffix: "v1",
//     precache: "precache-xsbb",
//     runtime: "runtime-xsbb"
// });

if (workbox) {
    console.log("Yay! Workbox is loaded 🎉")
} else {
    console.log("Boo! Workbox didn't load 😬")
}
let cacheFiles = [
    {
        url: "/index.html",
        revision: cacheSuffixVersion
    }
];

workbox.precaching.precacheAndRoute(cacheFiles);

// workbox.routing.registerRoute(/\.css$/, new workbox.strategies.StaleWhileRevalidate({
//     cacheName: "css-cache-v1"
// }));

// workbox.routing.registerRoute(/\.(?:js)$/, new workbox.strategies.StaleWhileRevalidate({
//     cacheName: "js-cache-v1"
// }));

workbox.routing.registerRoute(/\.json$/, new workbox.strategies.StaleWhileRevalidate({
    cacheName: "json-cache" + cacheSuffixVersion,
    plugins: [new workbox.expiration.Plugin({
        maxEntries,
        maxAgeSeconds: 7 * 24 * 60 * 60,
    })],
}));

// workbox.routing.registerRoute(/\.(?:png|jpg|jpeg|svg|gif|ico)$/, new workbox.strategies.CacheFirst({
//     cacheName: "image-cache-v1"
// }));

workbox.routing.registerRoute(
    // 匹配 fonts.googleapis.com 和 fonts.gstatic.com 两个域名
    new RegExp('.*.tff'),
    new workbox.strategies.StaleWhileRevalidate({
        // cache storage 名称和版本号
        cacheName: 'font-cache' + cacheSuffixVersion,
        plugins: [
            // 使用 expiration 插件实现缓存条目数目和时间控制
            new workbox.expiration.ExpirationPlugin({
                // 最大保存项目
                maxEntries,
                // 缓存 30 天
                maxAgeSeconds: 30 * 24 * 60 * 60,
            }),
            // 使用 cacheableResponse 插件缓存状态码为 0 的请求
            new workbox.cacheableResponse.CacheableResponsePlugin({
                statuses: [0, 200],
            }),
        ],
    })
);

workbox.routing.registerRoute(
    new RegExp('.*.(?:png|jpg|jpeg|svg|gif|webp|ico)'),
    new workbox.strategies.StaleWhileRevalidate()
);

workbox.routing.registerRoute(
    new RegExp('.*.(css|js)'),
    new workbox.strategies.StaleWhileRevalidate()
);

workbox.routing.registerRoute(
    // 匹配 leancloudapi.xsbb.ml
    new RegExp('^https://(?:leancloudapi\\.xsbb\\.ml)'),
    new workbox.strategies.StaleWhileRevalidate({
        // cache storage 名称和版本号
        cacheName: 'api-cache' + cacheSuffixVersion,
        plugins: [
            // 使用 expiration 插件实现缓存条目数目和时间控制
            new workbox.expiration.ExpirationPlugin({
                // 最大保存项目
                maxEntries,
                // 缓存 30 天
                maxAgeSeconds: 7 * 24 * 60 * 60,
            }),
            // 使用 cacheableResponse 插件缓存状态码为 0 的请求
            new workbox.cacheableResponse.CacheableResponsePlugin({
                statuses: [0, 200],
            }),
        ],
    })
);

workbox.routing.setDefaultHandler(
    new workbox.strategies.NetworkFirst({
        networkTimeoutSeconds: 3,
    })
);
