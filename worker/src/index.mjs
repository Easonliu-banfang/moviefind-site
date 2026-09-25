/**
 * moviefind — Cloudflare Worker 入口
 * 依赖: ./search-core.mjs (站点数据层 + 搜索核心)
 *
 * 端点:
 *   GET /api/search?q=<关键词>[&max=<数量>]  → 聚合搜索，返回有片源站点，延迟升序
 *   GET /api/sites                          → 站点清单
 */
import { run, SITES, probeSiteDebug, findTemplates, poolLimit, MAX_CONCURRENT } from "./search-core.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const j = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { "Content-Type": "application/json", ...CORS },
});

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    try {
      if (url.pathname === "/api/search") {
        const q = (url.searchParams.get("q") || "").trim();
        if (!q) return j({ ok: false, error: "缺少 q 参数" }, 400);
        const max = Math.min(Math.max(parseInt(url.searchParams.get("max") || "8", 10) || 8, 1), 40);
        const results = await run.search(q, max);
        return j({ ok: true, query: q, ts: Date.now(), results });
      }
      if (url.pathname === "/api/sites") {
        return j({ ok: true, sites: SITES.map(s => ({ id: s.id, name: s.name, origin: s.origin, quality: s.quality })) });
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
      return j({ ok: false, error: "Not Found" }, 404);
    } catch (e) {
      return j({ ok: false, error: "server error: " + e.message }, 500);
    }
  },
};