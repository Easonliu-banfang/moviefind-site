// 本地开发代理：用 Node 直接跑 search-core，暴露与 Cloudflare Worker 完全一致的接口。
// 用途：在还没部署 Cloudflare 时，本地联调前端。
//   node worker/local-dev.mjs        → http://localhost:8787
//   node worker/local-dev.mjs 9000   → 自定义端口
// 前端 .env 里设 VITE_WORKER_URL=http://localhost:8787 即可对接。
import { run, SITES } from "./src/search-core.mjs";
import http from "node:http";

const PORT = parseInt(process.argv[2] || "8787", 10);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
function send(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", ...CORS });
  res.end(body);
}

// Node 18+ 全局已有 fetch / AbortSignal.timeout，search-core 可直接复用。
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  try {
    if (url.pathname === "/api/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) return send(res, { ok: false, error: "缺少 q 参数" }, 400);
      const max = Math.min(Math.max(parseInt(url.searchParams.get("max") || "10", 10) || 10, 1), 20);
      const results = await run.search(q, max);
      return send(res, { ok: true, query: q, ts: Date.now(), results });
    }
    if (url.pathname === "/api/sites") {
      return send(res, { ok: true, sites: SITES.map(s => ({ id: s.id, name: s.name, origin: s.origin, quality: s.quality })) });
    }
    return send(res, { ok: false, error: "Not Found" }, 404);
  } catch (e) {
    return send(res, { ok: false, error: "server error: " + e.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`moviefind 本地代理已启动: http://localhost:${PORT}`);
  console.log(`  GET /api/search?q=片名   聚合搜索（仅返回有片源的站）`);
  console.log(`  GET /api/sites           站点清单（${SITES.length} 个）`);
});
