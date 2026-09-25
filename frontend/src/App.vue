<script setup>
import { ref } from "vue";

// ====== Cloudflare Worker 实际地址（兜底默认值，可由仓库 Secret VITE_WORKER_URL 覆盖）======
// 例: "https://moviefind.myuser.workers.dev"
const WORKER_BASE = (import.meta.env.VITE_WORKER_URL || "https://moviefind-search.17721266011.workers.dev").replace(/\/+$/, "");

const kw = ref("");
const results = ref([]);
const loading = ref(false);
const error = ref("");
const searched = ref(false);

const demoHits = ["狂飙", "流浪地球2", "三体", "孤注一掷", "繁花"];

function qualityClass(q) {
  const map = { "4K": "q-4k", "蓝光": "q-bd", "1080P": "q-hd", "720P": "q-hd", "高清": "q-hd", "HD": "q-hd" };
  return map[q] || "q-uhd";
}

async function doSearch() {
  const q = kw.value.trim();
  if (!q || loading.value) return;
  loading.value = true; error.value = ""; searched.value = true; results.value = [];
  try {
    const r = await fetch(`${WORKER_BASE}/api/search?q=${encodeURIComponent(q)}&max=10`);
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || "请求失败");
    results.value = d.results || [];
  } catch (e) {
    error.value = "搜索失败：" + e.message + (WORKER_BASE.includes("你的-worker") ? "（请先在 frontend/.env 配置 VITE_WORKER_URL）" : "");
  } finally { loading.value = false; }
}
function onKey(e) { if (e.key === "Enter") doSearch(); }
function demo(h) { kw.value = h; doSearch(); }
</script>

<template>
  <div class="shell">
    <header class="hero">
      <div class="logo">🎬</div>
      <h1>聚合追剧</h1>
      <p class="sub">一个关键词 · 横扫全网影视站 · 智能筛出 <b>画质最高 · 延迟最低 · 可访问</b> 的片源</p>

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
      <p v-if="loading" class="hint loading">🔍 正在多站并行检索，请稍候…</p>
      <p v-else-if="error" class="hint error">{{ error }}</p>

      <template v-else-if="searched && results.length">
        <div class="result-head">
          <h2>找到 <b>{{ results.length }}</b> 个可用片源</h2>
          <span class="result-sort">已按「延迟优先 · 画质次之」排序</span>
        </div>
        <ol class="result-list">
          <li v-for="(r, i) in results" :key="r.id" class="card">
            <div class="rank" :class="{ top: i < 3 }">{{ i + 1 }}</div>
            <div class="card-body">
              <div class="card-top">
                <span class="site-name">{{ r.name }}</span>
                <span class="q-badge" :class="qualityClass(r.quality)">{{ r.quality || "未知" }}</span>
                <span class="latency" :class="{ fast: r.latency_ms < 1500 }">⚡ {{ r.latency_ms }}ms</span>
              </div>
              <div v-if="r.title" class="card-title">{{ r.title }}</div>
              <p class="card-tip" v-else>该站已找到片源 · 点击直达</p>
            </div>
            <a class="go" :href="r.pageUrl || r.origin" target="_blank" rel="noopener noreferrer">前往播放 ↗</a>
          </li>
        </ol>
      </template>

      <p v-else-if="searched && !results.length" class="hint empty">
        🙅 暂无可用片源。该片可能较冷门，或站点当前均不可访问，换个关键词试试。
      </p>

      <p v-else class="hint">输入片名，从多个影视站聚合检索，只展示有片源的站点，延迟最低排最前。</p>
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
.hint.loading { color: var(--accent2, var(--accent)); }
.hint.error { color: var(--danger); }

.result-head { display: flex; justify-content: space-between; align-items: baseline; margin: 8px 4px 14px; flex-wrap: wrap; gap: 6px; }
.result-head h2 { font-size: 18px; }
.result-head h2 b { color: var(--accent); }
.result-sort { color: var(--muted); font-size: 12px; }

.result-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
.card {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  background: var(--panel); border: 1px solid #232836; border-radius: 14px; transition: .2s;
}
.card:hover { border-color: var(--accent); transform: translateY(-1px); }
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

.hint.empty { color: #ffb3b3; }
.foot { text-align: center; color: #50586a; font-size: 12px; margin-top: 40px; line-height: 1.8; }
</style>