'use strict';

// ─── 配置（部署后替换 API_BASE）─────────────────────────────────
const CONFIG = {
  apiBase:  'https://api.xsbb.767373.xyz',  // Worker 地址
  pageSize: 20,
  cacheKey: 'xsbb_v2',
  cacheTTL: 5 * 60 * 1000, // 5 分钟
};

// 机型兜底（无 device 字段时按 type 显示）
const DEVICE_MAP = {
  0: 'iPhone 17 Pro Max📱',
  1: 'iPhone 16 Pro📱',
};

// ─── 状态 ────────────────────────────────────────────────────────
const state = {
  isLoading:     false,
  hasMore:       true,
  lastCreatedAt: null,
};

// ─── DOM ─────────────────────────────────────────────────────────
const $ = {
  count:    document.getElementById('count'),
  list:     document.getElementById('list'),
  loadBtn:  document.getElementById('load-btn'),
  skeleton: document.getElementById('skeleton'),
  sentinel: document.getElementById('scroll-sentinel'),
};

// ─── 工具 ────────────────────────────────────────────────────────

function formatDate(str) {
  const d = new Date(str);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function urlToLink(str) {
  return str.replace(
    /(https?|ftp):\/\/[\w-]+(\.[\w-]+)+([\w\-.,@?^=%&:/~+#]*[\w\-@?^=%&/~+#])?/g,
    url => `<a href="${encodeURI(url)}" target="_blank" rel="noopener noreferrer"><i class="iconfont icon-lianjie-copy"></i>链接</a>`
  );
}

async function withRetry(fn, retries = 3, delay = 600) {
  try { return await fn(); }
  catch(e) {
    if (retries === 0) throw e;
    await new Promise(r => setTimeout(r, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

// ─── 缓存 ────────────────────────────────────────────────────────
const cache = {
  get()      { try { return JSON.parse(localStorage.getItem(CONFIG.cacheKey)); } catch { return null; } },
  set(data)  { try { localStorage.setItem(CONFIG.cacheKey, JSON.stringify({ ...data, ts: Date.now() })); } catch {} },
  isStale(c) { return !c || Date.now() - c.ts > CONFIG.cacheTTL; },
};

// ─── API ─────────────────────────────────────────────────────────
async function apiFetch(path) {
  const res = await fetch(CONFIG.apiBase + path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchFirst() {
  const [{ count }, { posts }] = await Promise.all([
    withRetry(() => apiFetch('/api/count')),
    withRetry(() => apiFetch(`/api/posts?limit=${CONFIG.pageSize}`)),
  ]);
  return { count, posts };
}

async function fetchMore() {
  const { posts } = await withRetry(() =>
    apiFetch(`/api/posts?limit=${CONFIG.pageSize}&before=${encodeURIComponent(state.lastCreatedAt)}`)
  );
  return posts;
}

// ─── 渲染 ────────────────────────────────────────────────────────
function postToHTML(p) {
  const type   = p.type   ?? 0;
  const device = p.device || DEVICE_MAP[type] || '';
  const time   = formatDate(p.created_at);
  const body   = urlToLink(p.content ?? '');
  return `<section class="item type-${Number(type)}">
    <content>${body}</content>
    ${p.tag    ? `<tag>${p.tag}</tag>` : ''}
    <span class="equipment" data-device="${device}"></span>
    <time datetime="${p.created_at}">${time}</time>
  </section>`;
}

function appendPosts(posts) {
  if (!posts.length) return;
  $.list.insertAdjacentHTML('beforeend', posts.map(postToHTML).join(''));
  state.lastCreatedAt = posts[posts.length - 1].created_at;
}

// ─── UI 状态 ─────────────────────────────────────────────────────
function setCount(n)     { $.count.textContent = n; }
function showSkeleton(v) { $.skeleton.style.display = v ? '' : 'none'; }
function setLoading(v) {
  state.isLoading       = v;
  $.loadBtn.disabled    = v;
  $.loadBtn.textContent = v ? '加载中…' : '再翻翻';
}
function setHasMore(v) {
  state.hasMore           = v;
  $.loadBtn.style.display = v ? '' : 'none';
  if (!v && window._observer) window._observer.disconnect();
}

// ─── 核心逻辑 ────────────────────────────────────────────────────
async function loadMore() {
  if (state.isLoading || !state.hasMore || !state.lastCreatedAt) return;
  setLoading(true);
  try {
    const posts = await fetchMore();
    appendPosts(posts);
    if (posts.length < CONFIG.pageSize) setHasMore(false);
  } catch(e) {
    console.error('加载失败', e);
  } finally {
    setLoading(false);
  }
}

function applyFirst(posts, count) {
  setCount(count);
  showSkeleton(false);
  appendPosts(posts);
  setHasMore(posts.length >= CONFIG.pageSize);
}

async function silentRevalidate() {
  try {
    const { count, posts } = await fetchFirst();
    $.list.innerHTML    = '';
    state.lastCreatedAt = null;
    applyFirst(posts, count);
    cache.set({ count, posts });
  } catch {}
}

// ─── 启动 ────────────────────────────────────────────────────────
async function init() {
  $.loadBtn.addEventListener('click', loadMore);

  // 无感滚动加载，冷却 800ms 防连续触发
  if ('IntersectionObserver' in window) {
    let cooldown = false;
    window._observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || cooldown) return;
      cooldown = true;
      loadMore().finally(() => setTimeout(() => { cooldown = false; }, 800));
    }, { rootMargin: '300px' });
    window._observer.observe($.sentinel);
  }

  // Stale-While-Revalidate
  const cached = cache.get();
  if (cached?.posts?.length) {
    applyFirst(cached.posts, cached.count);
    if (cache.isStale(cached)) silentRevalidate();
  } else {
    showSkeleton(true);
    try {
      const { count, posts } = await fetchFirst();
      applyFirst(posts, count);
      cache.set({ count, posts });
    } catch(e) {
      showSkeleton(false);
      console.error('初始化失败', e);
    }
  }
}

init();
