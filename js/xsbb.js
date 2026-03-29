'use strict';

// ─── 配置 ────────────────────────────────────────────────────────
const CONFIG = {
  appId:     '91UroQk3R6xRP5p6CD7bfDJm-MdYXbMMI',       // 填入 LeanCloud appId
  appKey:    'qxxUH8hJtxNcKYQbOfS6K9Ox',       // 填入 LeanCloud appKey
  serverURL: 'https://lecdapi.767373.xyz',       // 填入 LeanCloud serverURL
  className: 'content',
  pageSize:  20,
  cacheKey:  'xsbb_v1',
  cacheTTL:  5 * 60 * 1000,  // 5 分钟
};

// ─── 状态（原来散落在 Vue data 里）──────────────────────────────
const state = {
  contents:      [],
  count:         0,
  isLoading:     false,
  hasMore:       true,
  lastCreatedAt: null,  // cursor 分页游标
};

// ─── DOM 节点（只查询一次）──────────────────────────────────────
const $ = {
  count:    document.getElementById('count'),
  list:     document.getElementById('list'),
  loadBtn:  document.getElementById('load-btn'),
  skeleton: document.getElementById('skeleton'),
  sentinel: document.getElementById('scroll-sentinel'),
};

// ─── 工具函数 ────────────────────────────────────────────────────

function formatDate(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function urlToLink(str) {
  return str.replace(
    /(https?|ftp):\/\/[\w-]+(\.[\w-]+)+([\w\-.,@?^=%&:/~+#]*[\w\-@?^=%&/~+#])?/g,
    (url) => `<a href="${encodeURI(url)}" target="_blank" rel="noopener noreferrer"><i class="iconfont icon-lianjie-copy"></i>链接</a>`
  );
}

async function withRetry(fn, retries = 3, delay = 600) {
  try { return await fn(); }
  catch (e) {
    if (retries === 0) throw e;
    await new Promise(r => setTimeout(r, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

// ─── 缓存 ────────────────────────────────────────────────────────

const cache = {
  get() {
    try { return JSON.parse(localStorage.getItem(CONFIG.cacheKey)); } catch { return null; }
  },
  set(data) {
    try { localStorage.setItem(CONFIG.cacheKey, JSON.stringify({ ...data, ts: Date.now() })); } catch {}
  },
  isStale(c) { return !c || Date.now() - c.ts > CONFIG.cacheTTL; },
};

// ─── LeanCloud 请求 ──────────────────────────────────────────────

function makeQuery() {
  const q = new AV.Query(CONFIG.className);
  q.descending('createdAt');
  q.limit(CONFIG.pageSize);
  return q;
}

async function fetchFirst() {
  const q = makeQuery();
  const [count, results] = await Promise.all([
    withRetry(() => q.count()),
    withRetry(() => q.find()),
  ]);
  return { count, items: results };
}

async function fetchMore() {
  const q = makeQuery();
  q.lessThan('createdAt', state.lastCreatedAt);
  return withRetry(() => q.find());
}

// ─── DOM 渲染 ────────────────────────────────────────────────────

function itemToHTML(item) {
  const attrs   = item.attributes ?? item;   // 兼容原始对象和缓存的 JSON
  const type    = attrs.type    ?? 0;
  const tag     = attrs.tag     ?? '';
  const device  = attrs.device  ?? '';
  const time    = formatDate(new Date(item.createdAt));
  const content = urlToLink(attrs.content ?? '');

  return `<section class="item type-${Number(type)}">
    <content>${content}</content>
    ${tag    ? `<tag>${tag}</tag>` : ''}
    ${device ? `<span class="equipment" data-device="${device}"></span>` : ''}
    <time datetime="${item.createdAt}">${time}</time>
  </section>`;
}

function appendItems(items) {
  if (!items.length) return;
  $.list.insertAdjacentHTML('beforeend', items.map(itemToHTML).join(''));
  state.contents.push(...items);
  state.lastCreatedAt = items[items.length - 1].createdAt;
}

// ─── UI 状态控制 ─────────────────────────────────────────────────

function setCount(n) {
  state.count = n;
  $.count.textContent = n;
}

function setLoading(v) {
  state.isLoading    = v;
  $.loadBtn.disabled = v;
  $.loadBtn.textContent = v ? '加载中…' : '再翻翻';
}

function setHasMore(v) {
  state.hasMore          = v;
  $.loadBtn.style.display = v ? '' : 'none';
}

function showSkeleton(v) {
  $.skeleton.style.display = v ? '' : 'none';
}

// ─── 核心逻辑 ────────────────────────────────────────────────────

async function loadMore() {
  if (state.isLoading || !state.hasMore) return;
  setLoading(true);
  try {
    const items = await fetchMore();
    appendItems(items);
    if (items.length < CONFIG.pageSize) setHasMore(false);
  } catch (e) {
    console.error('加载失败', e);
  } finally {
    setLoading(false);
  }
}

function applyFirst(items, count) {
  setCount(count);
  showSkeleton(false);
  appendItems(items);
  setHasMore(items.length >= CONFIG.pageSize);
}

async function silentRevalidate() {
  try {
    const { count, items } = await fetchFirst();
    $.list.innerHTML = '';
    state.contents = [];
    state.lastCreatedAt = null;
    applyFirst(items, count);
    cache.set({ count, items: items.map(i => i.toJSON()) });
  } catch {}
}

// ─── 启动 ────────────────────────────────────────────────────────

async function init() {
  AV.init({ appId: CONFIG.appId, appKey: CONFIG.appKey, serverURL: CONFIG.serverURL });

  $.loadBtn.addEventListener('click', loadMore);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '200px' }
    ).observe($.sentinel);
  }

  const cached = cache.get();
  if (cached?.items?.length) {
    // 有缓存：立即渲染（用户秒看到内容）
    applyFirst(cached.items, cached.count);
    // 缓存过期则后台静默刷新
    if (cache.isStale(cached)) silentRevalidate();
  } else {
    // 首次：骨架屏 + 并发请求
    showSkeleton(true);
    try {
      const { count, items } = await fetchFirst();
      applyFirst(items, count);
      cache.set({ count, items: items.map(i => i.toJSON()) });
    } catch (e) {
      showSkeleton(false);
      console.error('初始化失败', e);
    }
  }
}

init();
