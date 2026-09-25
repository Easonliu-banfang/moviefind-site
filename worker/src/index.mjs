/**
 * moviefind — Cloudflare Worker 入口
 * 依赖: ./search-core.mjs (站点数据层 + 搜索核心)
 *
 * 端点:
 *   GET /api/search?q=<关键词>[&max=<数量>]  → 聚合搜索，返回有片源站点，延迟升序
 *   GET /api/img?u=<图片URL>                 → 封面代取（击穿图床防盗链，图片仍是站点自己的图）
 *   GET /api/sites                          → 站点清单
 *   GET /api/poster?q=<关键词>[&site=<id>]   → 封面诊断（逐站看从自身 HTML 解析到的海报）
 *   GET /api/probe?q=<关键词>                → 逐站可达性诊断
 *   GET /api/find?q=<关键词>[&site=<id>]     → 全模板诊断
 */
import { run, SITES, probeSiteDebug, findTemplates, probeSite, poolLimit, MAX_CONCURRENT, UA } from "./search-core.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const j = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { "Content-Type": "application/json", ...CORS },
});

// ===== 封面代取（防盗链兜底）=====
// 实测：不少图床开防盗链，浏览器跨站加载 <img> 时 Referer 是本站（github.io），图床直接 403/418，
// 表现为「解析出了海报 URL，前端却显示不出来」。实测 doubanio 无 Referer 是 418、同源 Referer 立刻 200。
// 这里由 Worker 代取：带上图床自己的同源 Referer，再把字节返回给浏览器。
// 图片本身仍是各站点自己的海报，只是换了个可信 Referer —— 不引入任何第三方图源。
// 白名单：33 站自身域名 + 已知海报 CDN + 路径像海报位的资源；其余一律 403，避免被当成通用代理滥用。
const SITE_HOSTS = new Set(SITES.map(s => { try { return new URL(s.origin).hostname; } catch { return ""; } }).filter(Boolean));
const POSTER_CDN_RE = /^(?:.*\.)?(?:doubanio|iqiyipic|qiyipic|picbf|feisuimg|wsyzy|yingk|hitv|bimg|bfzy|tmdb|dbokutv|zhuiying|img|pic)\S*$/i;
const POSTER_PATH_RE = /\/(?:upload\/vod|upload\/|vod|image|pic|poster|thumb)\b/i;

function posterAllowed(u) {
  if (!u || u.length > 400 || !/^https?:\/\//i.test(u)) return false;
  let x;
  try { x = new URL(u); } catch { return false; }
  if (!x.hostname || x.hostname.includes("@") || x.hostname.startsWith("localhost") || /^127\.|^\d+\.\d+\.\d+\.\d+$/.test(x.hostname)) return false;
  if (SITE_HOSTS.has(x.hostname) || POSTER_CDN_RE.test(x.hostname)) return true;
  return POSTER_PATH_RE.test(u);
}

async function imgProxy(u) {
  if (!posterAllowed(u)) return j({ ok: false, error: "not allowed" }, 403);
  const host = new URL(u).hostname;
  // 短暂重试：Cloudflare 出口 IP 到部分图床（如 doubanio）偶发 502 / fetch 超时，
  // 单次失败不代表这张图取不到；重试一次能救回相当一部分。
  // 硬 403（feisuimg 等 IP/TLS 层拦）没有重试价值，直接返回。
  const doFetch = () => fetch(u, {
    headers: {
      "User-Agent": UA,
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": "https://" + host + "/",   // 同源 Referer：击穿 doubanio 等防盗链的关键
    },
    signal: AbortSignal.timeout(6000),
    redirect: "follow",
  });
  let res;
  try { res = await doFetch(); }
  catch (e1) {
    try { res = await doFetch(); }
    catch (e2) { return j({ ok: false, error: String(e2).slice(0, 120) }, 502); }
  }
  if (!res.ok) {
    // 403/404 是确定性失败，不重试；5xx/网络抖动重试一次
    if (res.status !== 403 && res.status !== 404) {
      try {
        const r2 = await doFetch();
        if (r2.ok) res = r2;
      } catch { /* 保持首次结果 */ }
    }
    if (!res.ok) return j({ ok: false, http: res.status }, 502);
  }
  const ct = res.headers.get("content-type") || "";
  // 只转发图片：避免本端点被当成通用反向代理去取任意网页（路径白名单只是第一道闸）
  if (!/^image\//i.test(ct)) return j({ ok: false, error: "not an image", ct: ct.slice(0, 60) }, 502);
  return new Response(res.body, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": ct,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    // 免费代理出口：在 wrangler.toml [vars] 或 secret 里配置 PROXY_BASE（逗号分隔多个，可留空=纯直连）
    const proxyBase = (env && (env.PROXY_BASE || env.PROXY_BASE_URL || "")) || "";

    try {
      // 封面代取：浏览器直链被防盗链拦截时由 Worker 带同源 Referer 代取（图片仍是站点自己的图）
      if (url.pathname === "/api/img") {
        const u = url.searchParams.get("u") || "";
        try { return await imgProxy(u); }
        catch (e) { return j({ ok: false, error: String(e).slice(0, 120) }, 502); }
      }

      if (url.pathname === "/api/search") {
        const q = (url.searchParams.get("q") || "").trim();
        if (!q) return j({ ok: false, error: "缺少 q 参数" }, 400);
        const max = Math.min(Math.max(parseInt(url.searchParams.get("max") || "8", 10) || 8, 1), 40);
        const results = await run.search(q, max, proxyBase);
        return j({ ok: true, query: q, ts: Date.now(), proxy: !!proxyBase, results });
      }
      if (url.pathname === "/api/sites") {
        return j({ ok: true, sites: SITES.map(s => ({ id: s.id, name: s.name, origin: s.origin, quality: s.quality })) });
      }
      if (url.pathname === "/api/poster") {
        // 封面诊断：封面一律只取自站点自身 HTML（不接任何第三方图片搜索）。
        // ?q=关键词&site=id1,id2 —— 指定站；不传 site 则跑全部站。
        // 返回每个站从自己页面里解析到的 title / poster / posterCand，便于逐站核对。
        const q = (url.searchParams.get("q") || "").trim();
        if (!q) return j({ ok: false, error: "缺少 q 参数" }, 400);
        const want = (url.searchParams.get("site") || "").split(",").map(s => s.trim()).filter(Boolean);
        const sites = want.length ? SITES.filter(s => want.includes(s.id)) : SITES;
        const results = [];
        await poolLimit(sites, MAX_CONCURRENT, async (site) => {
          const r = await probeSite(site, q, proxyBase);
          results.push({
            id: r.id, name: r.name, verified: !!r.verified, dead: !!r.dead,
            blocked: !!r.blocked, title: r.title || null,
            poster: r.poster || null, posterCand: r.posterCand || [],
            posterGuess: !!r.posterGuess, latency_ms: r.latency_ms, err: r.err || null,
            searchUrl: r.searchUrl,
          });
        });
        results.sort((a, b) => (a.verified === b.verified ? 0 : a.verified ? -1 : 1));
        return j({ ok: true, q, source: "site-native", ts: Date.now(), results });
      }
      if (url.pathname === "/api/probe") {
        const q = (url.searchParams.get("q") || "狂飙").trim();
        const results = [];
        await poolLimit(SITES, MAX_CONCURRENT, async (site) => { results.push(await probeSiteDebug(site, q)); });
        results.sort((a, b) => (a.ok ? 0 : 1) - (b.ok ? 0 : 1));
        return j({ ok: true, q, results });
      }
      if (url.pathname === "/api/find") {
        const q = (url.searchParams.get("q") || "狂飙").trim();
        const sid = url.searchParams.get("site");
        const sites = sid ? SITES.filter((s) => s.id === sid) : SITES;
        const results = [];
        await poolLimit(sites, MAX_CONCURRENT, async (site) => { results.push(await findTemplates(site, q)); });
        return j({ ok: true, q, results });
      }

      // 站点 favicon 解析：从站点 HTML 提取 <link rel="icon"> 标签的真实 URL
      if (url.pathname === "/api/favicon") {
        const u = url.searchParams.get("url") || "";
        if (!u) return j({ ok: false, error: "缺少 url 参数" }, 400);
        try {
          const res = await fetch(u, {
            headers: { "User-Agent": UA, "Accept": "text/html" },
            signal: AbortSignal.timeout(5000),
            redirect: "follow",
          });
          if (!res.ok) return j({ ok: false, http: res.status }, 502);
          const html = await res.text();
          // 匹配 <link rel="icon" href="..."> 或 <link rel="shortcut icon" href="...">
          const linkRe = /<link[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']+)["']/i;
          const m = html.match(linkRe);
          let favicon = m ? m[1] : "/favicon.ico";
          // 转为绝对 URL
          if (favicon.startsWith("//")) favicon = "https:" + favicon;
          else if (favicon.startsWith("/")) favicon = new URL(u).origin + favicon;
          else if (!favicon.startsWith("http")) favicon = new URL(u).origin + "/" + favicon;
          return j({ ok: true, url: favicon });
        } catch (e) {
          return j({ ok: false, error: String(e).slice(0, 120) }, 502);
        }
      }
      return j({ ok: false, error: "Not Found" }, 404);
    } catch (e) {
      return j({ ok: false, error: "server error: " + e.message }, 500);
    }
  },
};