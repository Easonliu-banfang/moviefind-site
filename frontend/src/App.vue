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
const showOthers = ref(true); // 其余站点默认展开，证明全部可达

const demoHits = ["狂飙", "流浪地球2", "三体", "孤注一掷", "繁花"];

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
    origin: site.origin,
    searchUrl: buildSearchUrl(site, q),
    verified: false,
    needsCaptcha: !!site.captcha,
    pageUrl: null,
    title: null,
    latency_ms: 0,
  };
}

// 已确认有片源（Worker 真的从站点抓到结果且无人机验证）→ 主按钮「立即播放」+ 次「搜该片」
const verified = computed(() =>
  results.value.filter((r) => r.verified && !r.needsCaptcha).sort((a, b) => a.latency_ms - b.latency_ms)
);
// 其余：被风控拦截 / SPA 站点 / 超时 —— 仍给出跳转，由用户浏览器去站内搜
const others = computed(() =>
  results.value
    .filter((r) => !(r.verified && !r.needsCaptcha))
    .sort((a, b) => (b.qualityScore - a.qualityScore) || a.name.localeCompare(b.name, "zh"))
);

// 非阻塞：Worker 可选核验，把已确认站点升级为 ✅ 立即播放
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

async function doSearch() {
  const q = kw.value.trim();
  if (!q || loading.value) return;
  loading.value = true; error.value = ""; searched.value = true;
  showOthers.value = true;
  // 本地即时渲染全部站点（不等待 Worker）
  results.value = SITES.map((s) => makeCard(s, q));
  loading.value = false;
  // 后台可选核验
  enhanceWithWorker(q);
}
function onKey(e) { if (e.key === "Enter") doSearch(); }
function demo(h) { kw.value = h; doSearch(); }
</script>

<template>
  <div class="shell">
    <header class="hero">
      <div class="logo">🎬</div>
      <h1>聚合追剧</h1>
      <p class="sub">一个关键词 · 横扫 <b>{{ SITES.length }}</b> 个影视站 · 全部站点即时可达，已确认有片源优先</p>

      <div class="searchbar">
        <input
          v-model="kw"
          @keyup="onKey"
          placeholder="输入片名 / 剧名 / 演员…"
          maxlength="30"
        />
        <button :disabled="loading" @click="doSearch">{{ loading ? "搜索中…" : "搜索" }}</button>
      </div>

      <div class="hot">
        <span class="hot-tag">热门</span>
        <button v-for="h in demoHits" :key="h" @click="demo(h)" class="chip">{{ h }}</button>
      </div>
    </header>

    <main class="content">
      <p v-if="loading" class="hint loading">🔍 正在渲染全部站点…</p>
      <p v-else-if="error" class="hint error">{{ error }}</p>

      <template v-else-if="searched && results.length">
        <div class="result-head">
          <h2>
            <b>{{ verified.length }}</b> 个已确认有片源 · 共 <b>{{ results.length }}</b> 个站点可达
            <span v-if="enhancing" class="enhancing">· 核验中…</span>
          </h2>
          <span class="result-sort">已确认优先 · 其余按画质排序</span>
        </div>

        <p v-if="!enhancing && verified.length === 0" class="hint-note">
          说明：部分站点对服务器机房 IP 有反爬拦截，无法在服务端直链到播放页。已为你<b>直达各站「已搜《{{ kw }}》」的结果页</b>，点开即能播放；能直连的站点会自动标 ✅ 立即播放。
        </p>

        <!-- 已确认有片源 -->
        <ol class="result-list" v-if="verified.length">
          <li v-for="(r, i) in verified" :key="r.id" class="card ok">
            <div class="rank" :class="{ top: i < 3 }">{{ i + 1 }}</div>
            <div class="card-body">
              <div class="card-top">
                <span class="site-name">{{ r.name }}</span>
                <span class="q-badge" :class="qualityClass(r.quality)">{{ r.quality || "未知" }}</span>
                <span class="ok-badge">✅ 已确认</span>
                <span class="latency" :class="{ fast: r.latency_ms < 1500 }">⚡ {{ r.latency_ms }}ms</span>
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
            <span class="others-note">部分站点对机房IP风控 / 为JS渲染，由你浏览器打开后搜</span>
          </button>
          <ol class="result-list" v-if="showOthers">
            <li v-for="(r, i) in others" :key="r.id" class="card neutral" :class="{ locked: r.needsCaptcha }">
              <div class="rank">{{ verified.length + i + 1 }}</div>
              <div class="card-body">
                <div class="card-top">
                  <span class="site-name">{{ r.name }}</span>
                  <span class="q-badge" :class="qualityClass(r.quality)">{{ r.quality || "未知" }}</span>
                  <span v-if="r.needsCaptcha" class="cap-badge">🔒 去站里搜</span>
                  <span v-else class="web-badge">🌐 去站里搜</span>
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
      </template>

      <p v-else-if="searched && !results.length" class="hint empty">
        🙅 暂无可用片源。该片可能较冷门，或站点当前均不可访问，换个关键词试试。
      </p>

      <p v-else class="hint">输入片名，从 {{ SITES.length }} 个影视站聚合检索。全部站点即时可达，已验证有片源的站点会优先展示。</p>
    </main>

    <footer class="foot">仅聚合跳转第三方影视站 · 本站不存储任何片源 · 请依法合规使用</footer>
  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f1117; --panel: #171a21; --panel2: #1e2430; --text: #e8ecf3;
  --muted: #8b94a7; --accent: #e6b455; --danger: #ff6b6b;
}
body { background: var(--bg); color: var(--text); font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; min-height: 100vh; }
a { color: inherit; text-decoration: none; }

.shell { max-width: 760px; margin: 0 auto; padding: 0 16px 40px; }

.hero { text-align: center; padding: 48px 0 28px; }
.logo { font-size: 52px; line-height: 1; margin-bottom: 12px; }
h1 { font-size: 30px; letter-spacing: 2px; color: var(--accent); }
.sub { margin-top: 10px; color: var(--muted); font-size: 14px; line-height: 1.7; }
.sub b { color: var(--text); }

.searchbar { display: flex; gap: 10px; margin: 26px auto 14px; max-width: 520px; }
.searchbar input {
  flex: 1; padding: 13px 16px; border-radius: 12px; border: 1px solid #2a2f3d;
  background: var(--panel); color: var(--text); font-size: 16px; outline: none;
}
.searchbar input:focus { border-color: var(--accent); }
.searchbar button {
  padding: 0 22px; border: 0; border-radius: 12px; cursor: pointer; font-size: 16px;
  background: linear-gradient(135deg, #e6b455, #e8862e); color: #1a1205; font-weight: 700;
}
.searchbar button:disabled { opacity: .6; cursor: wait; }

.hot { display: flex; gap: 8px; justify-content: center; align-items: center; flex-wrap: wrap; }
.hot-tag { color: var(--muted); font-size: 12px; }
.chip {
  border: 1px solid #2a2f3d; background: transparent; color: var(--muted); font-size: 13px;
  padding: 5px 12px; border-radius: 999px; cursor: pointer; transition: .2s;
}
.chip:hover { color: var(--accent); border-color: var(--accent); }

.content { margin-top: 14px; }
.hint { color: var(--muted); text-align: center; padding: 30px 0; font-size: 14px; }
.hint.loading { color: var(--accent); }
.hint.error { color: var(--danger); }

.result-head { display: flex; justify-content: space-between; align-items: baseline; margin: 8px 4px 14px; flex-wrap: wrap; gap: 6px; }
.result-head h2 { font-size: 18px; }
.result-head h2 b { color: var(--accent); }
.enhancing { color: var(--accent); font-size: 13px; font-weight: 400; }
.result-sort { color: var(--muted); font-size: 12px; }
.hint-note { color: var(--muted); font-size: 13px; line-height: 1.7; margin: 0 4px 14px; padding: 10px 12px; background: var(--panel); border: 1px solid #232836; border-radius: 12px; }
.hint-note b { color: var(--text); }

.result-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
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
.others-note { display: block; color: var(--muted); font-size: 12px; font-weight: 400; margin-top: 4px; }

.hint.empty { color: #ffb3b3; }
.foot { text-align: center; color: #50586a; font-size: 12px; margin-top: 40px; line-height: 1.8; }
</style>
