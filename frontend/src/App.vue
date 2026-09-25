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
    <!-- ============ 落地主页 ============ -->
    <div v-if="view === 'home'" class="home">
      <section class="hero">
        <div class="logo">🎬</div>
        <h1>聚合追剧</h1>
        <p class="tag">一个关键词，横扫 <b>{{ SITES.length }}</b> 个影视站</p>
        <p class="sub">画质最高 · 无广告 · 免登录 的站自动排最前</p>

        <form class="search" @submit.prevent="doSearch">
          <input
            v-model="kw"
            @keyup="onKey"
            placeholder="输入片名 / 剧名 / 演员…"
            maxlength="30"
            autofocus
          />
          <button type="submit" :disabled="loading">{{ loading ? "搜索中…" : "搜索" }}</button>
        </form>

        <div class="hot">
          <span class="hot-label">热门</span>
          <button v-for="h in demoHits" :key="h" class="chip" @click="demo(h)">{{ h }}</button>
        </div>

        <div class="features">
          <div class="feature">
            <div class="f-ico">🏆</div>
            <b>画质优先</b>
            <span>4K / 蓝光 自动置顶</span>
          </div>
          <div class="feature">
            <div class="f-ico">🚫</div>
            <b>无广告优先</b>
            <span>免登录站靠前</span>
          </div>
          <div class="feature">
            <div class="f-ico">✅</div>
            <b>实时核验</b>
            <span>确认有片源才绿标</span>
          </div>
          <div class="feature">
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
        <button class="back" @click="goHome" title="返回首页">‹</button>
        <form class="search compact" @submit.prevent="doSearch">
          <input v-model="kw" @keyup="onKey" placeholder="搜索片名 / 剧名…" maxlength="30" />
          <button type="submit">搜</button>
        </form>
      </header>

      <main class="content">
        <div v-if="loading" class="search-anim">
          <div class="dots"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="txt">正在从 <b>{{ SITES.length }}</b> 个影视站检索《{{ kw }}》…</div>
        </div>
        <p v-else-if="error" class="hint error">{{ error }}</p>

        <template v-else-if="searched && results.length">
          <div class="result-head">
            <h2>
              <b>{{ verified.length }}</b> 个已确认有片源 · 共 <b>{{ verified.length + others.length }}</b> 个站点可达
              <span v-if="enhancing" class="enhancing">· 核验中…</span>
            </h2>
            <span class="result-sort">无广告 · 速度快 · 清晰度高 优先</span>
          </div>

          <!-- 已确认有片源 -->
          <ol class="result-list" v-if="verified.length">
            <li v-for="(r, i) in verified" :key="r.id" class="card ok">
              <div class="rank" :class="{ top: i < 3 }">{{ i + 1 }}</div>
              <div class="card-body">
                <div class="card-top">
                  <span class="site-name">{{ r.name }}</span>
                  <span class="q-badge" :class="qualityClass(r.quality)">{{ r.quality || "未知" }}</span>
                  <span class="q-tag" :class="{ nominal: !r.realQuality }" :title="r.realQuality ? 'Worker 实测画质' : '站点标称画质，仅供参考'">{{ r.realQuality ? '实测' : '标称' }}</span>
                  <span class="st-tag" :class="r.statusCls">{{ r.statusLabel }}</span>
                  <span class="ok-badge">✅ 已确认</span>
                  <span class="latency" :class="{ fast: r.latency_ms < 1500 }">⚡ {{ r.latency_ms }}ms</span>
                  <button class="hide-btn" @click="hideSite(r.id)" title="我打不开这站，隐藏它">✕</button>
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
              {{ showOthers ? "▾" : "▸" }} 其余 {{ others.length }} 个站点（点击去站内搜索）
            </button>
            <ol class="result-list" v-if="showOthers">
              <li v-for="(r, i) in others" :key="r.id" class="card neutral" :class="{ locked: r.needsCaptcha }">
                <div class="rank">{{ verified.length + i + 1 }}</div>
                <div class="card-body">
                  <div class="card-top">
                    <span class="site-name">{{ r.name }}</span>
                    <span class="q-badge" :class="qualityClass(r.quality)">{{ r.quality || "未知" }}</span>
                    <span class="q-tag nominal" title="站点标称画质，仅供参考">标称</span>
                    <span class="st-tag" :class="r.statusCls">{{ r.statusLabel }}</span>
                  <span v-if="r.needsCaptcha" class="cap-badge">🔒 去站里搜</span>
                  <span v-else class="web-badge">🌐 去站里搜</span>
                  <span v-if="enhancing && !r.verified" class="v-spin" title="正在核验该站是否有片源"></span>
                  <button class="hide-btn" @click="hideSite(r.id)" title="我打不开这站，隐藏它">✕</button>
                  </div>
                  <p class="card-tip" v-if="r.needsCaptcha">该站有人机验证/风控，跳转后请先通过再搜该片</p>
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
          🙅 暂无可用片源。当前所有站点均不可访问，可能是网络问题或站点集体维护，稍后再试。
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
  --bg: #0c0e14; --panel: #151922; --panel2: #1d2330; --text: #e8ecf3;
  --muted: #8b94a7; --accent: #e6b455; --danger: #ff6b6b;
}
html, body { background: var(--bg); color: var(--text); overflow-x: hidden; }
body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; min-height: 100vh; }
a { color: inherit; text-decoration: none; }
.app { min-height: 100vh; display: flex; flex-direction: column; }
.foot { text-align: center; color: #50586a; font-size: 12px; margin-top: 40px; line-height: 1.8; padding: 0 16px; }

/* ===== 落地主页 ===== */
.home { flex: 1; display: flex; flex-direction: column; }
.hero {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 40px 16px 24px;
  background:
    radial-gradient(900px 460px at 50% -10%, rgba(230,180,85,0.16), transparent 60%),
    radial-gradient(700px 420px at 80% 10%, rgba(108,92,231,0.12), transparent 60%);
}
.logo { font-size: 64px; line-height: 1; margin-bottom: 14px; filter: drop-shadow(0 6px 20px rgba(230,180,85,0.35)); }
.hero h1 { font-size: 40px; letter-spacing: 4px; background: linear-gradient(135deg, #ffe2a0, #e8862e); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hero .tag { margin-top: 12px; color: var(--text); font-size: 17px; }
.hero .tag b { color: var(--accent); }
.hero .sub { margin-top: 6px; color: var(--muted); font-size: 14px; }

.search {
  display: flex; gap: 10px; margin: 28px auto 16px; width: 100%; max-width: 560px;
}
.search input {
  flex: 1; min-width: 0; padding: 15px 18px; border-radius: 14px; border: 1px solid #2a2f3d;
  background: var(--panel); color: var(--text); font-size: 17px; outline: none;
  box-shadow: 0 8px 30px rgba(0,0,0,0.25);
}
.search input:focus { border-color: var(--accent); }
.search button {
  flex-shrink: 0; padding: 0 26px; border: 0; border-radius: 14px; cursor: pointer; font-size: 17px;
  background: linear-gradient(135deg, #e6b455, #e8862e); color: #1a1205; font-weight: 700;
  box-shadow: 0 8px 24px rgba(232,134,46,0.35);
}
.search button:disabled { opacity: .6; cursor: wait; }
.search.compact { max-width: none; margin: 0; }
.search.compact input { padding: 11px 14px; font-size: 15px; border-radius: 11px; }

.hot { display: flex; gap: 8px; justify-content: center; align-items: center; flex-wrap: wrap; margin-top: 6px; }
.hot-label { color: var(--muted); font-size: 13px; }
.chip {
  border: 1px solid #2a2f3d; background: transparent; color: var(--muted); font-size: 13px;
  padding: 6px 14px; border-radius: 999px; cursor: pointer; transition: .2s;
}
.chip:hover { color: var(--accent); border-color: var(--accent); }

.features { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 36px auto 0; width: 100%; max-width: 720px; }
.feature {
  background: var(--panel); border: 1px solid #232836; border-radius: 16px; padding: 16px 12px;
  display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;
}
.f-ico { font-size: 26px; }
.feature b { font-size: 14px; margin-top: 4px; }
.feature span { color: var(--muted); font-size: 12px; line-height: 1.5; }

/* ===== 结果页 ===== */
.results { flex: 1; display: flex; flex-direction: column; }
.topbar {
  display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 10;
  padding: 14px 16px; background: rgba(12,14,20,0.85); backdrop-filter: blur(10px);
  border-bottom: 1px solid #1d2330;
}
.back {
  flex-shrink: 0; width: 38px; height: 38px; border-radius: 11px; border: 1px solid #2a2f3d;
  background: var(--panel); color: var(--text); font-size: 24px; line-height: 1; cursor: pointer;
}
.back:hover { border-color: var(--accent); color: var(--accent); }
.topbar .search { margin: 0; flex: 1; }

.content { flex: 1; width: 100%; max-width: 760px; margin: 0 auto; padding: 16px 16px 0; }
.hint { color: var(--muted); text-align: center; padding: 30px 0; font-size: 14px; }
.hint.error { color: var(--danger); }

/* 搜索加载动画 */
.search-anim { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 64px 0 40px; animation: fadeIn .3s ease both; }
.search-anim .dots { display: flex; gap: 9px; }
.search-anim .dots i { width: 11px; height: 11px; border-radius: 50%; background: linear-gradient(135deg, #ffe2a0, #e8862e); display: block; animation: bounce 1.2s infinite ease-in-out; }
.search-anim .dots i:nth-child(2) { animation-delay: .12s; }
.search-anim .dots i:nth-child(3) { animation-delay: .24s; }
.search-anim .dots i:nth-child(4) { animation-delay: .36s; }
.search-anim .dots i:nth-child(5) { animation-delay: .48s; }
.search-anim .txt { color: var(--muted); font-size: 14px; letter-spacing: .5px; }
.search-anim .txt b { color: var(--accent); }
@keyframes bounce { 0%, 80%, 100% { transform: scale(.35); opacity: .35; } 40% { transform: scale(1); opacity: 1; } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.result-head { display: flex; justify-content: space-between; align-items: baseline; margin: 8px 4px 14px; flex-wrap: wrap; gap: 6px; }
.result-head h2 { font-size: 18px; }
.result-head h2 b { color: var(--accent); }
.enhancing { color: var(--accent); font-size: 13px; font-weight: 400; display: inline-flex; align-items: center; gap: 6px; }
.enhancing::before { content: ""; width: 11px; height: 11px; border: 2px solid #2f3646; border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.result-sort { color: var(--muted); font-size: 12px; }

.result-list { list-style: none; display: flex; flex-direction: column; gap: 10px; animation: listIn .45s cubic-bezier(.2,.7,.3,1) both; }
.others { animation: listIn .45s cubic-bezier(.2,.7,.3,1) both; }
@keyframes listIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.card {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  background: var(--panel); border: 1px solid #232836; border-radius: 14px; transition: .2s;
}
.card:hover { border-color: var(--accent); transform: translateY(-1px); }
.card.ok { border-color: #1f3d2e; background: #131c17; }
.card.locked { border-color: #5a431f; background: #1b1710; }
.card.neutral { opacity: .92; }
.card.neutral:hover { opacity: 1; }

.ok-badge { font-size: 12px; padding: 2px 9px; border-radius: 999px; background: #16331f; color: #55e6a3; font-weight: 700; border: 1px solid #245c38; }
.cap-badge { font-size: 12px; padding: 2px 9px; border-radius: 999px; background: #3a2a12; color: #e6b455; font-weight: 700; border: 1px solid #5a431f; }
.web-badge { font-size: 12px; padding: 2px 9px; border-radius: 999px; background: #232836; color: var(--muted); font-weight: 700; border: 1px solid #2f3646; }

.rank { width: 30px; height: 30px; flex-shrink: 0; display: grid; place-items: center;
  border-radius: 9px; background: var(--panel2); color: var(--muted); font-weight: 700; }
.rank.top { background: linear-gradient(135deg, var(--accent), #e8862e); color: #1a1205; }
.card-body { flex: 1; min-width: 0; }
.card-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.site-name { font-weight: 700; font-size: 16px; }
.q-badge { font-size: 12px; padding: 2px 9px; border-radius: 999px; color: #fff; font-weight: 700; }
.q-4k { background: linear-gradient(135deg, #ffd76e, #e8862e); }
.q-bd { background: linear-gradient(135deg, #b18cff, #6c5ce7); }
.q-hd { background: linear-gradient(135deg, #4fd1c5, #2e9e8e); }
.q-uhd { background: #39404f; }
.q-tag { font-size: 11px; padding: 2px 7px; border-radius: 999px; background: #16331f; color: #55e6a3; font-weight: 700; border: 1px solid #245c38; }
.q-tag.nominal { background: #232836; color: var(--muted); border-color: #2f3646; }
.hide-btn { margin-left: auto; width: 24px; height: 24px; flex-shrink: 0; border: 1px solid #2f3646; background: transparent; color: var(--muted); border-radius: 7px; cursor: pointer; font-size: 13px; line-height: 1; transition: .2s; }
.hide-btn:hover { color: var(--danger); border-color: var(--danger); }
.v-spin { width: 13px; height: 13px; border: 2px solid #2f3646; border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }
.st-tag { font-size: 11px; padding: 2px 7px; border-radius: 999px; font-weight: 700; border: 1px solid transparent; }
.st-tag.st-good { background: #16331f; color: #55e6a3; border-color: #245c38; }
.st-tag.st-muted { background: #2a2620; color: #c9a86a; border-color: #4a3d28; }
.st-tag.st-warn { background: #3a2a12; color: #e6b455; border-color: #5a431f; }
.latency { color: var(--muted); font-size: 12px; }
.latency.fast { color: #55e6a3; }
.card-title { margin-top: 4px; color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-tip { margin-top: 4px; color: var(--muted); font-size: 13px; }
.go { flex-shrink: 0; padding: 8px 14px; border-radius: 10px; background: var(--panel2);
  font-size: 13px; color: var(--text); border: 1px solid #2f3646; font-weight: 600; transition: .2s; white-space: nowrap; }
.go:hover { background: var(--accent); border-color: var(--accent); color: #1a1205; }
.card-actions { display: flex; flex-direction: column; gap: 6px; align-items: stretch; flex-shrink: 0; }
.go.ghost { background: transparent; border: 1px solid #2f3646; color: var(--muted); font-weight: 500; }
.go.ghost:hover { color: var(--accent); border-color: var(--accent); background: transparent; }

.others { margin-top: 16px; }
.others-toggle { width: 100%; text-align: left; cursor: pointer; background: transparent;
  border: 1px dashed #2f3646; color: var(--text); border-radius: 12px; padding: 12px 14px; font-size: 14px; font-weight: 600; }

.hidden-area { margin-top: 16px; padding: 12px 14px; background: var(--panel); border: 1px dashed #2f3646; border-radius: 12px; }
.hidden-head { color: var(--muted); font-size: 13px; margin-bottom: 8px; }
.hidden-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.hidden-chip { border: 1px solid #2f3646; background: transparent; color: var(--muted); font-size: 12px; padding: 5px 10px; border-radius: 999px; cursor: pointer; transition: .2s; }
.hidden-chip:hover { color: var(--accent); border-color: var(--accent); }
.hidden-chip.all { color: var(--accent); border-color: var(--accent); }

.hint.empty { color: #ffb3b3; }

@media (max-width: 560px) {
  .features { grid-template-columns: repeat(2, 1fr); }
  .hero h1 { font-size: 32px; }
}
</style>
