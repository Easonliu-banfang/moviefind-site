import { run } from "./search-core.mjs";

const kw = process.argv[2] || "狂飙";
console.log(`正在搜索 "${kw}"（仅对配置站点发起请求，含并发池限制）...\n`);
const results = await run.search(kw, 8);
console.log(`===== 搜索 "${kw}" → ${results.length} 站有片源 =====`);
if (!results.length) console.log("（无站点返回有片源结果）");
for (const r of results) {
  console.log(`  ${r.name.padEnd(8)} | 延迟 ${String(r.latency_ms).padStart(4)}ms | ${r.quality.padEnd(4)} | ${r.title || "(无标题)"} | ${r.pageUrl || r.origin}`);
}