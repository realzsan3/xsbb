importScripts("https://fastly.jsdelivr.net/npm/workbox-sw@6.5.4/build/workbox-sw.min.js");
workbox.setConfig(
    {
        // modulePathPrefix: '/js/',
        debug: false
    }
);

let cacheSuffixVersion = '-220806'; // 缓存版本号
const maxEntries = 100; // 最大条目数

workbox.core.setCacheNameDetails({
    prefix: 'xsbb', // 前缀
    suffix: cacheSuffixVersion, // 后缀
});

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

workbox.routing.registerRoute(/\.json$/, new workbox.strategies.StaleWhileRevalidate({
    cacheName: "json-cache" + cacheSuffixVersion,
    fetchOptions: {
        mode: 'cors'
    },
    plugins: [
        new workbox.expiration.ExpirationPlugin({
            maxEntries,
            maxAgeSeconds: 7 * 24 * 60 * 60,
        })],
}));

workbox.routing.registerRoute(
    new RegExp('^https://fastly\\.jsdelivr\\.net'),
    new workbox.strategies.CacheFirst({
        cacheName: 'static-immutable' + cacheSuffixVersion,
        fetchOptions: {
            mode: 'cors',
            credentials: 'omit',
        },
        plugins: [
            new workbox.expiration.ExpirationPlugin({
                maxAgeSeconds: 30 * 24 * 60 * 60,
                purgeOnQuotaError: true,
            }),
        ],
    })
);

workbox.routing.registerRoute(
    // 匹配 woff 字体
    new RegExp('.*.woff'),
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
    // 匹配 leancloudapi.xsbb.tk
    new RegExp('^https://(?:leancloudapi\\.xsbb\\.tk)'),
    new workbox.strategies.NetworkFirst({
        // cache storage 名称和版本号
        cacheName: 'leancloud-api-cache' + cacheSuffixVersion,
        fetchOptions: {
            mode: 'cors',
            credentials: 'omit',
        },
        networkTimeoutSeconds: 3,
    })
);

workbox.routing.setDefaultHandler(
    new workbox.strategies.NetworkFirst({
        networkTimeoutSeconds: 3,
    })
);


workbox.googleAnalytics.initialize({
    parameterOverrides: {
        cd1: 'offline',
    },
    hitFilter: (params) => {
        const queueTimeInSeconds = Math.round(params.get('qt') / 1000);
        params.set('cm1', queueTimeInSeconds);
    },
});