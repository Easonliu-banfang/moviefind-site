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

const demoHits = ["狂飙", "流浪地球2", "三体", "孤注一掷", "繁花", "年会不能停"];

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
    // 广告/登录状态标签（人工实测标注）
    statusLabel: site.login === true ? "需登录"
      : site.ads === true ? "可能含广告"
      : "无广告·免登录",
    statusCls: site.login === true ? "st-warn" : site.ads === true ? "st-muted" : "st-good",
    origin: site.origin,
    searchUrl: buildSearchUrl(site, q),
    verified: false,
    needsCaptcha: !!site.captcha,
    dead: false,
    browserDead: false,           // 浏览器侧（用户自己的网络）连不上 → 自动隐藏
    pageUrl: null,
    title: null,
    poster: null,             // 电影封面（Worker 实测抓到的海报 URL；无则为 null → 回退 monogram 井）
    latency_ms: 0,
  };
}

// 综合排序分（优先级：无广告 > 速度 > 清晰度 > 无人机验证 > 能用站 > 纯无确认片源）
// 各档权重严格递减，确保高优先级档无论如何盖过低优先级档。
function rankScore(r) {
  const noAds = r.ads === false ? 1_000_000 : 0;                            // 无广告：最高优先级
  const speed = r.latency_ms > 0 ? Math.max(0, 100000 - r.latency_ms) : 0;   // 速度：仅已测延迟参与，越快越高
  const quality = (r.qualityScore || 0) * 200;                              // 清晰度
  const noCaptcha = r.needsCaptcha ? 0 : 100;                               // 无人机验证 优先
  const usable = r.login === true ? 50 : 0;                                 // 需登录但能用的站，排在纯无确认片源之前
  return noAds + speed + quality + noCaptcha + usable;
}

// 可见性：排除 服务端死站(dead) / 浏览器侧连不上(browserDead) / 用户手动隐藏(hidden)
function isVisible(r) {
  return !r.dead && !r.browserDead && !hiddenIds.value.has(r.id);
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
async function enhanceWithWorker(q) {
  enhancing.value = true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(`${WORKER_BASE}/api/search?q=${encodeURIComponent(q)}&max=40`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return;
    const d = await r.json();
    if (!d.ok) return;
    const map = new Map((d.results || []).map((x) => [x.id, x]));
    for (const card of results.value) {
      const w = map.get(card.id);
      if (w) {
        card.verified = !!w.verified;
        card.needsCaptcha = !!w.needsCaptcha;
        card.dead = !!w.dead; // 真·不可达（连接失败/DNS/5xx）→ 自动隐藏
        card.realQuality = !!w.realQuality; // Worker 实测到的画质 vs 站点标称
        card.quality = w.quality || card.quality;
        card.qualityScore = w.qualityScore || card.qualityScore;
        card.pageUrl = w.pageUrl || null;
        card.title = w.title || null;
        card.poster = w.poster || null;   // Worker 实测封面；没有则保持 null（显示 monogram 井）
        card.latency_ms = w.latency_ms || 0;
      }
    }
  } catch {
    /* Worker 超时/失败：本地卡片照常可用，忽略 */
  } finally {
    enhancing.value = false;
  }
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
function demo(h) { kw.value = h; doSearch(); }
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
        <h1 class="title">聚合追剧</h1>
        <p class="lede">一个关键词，横扫 <b>{{ SITES.length }}</b> 个影视站点</p>

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
          <span class="hot-label">热门</span>
          <button v-for="h in demoHits" :key="h" class="chip" @click="demo(h)">{{ h }}</button>
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
              <b>{{ verified.length }}</b> 个已确认有片源 · 共 <b>{{ verified.length + others.length }}</b> 个站点可达
              <span v-if="enhancing" class="enhancing">· 核验中</span>
            </h2>
            <span class="result-sort">无广告 · 速度快 · 清晰度高 优先</span>
          </div>

          <!-- 已确认有片源 -->
          <ol class="result-list" v-if="verified.length">
            <li v-for="(r, i) in verified" :key="r.id" class="card ok" :style="{ animationDelay: (i * 0.04) + 's' }">
              <div class="poster" :style="r.poster ? null : wellStyle(r.id)">
                <img v-if="r.poster" class="poster-img" :src="r.poster" :alt="r.name" loading="lazy" referrerpolicy="no-referrer" @error="r.poster = null" />
                <span v-else class="well-char">{{ monogram(r.name) }}</span>
                <span class="rank" :class="{ top: i < 3 }">{{ i + 1 }}</span>
              </div>
              <div class="card-body">
                <div class="card-top">
                  <span class="site-name">{{ r.name }}</span>
                  <span class="q-badge" :class="qualityClass(r.quality)">{{ r.quality || "未知" }}</span>
                  <span class="q-tag" :class="{ nominal: !r.realQuality }" :title="r.realQuality ? 'Worker 实测画质' : '站点标称画质，仅供参考'">{{ r.realQuality ? '实测' : '标称' }}</span>
                  <span class="st-tag" :class="r.statusCls">{{ r.statusLabel }}</span>
                  <span class="ok-badge">✓ 已确认</span>
                  <span class="latency" :class="{ fast: r.latency_ms < 1500 }">⚡ {{ r.latency_ms }}ms</span>
                  <button class="hide-btn" @click="hideSite(r.id)" title="我打不开这站，隐藏它" aria-label="隐藏该站">✕</button>
                </div>
                <div v-if="r.title" class="card-title">匹配：{{ r.title }}</div>
                <p class="card-tip" v-else>该站已确认有片源 · 可直接播放或搜该片</p>
              </div>
              <div class="card-actions">
                <a v-if="r.pageUrl && r.pageUrl !== r.searchUrl" class="go" :href="r.pageUrl" target="_blank" rel="noopener noreferrer">立即播放</a>
                <a class="go ghost" :href="r.searchUrl || r.origin" target="_blank" rel="noopener noreferrer">搜该片 ↗</a>
              </div>
            </li>
          </ol>

          <!-- 其余：去站内搜索（默认展开） -->
          <div v-if="others.length" class="others">
            <button class="others-toggle" @click="showOthers = !showOthers">
              <span class="caret">{{ showOthers ? "▾" : "▸" }}</span>
              其余 {{ others.length }} 个站点
              <span class="others-sub">点击去站内搜索</span>
            </button>
            <ol class="result-list" v-if="showOthers">
              <li v-for="(r, i) in others" :key="r.id" class="card neutral" :class="{ locked: r.needsCaptcha }" :style="{ animationDelay: (verified.length * 0.04 + i * 0.03) + 's' }">
                <div class="poster" :style="r.poster ? null : wellStyle(r.id)">
                  <img v-if="r.poster" class="poster-img" :src="r.poster" :alt="r.name" loading="lazy" referrerpolicy="no-referrer" @error="r.poster = null" />
                  <span v-else class="well-char">{{ monogram(r.name) }}</span>
                  <span class="rank">{{ verified.length + i + 1 }}</span>
                </div>
                <div class="card-body">
                  <div class="card-top">
                    <span class="site-name">{{ r.name }}</span>
                    <span class="q-badge" :class="qualityClass(r.quality)">{{ r.quality || "未知" }}</span>
                    <span class="q-tag nominal" title="站点标称画质，仅供参考">标称</span>
                    <span class="st-tag" :class="r.statusCls">{{ r.statusLabel }}</span>
                    <span v-if="r.needsCaptcha" class="cap-badge">🔒 需验证</span>
                    <span v-else class="web-badge">🌐 站内搜</span>
                    <span v-if="enhancing && !r.verified" class="v-spin" title="正在核验该站是否有片源"></span>
                    <button class="hide-btn" @click="hideSite(r.id)" title="我打不开这站，隐藏它" aria-label="隐藏该站">✕</button>
                  </div>
                  <p class="card-tip" v-if="r.needsCaptcha">该站有人机验证 / 风控，跳转后请先通过再搜该片</p>
                  <p class="card-tip" v-else>点「搜该片」直达该站已搜《{{ kw }}》的结果页，打开即能播放</p>
                </div>
                <div class="card-actions">
                  <a class="go" :href="r.searchUrl || r.origin" target="_blank" rel="noopener noreferrer">搜该片 ↗</a>
                </div>
              </li>
            </ol>
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

        <p v-else class="hint">输入片名，从 {{ SITES.length }} 个影视站聚合检索。全部站点即时可达，已验证有片源的站点会优先展示。</p>
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
.hot-label { color: var(--faint); font-size: 13px; letter-spacing: 2px; }
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

.content { flex: 1; width: 100%; max-width: 820px; margin: 0 auto; padding: 18px 16px 0; }
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
.enhancing { color: var(--accent); font-size: 13px; font-weight: 400; display: inline-flex; align-items: center; gap: 6px; margin-left: 4px; }
.enhancing::before { content: ""; width: 11px; height: 11px; border: 2px solid var(--line2); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.result-sort { color: var(--faint); font-size: 12px; letter-spacing: 1px; }

.result-list { list-style: none; display: flex; flex-direction: column; gap: 11px; }
.card {
  display: flex; align-items: center; gap: 14px; padding: 13px 15px;
  background: linear-gradient(180deg, var(--panel), var(--bg2));
  border: 1px solid var(--line); border-radius: 15px;
  box-shadow: 0 8px 24px rgba(0,0,0,.32);
  transition: transform .22s cubic-bezier(.2,.7,.3,1), border-color .22s, box-shadow .22s;
  animation: cardIn .5s cubic-bezier(.2,.7,.3,1) both;
  position: relative; overflow: hidden;
}
.card::after { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: transparent; transition: background .22s; }
.card:hover { transform: translateY(-2px); border-color: var(--line2); box-shadow: 0 16px 40px rgba(0,0,0,.45); }
.card:hover::after { background: linear-gradient(180deg, var(--accent), var(--accent2)); }
.card.ok { background: linear-gradient(180deg, #112019, #0c1511); border-color: #1d3a2b; }
.card.ok::after { background: linear-gradient(180deg, var(--good), #2c9c6a); }
.card.ok:hover { border-color: #2c5a42; }
.card.locked { background: linear-gradient(180deg, #1a1610, #110d08); border-color: #4a3a1c; }
.card.neutral { opacity: .94; }
.card.neutral:hover { opacity: 1; }
@keyframes cardIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }

/* 海报：2:3 大图封面；有图显示封面，无图回退到站名首字 monogram 井 + 排名角标 */
.poster {
  position: relative; width: 64px; height: 92px; border-radius: 11px; flex-shrink: 0;
  display: grid; place-items: center; overflow: hidden; background: var(--well);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 4px 14px rgba(0,0,0,.4);
}
.poster-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.well-char { font-family: var(--serif); font-size: 26px; font-weight: 700; line-height: 1; }
.poster .rank {
  position: absolute; top: -5px; left: -5px; min-width: 19px; height: 19px; padding: 0 4px;
  display: grid; place-items: center; border-radius: 999px; background: var(--panel2); color: var(--muted);
  font-size: 11px; font-weight: 700; border: 1px solid var(--line2);
}
.poster .rank.top { background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #1a1205; border-color: transparent; }

.card-body { flex: 1; min-width: 0; }
.card-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.site-name { font-weight: 700; font-size: 16px; }
.q-badge { font-size: 11px; padding: 2px 9px; border-radius: 999px; color: #1a1205; font-weight: 800; }
.q-4k { background: linear-gradient(135deg, #ffd76e, #e8862e); }
.q-bd { background: linear-gradient(135deg, #b18cff, #6c5ce7); color: #fff; }
.q-hd { background: linear-gradient(135deg, #4fd1c5, #2e9e8e); color: #06231d; }
.q-uhd { background: #39404f; color: #cfd6e2; }
.q-tag { font-size: 10px; padding: 2px 7px; border-radius: 999px; background: var(--good-bg); color: var(--good); font-weight: 700; border: 1px solid #1f4a36; letter-spacing: .5px; }
.q-tag.nominal { background: var(--well); color: var(--muted); border-color: var(--line2); }
.ok-badge { font-size: 11px; padding: 3px 10px; border-radius: 999px; background: var(--good-bg); color: var(--good); font-weight: 800; border: 1px solid #1f4a36; }
.cap-badge { font-size: 11px; padding: 3px 10px; border-radius: 999px; background: #3a2a12; color: var(--warn); font-weight: 700; border: 1px solid #5a431f; }
.web-badge { font-size: 11px; padding: 3px 10px; border-radius: 999px; background: var(--well); color: var(--muted); font-weight: 700; border: 1px solid var(--line2); }
.st-tag { font-size: 10px; padding: 2px 8px; border-radius: 999px; font-weight: 700; border: 1px solid transparent; letter-spacing: .3px; }
.st-tag.st-good { background: var(--good-bg); color: var(--good); border-color: #1f4a36; }
.st-tag.st-muted { background: #241f17; color: #c9a86a; border-color: #423620; }
.st-tag.st-warn { background: #3a2a12; color: var(--warn); border-color: #5a431f; }
.latency { color: var(--muted); font-size: 12px; }
.latency.fast { color: var(--good); }
.card-title { margin-top: 5px; color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-tip { margin-top: 5px; color: var(--muted); font-size: 13px; }
.hide-btn { margin-left: auto; width: 26px; height: 26px; flex-shrink: 0; border: 1px solid var(--line2); background: transparent; color: var(--faint); border-radius: 8px; cursor: pointer; font-size: 13px; line-height: 1; transition: .2s; }
.hide-btn:hover { color: var(--danger); border-color: var(--danger); background: rgba(255,107,107,.08); }
.v-spin { width: 14px; height: 14px; border: 2px solid var(--line2); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }
.card-actions { display: flex; flex-direction: column; gap: 7px; align-items: stretch; flex-shrink: 0; }
.go { padding: 9px 15px; border-radius: 11px; background: var(--panel2);
  font-size: 13px; color: var(--text); border: 1px solid var(--line2); font-weight: 700; transition: .2s; white-space: nowrap; text-align: center; }
.go:hover { background: var(--accent); border-color: var(--accent); color: #1a1205; }
.go.ghost { background: transparent; border: 1px solid var(--line2); color: var(--muted); font-weight: 600; }
.go.ghost:hover { color: var(--accent); border-color: var(--accent); background: transparent; }

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
  .card { flex-wrap: wrap; }
  .poster { width: 54px; height: 78px; }
  .card-actions { flex-direction: row; width: 100%; margin-top: 4px; }
  .card-actions .go { flex: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .orb, .frames span, .scan i, .v-spin, .enhancing::before { animation: none !important; }
  .card { animation: none !important; }
}
</style>
