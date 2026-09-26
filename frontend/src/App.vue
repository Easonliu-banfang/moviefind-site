<script setup>
import { ref, computed } from "vue";
import { SITES } from "./sites.js";

// ====== Cloudflare Worker 实际地址（兜底默认值，可由仓库 Secret VITE_WORKER_URL 覆盖）======
// Worker 仅作「实时核验已确认片源」的可选加分项；全部站点本身就由本地清单即时渲染。
const WORKER_BASE = (import.meta.env.VITE_WORKER_URL || "https://moviefind-search.17721266011.workers.dev").replace(/\/+$/, "");

const kw = ref("");
const results = ref([]);
const loading = ref(false);
const enhancing = ref(false);
const error = ref("");
const searched = ref(false);
const showOthers = ref(true);
const view = ref("home"); // 'home' 落地页 | 'results' 结果页

// 用户手动隐藏的站点（localStorage 持久化）—— 针对「我自己的 IP / 设备 / 浏览器被某站封了」的情况
const HIDDEN_KEY = "moviefind_hidden_sites";
function loadHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]")); } catch { return new Set(); }
}
const hiddenIds = ref(loadHidden());
function saveHidden() {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenIds.value])); } catch { /* ignore */ }
}
function hideSite(id) { hiddenIds.value.add(id); saveHidden(); }
function unhideSite(id) { hiddenIds.value.delete(id); saveHidden(); }
function unhideAll() { hiddenIds.value = new Set(); saveHidden(); }

const demoHits = [];

// 确定性「海报井」色：由站点 id 哈希出稳定色相，让列表像一面精选海报墙而非千篇一律的卡片。
function wellHue(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}
function wellStyle(id) {
  const h = wellHue(id);
  return {
    background: `linear-gradient(152deg, hsl(${h} 40% 23%), hsl(${h} 36% 13%))`,
    color: `hsl(${h} 58% 78%)`,
    boxShadow: `inset 0 1px 0 hsl(${h} 55% 34% / .45), 0 4px 14px hsl(${h} 50% 8% / .55)`,
  };
}
function monogram(name) { return (name || "?").trim().charAt(0); }

// 站点 favicon：先试 /favicon.ico，加载失败则 Worker 解析真实 URL，再失败回退品牌徽章
function getFavicon(origin) {
  if (!origin) return null;
  try { return new URL("/favicon.ico", origin).href; } catch { return origin + "/favicon.ico"; }
}
// 10 秒内图标未加载完成 → 自动回退到品牌徽章（避免长时间卡在空白圆圈）
function startFaviconTimer(r) {
  if (r._faviconTimer) return; // 已启动过则不重复
  r._faviconTimer = setTimeout(() => {
    r._faviconTimer = null;
    r._noFavicon = true;
  }, 10000);
}
function clearFaviconTimer(r) {
  if (r._faviconTimer) { clearTimeout(r._faviconTimer); r._faviconTimer = null; }
}
// favicon 加载成功 → 清除超时
function onFaviconLoad(r) { clearFaviconTimer(r); }
// favicon 加载失败 → 调 Worker 解析站点 HTML 里的真实 icon URL
async function onFaviconErr(r) {
  clearFaviconTimer(r);
  if (r._noFavicon) return;
  if (r._faviconRetried) { r._noFavicon = true; return; }
  r._faviconRetried = true;
  try {
    const res = await fetch(`${WORKER_BASE}/api/favicon?url=${encodeURIComponent(r.origin)}`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.url) { r.poster = null; r._faviconUrl = data.url; r._noFavicon = false; return; }
    }
  } catch { /* ignore */ }
  r._noFavicon = true;
}

function qualityClass(q) {
  const map = { "4K": "q-4k", "蓝光": "q-bd", "1080P": "q-hd", "720P": "q-hd", "高清": "q-hd", "HD": "q-hd" };
  return map[q] || "q-uhd";
}

// 拼出「该站已搜关键词的真实搜索页」URL（点击即在用户浏览器内打开正确结果页）
function buildSearchUrl(site, q) {
  return (site.search || "").replace("{origin}", site.origin).replace("{kw}", encodeURIComponent(q));
}

// 本地一次性渲染全部站点 —— 瞬时、不依赖 Worker
function makeCard(site, q) {
  return {
    id: site.id,
    name: site.name,
    quality: site.quality,
    qualityScore: site.qualityScore || 3,
    ads: site.ads ?? true,        // 默认"可能含广告"；人工实测无广告的站标 ads:false
    login: site.login ?? false,   // 免登录（实测需登录标 login:true）
    realQuality: false,           // 是否为 Worker 实测画质（否则为站点标称，仅供参考）
    // 登录状态标签
    loginLabel: site.login === true ? "需要登录" : "免登录",
    loginCls: site.login === true ? "st-login-req" : "st-login-free",
    // 广告状态标签
    adsLabel: site.ads === true ? "可能含广告" : "无广告",
    adsCls: site.ads === true ? "st-ads-possible" : "st-ads-none",
    // 速度标签
    speedLabel: site.speed === "fast" ? "速度快" : site.speed === "slow" ? "速度慢" : "速度一般",
    speedCls: site.speed === "fast" ? "st-speed-fast" : site.speed === "slow" ? "st-speed-slow" : "st-speed-normal",
    origin: site.origin,
    favicon: site.icon || site.favicon || null,
    searchUrl: buildSearchUrl(site, q),
    verified: false,
    needsCaptcha: !!site.captcha,
    dead: false,
    browserDead: false,           // 浏览器侧（用户自己的网络）连不上 → 自动隐藏
    pageUrl: null,
    title: null,
    poster: null,             // 电影封面（Worker 抓到的海报 URL；无则为 null → 回退 monogram 井）
    posterCand: [],          // 备用封面候选（站点自己页面里解析出的其他海报图）
    _plan: [],              // 封面回退序列：[直链, Worker代取, 直链, 代取, ...]，见 buildPosterPlan
    _pi: 0,                 // 当前回退序列下标
    _faviconTimer: null,    // 图标加载 10 秒超时计时器
    matchScore: 0,          // 关键词匹配度评分（Worker 返回，越高越排前）
    latency_ms: 0,
  };
}

// 综合排序分（优先级：关键词匹配度 > 无广告 > 速度 > 清晰度 > 无人机验证 > 能用站）
// 各档权重严格递减，确保高优先级档无论如何盖过低优先级档。
function rankScore(r) {
  const match = (r.matchScore || 0) * 100000;                           // 匹配度：最高权重，100分=1000万
  const noAds = r.ads === false ? 1_000_000 : 0;                            // 无广告：次高优先级
  const speed = r.latency_ms > 0 ? Math.max(0, 100000 - r.latency_ms) : 0;   // 速度
  const quality = (r.qualityScore || 0) * 200;                              // 清晰度
  const noCaptcha = r.needsCaptcha ? 0 : 100;                               // 无人机验证
  const usable = r.login === true ? 50 : 0;                                 // 需登录但能用的站
  return match + noAds + speed + quality + noCaptcha + usable;
}

// 可见性：排除 服务端死站(dead) / 浏览器侧连不上(browserDead) / 用户手动隐藏(hidden)
function isVisible(r) {
  // 站点可达（未dead、未browserDead、未隐藏）
  if (r.dead || r.browserDead || hiddenIds.value.has(r.id)) return false;
  // 已验证有结果 → 显示
  if (r.verified) return true;
  // 需要验证码/被封锁 → 显示（用户知道原因）
  if (r.needsCaptcha) return true;
  // 可达但无搜索结果 → 不显示（搜了也搜不到，没意义）
  return false;
}

const visibleCards = computed(() => results.value.filter(isVisible));
// 全部站点按 rankScore 排在一起：已确认有片源(✅)在前，其余（含需登录站）在后。
// 需登录站不再单独分框，和其它站混排；其"需登录"只作为卡片上的标签。
const verified = computed(() =>
  visibleCards.value
    .filter((r) => r.verified && !r.needsCaptcha)
    .sort((a, b) => rankScore(b) - rankScore(a) || a.latency_ms - b.latency_ms)
);
// 其余：未确认 / 风控拦截 / SPA / 超时 —— 仍给出跳转，由用户浏览器去站内搜（含需登录站）
const others = computed(() =>
  visibleCards.value
    .filter((r) => !(r.verified && !r.needsCaptcha))
    .sort((a, b) => rankScore(b) - rankScore(a) || a.name.localeCompare(b.name, "zh"))
);
// 用户手动隐藏的站点
const hiddenList = computed(() => results.value.filter((r) => hiddenIds.value.has(r.id)));

// 非阻塞：Worker 可选核验，把已确认站点升级为 ✅ 立即播放，并回填「实测画质」
// 支持每站多结果：Worker 返回 id 为 `site-id-0`、`site-id-1` 等多条结果时，为每条创建独立卡片
async function enhanceWithWorker(q) {
  enhancing.value = true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(`${WORKER_BASE}/api/search?q=${encodeURIComponent(q)}&max=200`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return;
    const d = await r.json();
    if (!d.ok) return;
    const workerResults = d.results || [];
    
    // 按 base id 分组（`site-id-0` → base `site-id`）
    const byBaseId = new Map();
    for (const w of workerResults) {
      const baseId = w.id.replace(/-\d+$/, "");
      if (!byBaseId.has(baseId)) byBaseId.set(baseId, []);
      byBaseId.get(baseId).push(w);
    }
    
    const newCards = []; // 多结果产生的新卡片
    
    for (const [baseId, ws] of byBaseId) {
      // 找对应的现有卡片
      const existingCard = results.value.find(c => c.id === baseId);
      
      // 第一条结果：更新现有卡片
      const first = ws[0];
      if (existingCard) {
        existingCard.verified = !!first.verified;
        existingCard.needsCaptcha = !!first.needsCaptcha;
        existingCard.dead = !!first.dead;
        existingCard.realQuality = !!first.realQuality;
        existingCard.quality = first.quality || existingCard.quality;
        existingCard.qualityScore = first.qualityScore || existingCard.qualityScore;
        existingCard.pageUrl = first.pageUrl || null;
        existingCard.title = first.title || null;
        existingCard.poster = first.poster || null;
        if (first.posterCand && first.posterCand.length) existingCard.posterCand = first.posterCand;
        existingCard._plan = buildPosterPlan(existingCard.poster, existingCard.posterCand);
        existingCard._pi = 0;
        existingCard.matchScore = first.matchScore || 0;
        existingCard.latency_ms = first.latency_ms || 0;
      }
      
      // 后续结果：创建新卡片
      for (let i = 1; i < ws.length; i++) {
        const w = ws[i];
        const site = SITES.find(s => s.id === baseId);
        if (!site) continue;
        newCards.push({
          id: w.id,
          name: site.name,
          quality: w.quality || site.quality,
          qualityScore: w.qualityScore || site.qualityScore || 3,
          ads: site.ads ?? true,
          login: site.login ?? false,
          realQuality: !!w.realQuality,
          loginLabel: site.login === true ? "需要登录" : "免登录",
          loginCls: site.login === true ? "st-login-req" : "st-login-free",
          adsLabel: site.ads === true ? "可能含广告" : "无广告",
          adsCls: site.ads === true ? "st-ads-possible" : "st-ads-none",
          speedLabel: site.speed === "fast" ? "速度快" : site.speed === "slow" ? "速度慢" : "速度一般",
          speedCls: site.speed === "fast" ? "st-speed-fast" : site.speed === "slow" ? "st-speed-slow" : "st-speed-normal",
          origin: site.origin,
          favicon: site.icon || site.favicon || null,
          searchUrl: w.pageUrl || buildSearchUrl(site, q),
          verified: !!w.verified,
          needsCaptcha: !!w.needsCaptcha,
          dead: !!w.dead,
          browserDead: false,
          pageUrl: w.pageUrl || null,
          title: w.title || null,
          poster: w.poster || null,
          posterCand: w.posterCand || [],
          _plan: buildPosterPlan(w.poster, w.posterCand || []),
          _pi: 0,
          _faviconTimer: null,
          matchScore: w.matchScore || 0,
          latency_ms: w.latency_ms || 0,
          _resultIdx: w._resultIdx || i,
          _totalResults: w._totalResults || ws.length,
        });
        startFaviconTimer(newCards[newCards.length - 1]);
      }
    }
    
    // 添加新卡片到结果列表
    if (newCards.length > 0) {
      results.value.push(...newCards);
    }
  } catch {
    /* Worker 超时/失败：本地卡片照常可用，忽略 */
  } finally {
    enhancing.value = false;
  }
}

// ===== 封面失败回退 =====
// 封面 URL 全部来自各站点自己的页面。加载失败的主要成因是图床防盗链：
//   浏览器跨站加载 <img> 时 Referer 是本站（github.io），doubanio 直接 418/403、部分图床按 IP 拦。
// 对策：每张图给两次机会 —— 先浏览器直链，失败后走 Worker 代取（Worker 带图床同源 Referer，
//   实测 doubanio 从 418 变 200）。候选图依次类推；全试完才回退 monogram 井。
// 注意：不引入任何第三方图片源，代取的仍是站点自己的海报字节。
function buildPosterPlan(raw, cands) {
  const uniq = [];
  for (const u of [raw, ...(Array.isArray(cands) ? cands : [])]) {
    if (u && typeof u === "string" && /^https?:\/\//i.test(u) && !uniq.includes(u)) uniq.push(u);
  }
  const plan = [];
  for (const u of uniq.slice(0, 3)) plan.push(u, `${WORKER_BASE}/api/img?u=${encodeURIComponent(u)}`);
  return plan;
}

// <img> 加载失败 → 沿回退序列前进一格；序列走完才清空封面（显示 monogram 井）
function onPosterErr(r) {
  const plan = Array.isArray(r._plan) ? r._plan : [];
  if (!plan.length) { r.poster = null; return; }
  let i = typeof r._pi === "number" ? r._pi : plan.indexOf(r.poster);
  if (i < 0) i = 0;
  i += 1;
  r._pi = i;
  r.poster = i < plan.length ? plan[i] : null;
}

// 浏览器侧可达性探测：用 no-cors 请求各站搜索页。
// 能拿到响应（即使是 403 / 人机挑战页）→ 至少连得上，保留（这类若你被封，用「隐藏」手动处理）；
// 只有网络层彻底连不上（DNS失败 / 连接被 reset / TLS 错误，抛 TypeError）→ 判定你这边也打不开 → 自动隐藏。
// 超时(AbortError)保守保留，避免误杀慢站。
async function probeBrowserReachability() {
  const cards = results.value;
  await Promise.all(cards.map(async (card) => {
    if (card.dead || card.browserDead || hiddenIds.value.has(card.id)) return;
    const url = card.searchUrl || card.origin;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      await fetch(url, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
    } catch (e) {
      if (e && e.name !== "AbortError") card.browserDead = true;
    } finally {
      clearTimeout(t);
    }
  }));
}

async function doSearch() {
  const q = kw.value.trim();
  if (!q || loading.value) return;
  loading.value = true; error.value = ""; searched.value = false;
  showOthers.value = true;
  view.value = "results";
  // 短暂动画后本地即时渲染全部站点（不等待 Worker）
  setTimeout(() => {
    results.value = SITES.map((s) => makeCard(s, q));
    // 启动 10 秒图标超时计时器（加载失败/超时 → 回退品牌徽章）
    results.value.forEach(r => startFaviconTimer(r));
    searched.value = true;
    loading.value = false;
    // 后台并行：Worker 核验 + 浏览器侧可达性探测
    enhanceWithWorker(q);
    probeBrowserReachability();
  }, 480);
}
function goHome() {
  view.value = "home";
  searched.value = false;
  results.value = [];
  kw.value = "";
}
function onKey(e) { if (e.key === "Enter") doSearch(); }
</script>

<template>
  <div class="app">
    <div class="grain" aria-hidden="true"></div>

    <!-- ============ 落地主页 ============ -->
    <div v-if="view === 'home'" class="home">
      <div class="ambient" aria-hidden="true">
        <span class="orb orb-a"></span>
        <span class="orb orb-b"></span>
        <span class="orb orb-c"></span>
      </div>

      <section class="hero">
        <div class="kicker">影视聚合检索 · CINEMA AGGREGATOR</div>
        <h1 class="title">穷鬼影视</h1>

        <form class="search" @submit.prevent="doSearch">
          <span class="s-glyph" aria-hidden="true">⌕</span>
          <input
            v-model="kw"
            @keyup="onKey"
            placeholder="输入片名 / 剧名 / 演员…"
            maxlength="30"
            autofocus
          />
          <button type="submit" :disabled="loading">{{ loading ? "检索中" : "检索" }}</button>
        </form>

        <div class="hot">
          <span class="hot-label">搜任何你想看的 · <b>影片中广告切勿相信</b></span>
        </div>

        <div class="features">
          <div class="feature">
            <span class="f-no">01</span>
            <div class="f-ico">🏆</div>
            <b>画质优先</b>
            <span>4K / 蓝光 自动置顶</span>
          </div>
          <div class="feature">
            <span class="f-no">02</span>
            <div class="f-ico">🚫</div>
            <b>无广告优先</b>
            <span>免登录站靠前</span>
          </div>
          <div class="feature">
            <span class="f-no">03</span>
            <div class="f-ico">✅</div>
            <b>实时核验</b>
            <span>确认有片源才绿标</span>
          </div>
          <div class="feature">
            <span class="f-no">04</span>
            <div class="f-ico">🛡️</div>
            <b>自动隐藏</b>
            <span>打不开的站自动消失</span>
          </div>
        </div>
      </section>
      <footer class="foot">仅聚合跳转第三方影视站 · 本站不存储任何片源 · 请依法合规使用</footer>
    </div>

    <!-- ============ 搜索结果页 ============ -->
    <div v-else class="results">
      <header class="topbar">
        <button class="back" @click="goHome" title="返回首页" aria-label="返回首页">
          <span aria-hidden="true">‹</span>
        </button>
        <form class="search compact" @submit.prevent="doSearch">
          <span class="s-glyph" aria-hidden="true">⌕</span>
          <input v-model="kw" @keyup="onKey" placeholder="搜索片名 / 剧名…" maxlength="30" />
          <button type="submit">搜</button>
        </form>
      </header>

      <main class="content">
        <!-- 加载：胶片帧逐格点亮 + 扫光进度 -->
        <div v-if="loading" class="loader">
          <div class="frames">
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="loader-txt">正在从 <b>{{ SITES.length }}</b> 个影视站检索《{{ kw }}》…</div>
          <div class="scan"><i></i></div>
        </div>
        <p v-else-if="error" class="hint error">{{ error }}</p>

        <template v-else-if="searched && results.length">
          <div class="result-head">
            <h2>
              搜索到 <b>{{ verified.length + others.length }}</b> 个片源
              <span v-if="enhancing" class="enhancing">
                <span class="enh-frames"><i></i><i></i><i></i><i></i><i></i></span>
                核验中
              </span>
            </h2>
          </div>

          <!-- 有片源：卡片网格 -->
          <div class="card-grid" v-if="verified.length">
            <a v-for="(r, i) in verified" :key="r.id" class="card ok" :href="r.pageUrl || r.searchUrl || r.origin" target="_blank" rel="noopener noreferrer" :style="{ animationDelay: (i * 0.05) + 's' }">
              <div class="poster-wrap" :style="r.poster ? null : wellStyle(r.id)">
                <img v-if="r.poster" class="poster-img" :src="r.poster" :alt="r.title || r.name" loading="lazy" referrerpolicy="no-referrer" @error="onPosterErr(r)" />
                <div v-else class="site-fallback">
                  <div class="fb-pattern"></div>
                  <div class="fb-badge">
                    <img v-if="!r._noFavicon" class="fb-icon" :src="r.favicon || r._faviconUrl || getFavicon(r.origin)" alt="" @load="onFaviconLoad(r)" @error="onFaviconErr(r)" />
                    <span v-else class="fb-brand">
                      <span class="fb-brand-icon">🎬</span>
                      <span class="fb-brand-name">{{ r.name }}</span>
                    </span>
                  </div>
                  <div class="fb-name">{{ r.name }}</div>
                  <div class="fb-sub">资源站</div>
                </div>
                <span class="rank" :class="{ top: i < 3 }">{{ i + 1 }}</span>
                <span class="play-overlay">▶</span>
              </div>
              <div class="card-info">
                <h3 class="card-movie">{{ r.title || r.name }}</h3>
                <div class="card-meta">
                  <span class="meta-site">{{ r.name }}</span>
                  <span class="q-badge" :class="qualityClass(r.quality)">{{ r.quality || "未知" }}</span>
                </div>
                <div class="card-status">
                  <span class="st-tag" :class="r.loginCls">{{ r.loginLabel }}</span>
                  <span class="st-tag" :class="r.adsCls">{{ r.adsLabel }}</span>
                  <span class="st-tag" :class="r.speedCls">{{ r.speedLabel }}</span>
                </div>
              </div>
              <button class="hide-btn" @click.stop="hideSite(r.id)" title="我打不开这站，隐藏它" aria-label="隐藏该站">✕</button>
            </a>
          </div>

          <!-- 其余：去站内搜索 -->
          <div v-if="others.length" class="others">
            <button class="others-toggle" @click="showOthers = !showOthers">
              <span class="caret">{{ showOthers ? "▾" : "▸" }}</span>
              前往资源站搜索
              <span class="others-sub">{{ others.length }} 个站点</span>
            </button>
            <div class="card-grid" v-if="showOthers">
              <a v-for="(r, i) in others" :key="r.id" class="card neutral" :href="r.searchUrl || r.origin" target="_blank" rel="noopener noreferrer" :style="{ animationDelay: (i * 0.05) + 's' }">
                <div class="poster-wrap" :style="r.poster ? null : wellStyle(r.id)">
                  <img v-if="r.poster" class="poster-img" :src="r.poster" :alt="r.name" loading="lazy" referrerpolicy="no-referrer" @error="onPosterErr(r)" />
                  <div v-else class="site-fallback">
                    <div class="fb-pattern"></div>
                    <div class="fb-badge">
                      <img v-if="!r._noFavicon" class="fb-icon" :src="r.favicon || r._faviconUrl || getFavicon(r.origin)" alt="" @load="onFaviconLoad(r)" @error="onFaviconErr(r)" />
                      <span v-else class="fb-brand">
                        <span class="fb-brand-icon">🎬</span>
                        <span class="fb-brand-name">{{ r.name }}</span>
                      </span>
                    </div>
                    <div class="fb-name">{{ r.name }}</div>
                    <div class="fb-sub">资源站</div>
                  </div>
                  <span class="rank">{{ verified.length + i + 1 }}</span>
                  <span class="play-overlay">▶</span>
                </div>
                <div class="card-info">
                  <h3 class="card-movie">{{ r.name }}</h3>
                  <div class="card-meta">
                    <span class="meta-site">{{ r.name }}</span>
                    <span class="q-badge search-req">需要自行搜索</span>
                    <span v-if="enhancing && !r.verified" class="v-frames" title="正在核验"><i></i><i></i><i></i></span>
                  </div>
                  <div class="card-status">
                    <span class="st-tag" :class="r.loginCls">{{ r.loginLabel }}</span>
                    <span class="st-tag" :class="r.adsCls">{{ r.adsLabel }}</span>
                  </div>
                </div>
                <button class="hide-btn" @click.stop="hideSite(r.id)" title="我打不开这站，隐藏它" aria-label="隐藏该站">✕</button>
              </a>
            </div>
          </div>

          <!-- 用户手动隐藏的站点：恢复入口 -->
          <div v-if="hiddenList.length" class="hidden-area">
            <div class="hidden-head">已手动隐藏 {{ hiddenList.length }} 个站点（你被封 / 不想看到）</div>
            <div class="hidden-chips">
              <button v-for="r in hiddenList" :key="r.id" class="hidden-chip" @click="unhideSite(r.id)">+ {{ r.name }}</button>
              <button class="hidden-chip all" @click="unhideAll()">↺ 全部恢复</button>
            </div>
          </div>
        </template>

        <p v-else-if="searched && verified.length + others.length === 0" class="hint empty">
          暂无可用片源。当前所有站点均不可访问，可能是网络问题或站点集体维护，稍后再试。
        </p>

        <p v-else class="hint">输入片名，从 {{ SITES.length }} 个影视站聚合检索。全部站点即时可达，有片源的站点会优先展示。</p>
      </main>
      <footer class="foot">仅聚合跳转第三方影视站 · 本站不存储任何片源 · 请依法合规使用</footer>
    </div>
  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0a0c11;
  --bg2: #0e1118;
  --panel: #11151d;
  --panel2: #161b24;
  --well: #0b0e14;
  --line: #1e2430;
  --line2: #2a3340;
  --text: #eef1f6;
  --muted: #8b95a7;
  --faint: #5b6577;
  --accent: #f2c14e;        /* 影院金（主操作/聚焦/头名） */
  --accent2: #e0992f;
  --good: #46d18a;          /* 已确认·绿标（语义色） */
  --good-bg: #102a1f;
  --warn: #e6b455;          /* 需登录 / 风控 */
  --danger: #ff6b6b;
  --serif: "Songti SC", "Source Han Serif SC", "Noto Serif SC", Georgia, "Times New Roman", serif;
  --sans: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
}
html, body { background: var(--bg); color: var(--text); overflow-x: hidden; }
body { font-family: var(--sans); min-height: 100vh; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
.app { min-height: 100vh; display: flex; flex-direction: column; position: relative; }
.foot { text-align: center; color: var(--faint); font-size: 12px; margin-top: 48px; line-height: 1.9; padding: 0 16px; letter-spacing: .3px; }

/* 细颗粒胶片噪点，营造质感而非纯平 UI */
.grain {
  position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: .045; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* ===== 落地主页 ===== */
.home { flex: 1; display: flex; flex-direction: column; position: relative; overflow: hidden; }
.ambient { position: absolute; inset: -20%; z-index: 0; pointer-events: none; }
.orb { position: absolute; border-radius: 50%; filter: blur(70px); opacity: .5; will-change: transform; }
.orb-a { width: 460px; height: 460px; left: 8%; top: -6%; background: radial-gradient(circle, rgba(242,193,78,.32), transparent 65%); animation: drift1 22s ease-in-out infinite; }
.orb-b { width: 520px; height: 520px; right: 4%; top: 8%; background: radial-gradient(circle, rgba(70,209,138,.16), transparent 65%); animation: drift2 28s ease-in-out infinite; }
.orb-c { width: 420px; height: 420px; left: 36%; bottom: -14%; background: radial-gradient(circle, rgba(108,92,231,.18), transparent 65%); animation: drift3 26s ease-in-out infinite; }
@keyframes drift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px,30px) scale(1.08); } }
@keyframes drift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-50px,20px) scale(1.12); } }
@keyframes drift3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,-40px) scale(1.06); } }

.hero {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 56px 16px 28px; position: relative; z-index: 2;
}
.kicker { font-size: 12px; letter-spacing: 4px; color: var(--accent); opacity: .85; font-weight: 600; }
.title {
  font-family: var(--serif); font-size: 78px; line-height: 1.02; margin-top: 14px; font-weight: 700;
  letter-spacing: 6px; color: #f6f1e4;
  text-shadow: 0 2px 30px rgba(242,193,78,.25), 0 1px 0 rgba(255,255,255,.06);
}
.lede { margin-top: 16px; color: var(--text); font-size: 17px; opacity: .9; }
.lede b { color: var(--accent); font-weight: 700; }

.search {
  display: flex; align-items: center; gap: 8px; margin: 30px auto 14px; width: 100%; max-width: 580px;
  background: linear-gradient(180deg, rgba(22,27,36,.9), rgba(14,17,24,.92));
  border: 1px solid var(--line2); border-radius: 16px; padding: 7px 7px 7px 18px;
  box-shadow: 0 18px 50px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.04);
  transition: border-color .25s, box-shadow .25s;
}
.search:focus-within { border-color: var(--accent); box-shadow: 0 18px 50px rgba(0,0,0,.55), 0 0 0 3px rgba(242,193,78,.18); }
.s-glyph { font-size: 22px; color: var(--faint); line-height: 1; }
.search input {
  flex: 1; min-width: 0; padding: 14px 4px; border: 0; background: transparent; color: var(--text);
  font-size: 17px; outline: none; font-family: var(--sans);
}
.search input::placeholder { color: var(--faint); }
.search button {
  flex-shrink: 0; padding: 0 28px; height: 46px; border: 0; border-radius: 11px; cursor: pointer; font-size: 16px;
  background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #1a1205; font-weight: 700; letter-spacing: 2px;
  box-shadow: 0 8px 22px rgba(242,193,78,.3); transition: transform .15s, box-shadow .25s;
}
.search button:hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(242,193,78,.4); }
.search button:active { transform: translateY(0); }
.search button:disabled { opacity: .65; cursor: wait; }
.search.compact { max-width: none; margin: 0; padding: 5px 5px 5px 14px; border-radius: 13px; }
.search.compact .s-glyph { font-size: 18px; }
.search.compact input { padding: 10px 4px; font-size: 15px; }
.search.compact button { height: 38px; padding: 0 18px; font-size: 15px; letter-spacing: 1px; }

.hot { display: flex; gap: 9px; justify-content: center; align-items: center; flex-wrap: wrap; margin-top: 8px; }
.hot-label {
  color: var(--muted); font-size: 13px; letter-spacing: 2px;
  padding: 8px 18px; border-radius: 999px;
  border: 1px dashed var(--line2); background: rgba(255,255,255,.02);
}
.hot-label b { color: var(--warn); font-weight: 700; }
.chip {
  border: 1px solid var(--line2); background: rgba(255,255,255,.02); color: var(--muted); font-size: 13px;
  padding: 7px 15px; border-radius: 999px; cursor: pointer; transition: .2s; font-family: var(--sans);
}
.chip:hover { color: var(--accent); border-color: var(--accent); background: rgba(242,193,78,.08); transform: translateY(-1px); }

.features { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 44px auto 0; width: 100%; max-width: 760px; }
.feature {
  position: relative; background: linear-gradient(180deg, rgba(17,21,29,.7), rgba(11,14,20,.7));
  border: 1px solid var(--line); border-radius: 16px; padding: 20px 14px 16px;
  display: flex; flex-direction: column; align-items: center; gap: 5px; text-align: center; overflow: hidden;
  transition: transform .25s, border-color .25s, box-shadow .25s;
}
.feature::before { content: ""; position: absolute; inset: 0; background: radial-gradient(120px 80px at 50% 0%, rgba(242,193,78,.12), transparent 70%); opacity: 0; transition: opacity .25s; }
.feature:hover { transform: translateY(-3px); border-color: var(--line2); box-shadow: 0 16px 40px rgba(0,0,0,.45); }
.feature:hover::before { opacity: 1; }
.f-no { position: absolute; top: 10px; left: 12px; font-family: var(--serif); font-size: 13px; color: var(--faint); letter-spacing: 1px; }
.f-ico { font-size: 28px; margin-top: 6px; filter: drop-shadow(0 4px 12px rgba(0,0,0,.4)); }
.feature b { font-size: 14px; margin-top: 6px; font-weight: 700; }
.feature span:last-child { color: var(--muted); font-size: 12px; line-height: 1.5; }

/* ===== 结果页 ===== */
.results { flex: 1; display: flex; flex-direction: column; position: relative; z-index: 2; }
.topbar {
  display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 10;
  padding: 14px 16px; background: rgba(10,12,17,.82); backdrop-filter: blur(14px) saturate(1.2);
  border-bottom: 1px solid var(--line);
}
.back {
  flex-shrink: 0; width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line2);
  background: var(--panel); color: var(--text); font-size: 26px; line-height: 1; cursor: pointer; transition: .2s;
  display: grid; place-items: center;
}
.back:hover { border-color: var(--accent); color: var(--accent); }
.topbar .search { margin: 0; flex: 1; }

.content { flex: 1; width: 100%; max-width: 1600px; margin: 0 auto; padding: 18px 16px 0; }
.hint { color: var(--muted); text-align: center; padding: 34px 0; font-size: 14px; }
.hint.error { color: var(--danger); }

/* 加载：胶片帧逐格点亮 + 扫光进度 */
.loader { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 70px 0 48px; animation: fadeIn .35s ease both; }
.frames { display: flex; gap: 10px; }
.frames span {
  width: 22px; height: 30px; border-radius: 5px; background: var(--well); border: 1px solid var(--line2);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04); animation: frame 1.3s infinite ease-in-out;
}
.frames span:nth-child(1) { animation-delay: 0s; }
.frames span:nth-child(2) { animation-delay: .12s; }
.frames span:nth-child(3) { animation-delay: .24s; }
.frames span:nth-child(4) { animation-delay: .36s; }
.frames span:nth-child(5) { animation-delay: .48s; }
.frames span:nth-child(6) { animation-delay: .6s; }
@keyframes frame {
  0%, 100% { background: var(--well); border-color: var(--line2); transform: scaleY(.82); opacity: .5; }
  40% { background: linear-gradient(180deg, var(--accent), var(--accent2)); border-color: var(--accent); transform: scaleY(1); opacity: 1; box-shadow: 0 0 16px rgba(242,193,78,.45); }
}
.loader-txt { color: var(--muted); font-size: 14px; letter-spacing: .5px; }
.loader-txt b { color: var(--accent); }
.scan { position: relative; width: 240px; height: 3px; border-radius: 3px; background: var(--line); overflow: hidden; }
.scan i { position: absolute; inset: 0; width: 40%; border-radius: 3px; background: linear-gradient(90deg, transparent, var(--accent), transparent); animation: sweep 1.1s infinite ease-in-out; }
@keyframes sweep { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.result-head { display: flex; justify-content: space-between; align-items: baseline; margin: 6px 4px 16px; flex-wrap: wrap; gap: 6px; }
.result-head h2 { font-size: 19px; font-weight: 700; letter-spacing: .3px; }
.result-head h2 b { color: var(--accent); }
.enhancing { color: var(--accent); font-size: 13px; font-weight: 400; display: inline-flex; align-items: center; gap: 8px; margin-left: 4px; }
.enh-frames { display: inline-flex; gap: 2px; align-items: center; height: 12px; padding: 1px 3px; background: rgba(233,184,79,0.06); border: 1px solid rgba(233,184,79,0.12); border-radius: 4px; }
.enh-frames i { display: block; width: 3px; background: var(--well); border: 1px solid var(--line2); animation: frame 1.4s ease-in-out infinite; }
.enh-frames i:nth-child(1) { height: 5px; animation-delay: 0s; }
.enh-frames i:nth-child(2) { height: 8px; animation-delay: .12s; }
.enh-frames i:nth-child(3) { height: 12px; animation-delay: .24s; }
.enh-frames i:nth-child(4) { height: 8px; animation-delay: .36s; }
.enh-frames i:nth-child(5) { height: 5px; animation-delay: .48s; }
.result-sort { color: var(--faint); font-size: 12px; letter-spacing: 1px; }

/* 卡片网格：自适应填充，最大宽度限制防止超宽屏拉伸 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 14px;
  max-width: 1280px;
  margin-left: auto;
  margin-right: auto;
  margin-top: 4px;
}

/* 卡片：垂直布局，无边框，纯阴影 */
.card {
  display: flex;
  flex-direction: column;
  border: none;
  border-radius: 14px;
  background: var(--panel);
  box-shadow: 0 6px 20px rgba(0,0,0,0.3);
  overflow: hidden;
  text-decoration: none;
  color: var(--text);
  transition: transform 0.25s cubic-bezier(0.2,0.7,0.3,1), box-shadow 0.25s;
  animation: cardIn 0.5s cubic-bezier(0.2,0.7,0.3,1) both;
  position: relative;
  cursor: pointer;
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 36px rgba(0,0,0,0.5);
}
.card.ok { background: linear-gradient(180deg, #112019, #0c1511); }
.card.neutral { background: var(--bg2); }
@keyframes cardIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }

/* 海报：大尺寸，2:3 比例 */
.poster-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  background: var(--well);
  overflow: hidden;
  display: grid;
  place-items: center;
}
.poster-img { width: 100%; height: 100%; object-fit: cover; display: block; }

/* 站点图标回退卡片 */
.site-fallback {
  position: relative;
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px; padding: 16px;
  z-index: 1;
}
/* 装饰网格纹理背景 */
.fb-pattern {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 16px 16px;
  z-index: 0;
}
/* 图标徽章：圆形容器 + 渐变描边 + 光晕 */
.fb-badge {
  position: relative;
  width: 64px; height: 64px;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  border: 2px solid rgba(255,255,255,0.15);
  display: grid; place-items: center;
  overflow: hidden;
  box-shadow:
    0 0 0 3px rgba(0,0,0,0.2),
    0 8px 24px rgba(0,0,0,0.3),
    inset 0 1px 0 rgba(255,255,255,0.1);
}
.fb-badge::before {
  content: "";
  position: absolute; inset: -2px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, transparent 0%, rgba(255,255,255,0.1) 25%, transparent 50%);
  z-index: -1;
  animation: fbRotate 6s linear infinite;
}
@keyframes fbRotate { to { transform: rotate(360deg); } }
/* favicon 图片 */
.fb-icon {
  width: 42px; height: 42px;
  object-fit: contain;
  border-radius: 6px;
}
/* 品牌徽章（无 favicon 时的精致回退）—— 影视图标 + 站点名，不像失败态 */
.fb-brand {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.fb-brand-icon {
  font-size: 32px; line-height: 1;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
}
.fb-brand-name {
  font-size: 11px; font-weight: 700;
  color: rgba(255,255,255,0.85);
  letter-spacing: 0.3px;
  max-width: 60px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 站点名称 */
.fb-name {
  font-size: 13px; font-weight: 700;
  color: rgba(255,255,255,0.9);
  text-align: center;
  letter-spacing: 0.3px;
  max-width: 120px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 副标题标签 */
.fb-sub {
  font-size: 9px; font-weight: 600;
  color: rgba(255,255,255,0.4);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(0,0,0,0.15);
}
.rank {
  position: absolute; top: 6px; left: 6px;
  min-width: 22px; height: 22px; padding: 0 6px;
  display: grid; place-items: center; border-radius: 999px;
  background: rgba(0,0,0,0.6); color: var(--muted);
  font-size: 12px; font-weight: 700;
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
.rank.top { background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #1a1205; }

/* 播放覆盖层 */
.play-overlay {
  position: absolute; inset: 0;
  display: grid; place-items: center;
  background: rgba(0,0,0,0.4);
  opacity: 0; transition: opacity 0.2s;
  font-size: 36px; color: var(--accent);
  pointer-events: none;
}
.card:hover .play-overlay { opacity: 1; }

/* 卡片信息 */
.card-info { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
.card-movie {
  font-size: 14px; font-weight: 700; line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; text-overflow: ellipsis;
}
.card-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.meta-site { font-size: 12px; color: var(--muted); font-weight: 600; }
.card-status { margin-top: 3px; }

/* 徽章样式 */
.q-badge { font-size: 10px; padding: 2px 7px; border-radius: 999px; color: #1a1205; font-weight: 800; }
.q-badge.search-req { background: linear-gradient(135deg, #ff6b6b, #ee5a24); color: #fff; }
.q-4k { background: linear-gradient(135deg, #ffd76e, #e8862e); }
.q-bd { background: linear-gradient(135deg, #b18cff, #6c5ce7); color: #fff; }
.q-hd { background: linear-gradient(135deg, #4fd1c5, #2e9e8e); color: #06231d; }
.q-uhd { background: #39404f; color: #cfd6e2; }
.st-tag { font-size: 9px; padding: 2px 6px; border-radius: 999px; font-weight: 700; border: 1px solid transparent; letter-spacing: .3px; white-space: nowrap; }
.st-tag.st-good { background: var(--good-bg); color: var(--good); border-color: #1f4a36; }
.st-tag.st-muted { background: #241f17; color: #c9a86a; border-color: #423620; }
.st-tag.st-warn { background: #3a2a12; color: var(--warn); border-color: #5a431f; }
.st-tag.st-login-req { background: #3a1212; color: #ff6b6b; border-color: #5a2020; }
.st-tag.st-login-free { background: var(--good-bg); color: var(--good); border-color: #1f4a36; }
.st-tag.st-ads-possible { background: #3a2a12; color: var(--warn); border-color: #5a431f; }
.st-tag.st-ads-none { background: var(--good-bg); color: var(--good); border-color: #1f4a36; }
.st-tag.st-speed-fast { background: var(--good-bg); color: var(--good); border-color: #1f4a36; }
.st-tag.st-speed-normal { background: #3a2a12; color: var(--warn); border-color: #5a431f; }
.st-tag.st-speed-slow { background: #3a1212; color: #ff6b6b; border-color: #5a2020; }
.v-frames { display: inline-flex; gap: 2px; align-items: center; height: 12px; padding: 1px 3px; background: rgba(233,184,79,0.06); border: 1px solid rgba(233,184,79,0.12); border-radius: 4px; flex-shrink: 0; }
.v-frames i { display: block; width: 2px; background: var(--well); border: 1px solid var(--line2); animation: frame 1.4s ease-in-out infinite; }
.v-frames i:nth-child(1) { height: 4px; animation-delay: 0s; }
.v-frames i:nth-child(2) { height: 7px; animation-delay: .15s; }
.v-frames i:nth-child(3) { height: 4px; animation-delay: .3s; }

/* 隐藏按钮 */
.hide-btn {
  position: absolute; top: 6px; right: 6px;
  width: 24px; height: 24px; flex-shrink: 0;
  border: none; background: rgba(0,0,0,0.6);
  color: var(--faint); border-radius: 6px; cursor: pointer;
  font-size: 13px; line-height: 1; transition: .2s;
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  z-index: 2;
}
.hide-btn:hover { color: var(--danger); background: rgba(255,107,107,0.2); }

.others { margin-top: 18px; }
.others-toggle { width: 100%; text-align: left; cursor: pointer; background: linear-gradient(180deg, rgba(17,21,29,.6), rgba(11,14,20,.6));
  border: 1px dashed var(--line2); color: var(--text); border-radius: 13px; padding: 13px 16px; font-size: 14px; font-weight: 600;
  display: flex; align-items: center; gap: 10px; transition: .2s; }
.others-toggle:hover { border-color: var(--accent); }
.others-toggle .caret { color: var(--accent); font-size: 12px; }
.others-sub { margin-left: auto; color: var(--faint); font-size: 12px; font-weight: 400; }

.hidden-area { margin-top: 18px; padding: 14px 16px; background: linear-gradient(180deg, rgba(17,21,29,.6), rgba(11,14,20,.6)); border: 1px dashed var(--line2); border-radius: 13px; }
.hidden-head { color: var(--muted); font-size: 13px; margin-bottom: 10px; }
.hidden-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.hidden-chip { border: 1px solid var(--line2); background: transparent; color: var(--muted); font-size: 12px; padding: 6px 11px; border-radius: 999px; cursor: pointer; transition: .2s; }
.hidden-chip:hover { color: var(--accent); border-color: var(--accent); }
.hidden-chip.all { color: var(--accent); border-color: var(--accent); }

.hint.empty { color: #ffb3b3; }

@media (max-width: 620px) {
  .title { font-size: 52px; letter-spacing: 3px; }
  .features { grid-template-columns: repeat(2, 1fr); }
  .search button { padding: 0 20px; }
  .card-grid { grid-template-columns: repeat(auto-fill, minmax(125px, 1fr)); gap: 10px; max-width: none; }
  .card-info { padding: 8px 10px 10px; }
  .card-movie { font-size: 13px; }
}
@media (max-width: 400px) {
  .card-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .orb, .frames span, .scan i, .v-frames i, .enh-frames i { animation: none !important; }
  .card { animation: none !important; }
}
</style>
