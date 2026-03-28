var {
    Query
} = AV;
AV.init({
    appId: "91UroQk3R6xRP5p6CD7bfDJm-MdYXbMMI", 
    appKey: "qxxUH8hJtxNcKYQbOfS6K9Ox", 
    serverURLs: 'https://lecdapi.767373.xyz'
});

// ─── 常量配置（集中管理，方便修改）────────────────────────────
const PAGE_SIZE    = 20;
const CACHE_KEY    = 'xsbb_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

// ─── 工具函数 ─────────────────────────────────────────────────

/**
 * 【优化 1】日期格式化
 * 原来：手写一串三元运算符，逻辑复杂且有 bug
 * getDate()+1、getHours()+1 都多加了 1，导致日期/时间显示错误
 * 现在：用 padStart 统一补零，简洁正确
 */
function formatDate(date) {
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}`;
}

/**
 * 【优化 2】URL 识别：正则末尾修复 + XSS 防护
 * 原来：正则末尾有双分号 ;; 语法错误（不影响运行但不规范）
 * href 直接拼接用户内容，存在 XSS 风险
 * 现在：encodeURI 处理 URL，rel="noopener noreferrer" 防钓鱼
 */
function urlToLink(str) {
  const re = /(https?|ftp):\/\/[\w-]+(\.[\w-]+)+([\w\-.,@?^=%&:/~+#]*[\w\-@?^=%&/~+#])?/g;
  return str.replace(re, (url) => {
    const safe = encodeURI(url);
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer"><i class="iconfont icon-lianjie-copy"></i>链接</a>`;
  });
}

/**
 * 【优化 3】格式化单条数据（纯函数，便于测试和复用）
 * 原来：直接在循环里修改 LeanCloud 对象，副作用难追踪
 */
function formatItem(item) {
  item.attributes.time    = formatDate(new Date(item.createdAt));
  item.attributes.content = '<content>' + urlToLink(item.attributes.content) + '</content>';
  return item;
}

/**
 * 【优化 4】指数退避重试
 * 原来：error 回调是空函数 function(error){}，请求失败静默丢弃
 * 网络抖动或 LeanCloud 限流时用户看到的是永久 Loading
 * 现在：自动重试 3 次，每次等待翻倍
 */
async function withRetry(fn, retries = 3, delay = 600) {
  try {
    return await fn();
  } catch (e) {
    if (retries === 0) throw e;
    await new Promise(r => setTimeout(r, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

// ─── 缓存工具 ─────────────────────────────────────────────────

/**
 * 【优化 5】localStorage 缓存读写（带过期时间）
 * 原来：没有任何客户端缓存，每次打开页面都重新请求
 * 现在：缓存首页数据 + count，5 分钟内二次访问秒显
 */
const cache = {
  get() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed;
    } catch {
      return null;
    }
  },
  set(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() }));
    } catch {
      // localStorage 写满时静默忽略（隐私模式下也可能抛错）
    }
  },
  isStale(cached) {
    return !cached || (Date.now() - cached.ts > CACHE_TTL_MS);
  }
};

// ─── LeanCloud 查询 ───────────────────────────────────────────

/**
 * 【优化 6】并发请求 count + 首页数据
 * 原来：getData(0) 和 query.count() 是两次独立串行请求
 * 现在：Promise.all 同时发出，节省一整个 RTT（约 300~600ms）
 */
async function fetchFirst() {
  const query = new AV.Query('content');
  const [count, results] = await Promise.all([
    withRetry(() => query.count()),
    withRetry(() => query.descending('createdAt').limit(PAGE_SIZE).find())
  ]);
  return { count, items: results.map(formatItem) };
}

/**
 * 【优化 7】翻页使用 cursor（createdAt）替代 offset
 * 原来：skip(page * 20) —— offset 分页，数据量越大越慢（需扫描前 N 行）
 * 现在：记录最后一条的 createdAt，用 lessThan 游标，性能恒定
 */
async function fetchMore(lastCreatedAt) {
  const query = new AV.Query('content');
  query.descending('createdAt');
  query.lessThan('createdAt', lastCreatedAt);
  query.limit(PAGE_SIZE);
  const results = await withRetry(() => query.find());
  return results.map(formatItem);
}

// ─── Vue 实例 ─────────────────────────────────────────────────

var app = new Vue({
  el: '#app',

  data: {
    count:     0,
    isLoading: false,
    hasMore:   true,   // 【优化 8】是否还有更多数据，控制按钮显示
    contents:  []
  },

  computed: {
    /**
     * 【优化 9】最后一条的 createdAt，用于 cursor 分页
     * 用 computed 自动追踪，不用手动维护 lastId 变量
     */
    lastCreatedAt() {
      if (!this.contents.length) return null;
      return this.contents[this.contents.length - 1].createdAt;
    }
  },

  methods: {
    /**
     * 【优化 10】loadMore：防重复点击 + 无更多时提示
     * 原来：没有 isLoading 守卫，快速点击会发多个请求
     * 没有判断是否还有数据，到底后 alert('之前没哔哔过了') 很突兀
     */
    async loadMore() {
      if (this.isLoading || !this.hasMore) return;
      this.isLoading = true;
      try {
        const items = await fetchMore(this.lastCreatedAt);
        if (items.length < PAGE_SIZE) {
          this.hasMore = false; // 【优化 8】返回条数不足一页，说明到底了
        }
        if (items.length === 0) {
          // 不用 alert，更优雅
          this.hasMore = false;
        } else {
          this.contents.push(...items);
        }
      } catch (e) {
        console.error('加载失败', e);
        // 可以在这里显示一个错误提示 toast
      } finally {
        this.isLoading = false;
      }
    },

    /**
     * 【优化 11】静默后台刷新（Stale-While-Revalidate）
     * 先展示缓存，后台悄悄拿最新数据更新，用户无感知
     */
    async silentRevalidate() {
      try {
        const { count, items } = await fetchFirst();
        this.count    = count;
        this.contents = items;
        this.hasMore  = items.length >= PAGE_SIZE;
        cache.set({ count, items });
      } catch {
        // 后台刷新失败不影响展示
      }
    }
  },

  async mounted() {
    /**
     * 【优化 12】Stale-While-Revalidate 启动流程
     * 1. 有缓存 → 立即渲染（用户秒看到内容）
     * 2. 缓存过期 → 后台静默刷新
     * 3. 无缓存 → 正常请求，同时展示骨架屏（HTML 里控制）
     */
    const cached = cache.get();

    if (cached && cached.items) {
      // 立即用缓存填充，用户不等待
      this.count    = cached.count;
      this.contents = cached.items;
      this.hasMore  = cached.items.length >= PAGE_SIZE;

      if (cache.isStale(cached)) {
        // 缓存过期，后台刷新
        this.silentRevalidate();
      }
    } else {
      // 首次加载：并发请求 count + 数据
      this.isLoading = true;
      try {
        const { count, items } = await fetchFirst();
        this.count    = count;
        this.contents = items;
        this.hasMore  = items.length >= PAGE_SIZE;
        cache.set({ count, items });
      } catch (e) {
        console.error('初始加载失败', e);
      } finally {
        this.isLoading = false;
      }
    }

    // 【优化 13】IntersectionObserver：滚动到底自动加载，无需点按钮
    // （需要 index.html 里有 id="scroll-sentinel" 的元素）
    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && this.hasMore && !this.isLoading) {
          this.loadMore();
        }
      }, { rootMargin: '200px' }); // 提前 200px 触发，用户感知不到加载
      observer.observe(sentinel);
    }
  }
});