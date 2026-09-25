// 搜索核心：可被 Worker 入口或本地测试复用
// 站点数据由 awesome-zhuiju-free 仓库 resources.json 提取（在线影视·国内可直连）
// 2026-09-25 全站适配修正：每个站的 search 模板已按「站点自身搜索表单」逐站实测校准
export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 4500;
export const MAX_CONCURRENT = 14;
// 一个站最多尝试的验证模板数（见 templates）
export const MAX_TEMPLATES_PER_SITE = 5;

// 人机验证 / 反爬挑战页识别（只在「无结果」时才用来标记 needsCaptcha）
// 注意：刻意只保留强特征（recaptcha/turnstile/请滑动/请输入验证码 等），
// 去掉「安全验证/防刷/二次验证/5秒」等页脚常见字样，避免误杀有结果的正常页。
export const CAPTCHA_PATS = /请完成验证|请滑动|滑动验证|点击验证|拖动验证|行为验证|请输入验证码|滑动拼图|图文验证|人机验证|verify\s+you\s+are\s+human|are\s+you\s+a\s+human|recaptcha|turnstile|cf[-_]?chl|challenge[-_]?platform|just\s+a\s+moment|checking\s+your\s+browser|security\s+check|access\s+denied|robot\s+check/i;

// 站点级硬拦截状态码（WAF / Cloudflare / 限流 / 网关）—— 数据中心IP常被拦，标记为「需验证/被拦截」而非静默丢弃
export const BLOCKED_STATUS = new Set([401, 403, 406, 412, 419, 429, 451, 499, 501, 503, 520, 521, 522, 523, 524, 525, 526, 850]);

// ===== 详情 / 播放 链接 token（覆盖苹果CMS全部常见路由 + 常见自定义）=====
const DETAIL_TOKENS = ["voddetail","vodshort","vodplay","vod/detail","vod/play","vod/show","detail","play","show","bofang","player","contents","video","playlist","movie","tv"];
const DETAIL_RE_SRC = DETAIL_TOKENS.join("|");
const DETAIL_PRIORITY = /(?:voddetail|vodshort|vod\/detail|detail|show|contents|movie)/i;
const PLAY_PRIORITY = /(?:vodplay|vod\/play|play|bofang|player|video|playlist|tv)/i;

// 通用验证兜底模板（苹果CMS常见搜索路由）—— 用于服务端验证尝试
const COMMON_TEMPLATES = [
  "{origin}/index.php/vod/search.html?wd={kw}",
  "{origin}/index.php?m=vod-search&wd={kw}",
  "{origin}/vodsearch/-------------.html?wd={kw}",
  "{origin}/search.php?q={kw}",
  "{origin}/search?q={kw}",
];

// 每个站：origin(根域名) / quality(标称画质) / search(该站真实搜索URL模板，点击跳转用) / templates(Worker验证尝试的候选)
// 说明：CF 机房IP常被这些站风控拦截 + 大量站为SPA(JS渲染)，服务端验证对多数站不可靠；
// 因此 search 是「用户浏览器里点过去能正确搜」的权威地址（按各站搜索表单逐站实测），templates 仅用于尽力验证。
// search 模板占位符：{origin}=根域名，{kw}=URL编码关键词。SPA/未知路由站使用 "{origin}/"（主页兜底，用户站内自搜）。
export const SITES = [
  { id: "sorani", name: "青空次元", origin: "https://www.sorani.net", quality: "1080P", qualityScore: 3,
    search: "{origin}/",
    templates: ["{origin}/"] },
  { id: "appmovie", name: "APP影院", origin: "https://www.appmovie.art", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}", "{origin}/search.php?q={kw}"] },
  { id: "auete-video", name: "Auete影视", origin: "https://www.aeete.com", quality: "蓝光", qualityScore: 4,
    search: "{origin}/auete4so.php?searchword={kw}",
    templates: ["{origin}/auete4so.php?searchword={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "darkvod", name: "黑夜影院", origin: "https://darkvod.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php?m=vod-search&wd={kw}",
    templates: ["{origin}/index.php?m=vod-search&wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}", "{origin}/search.php?q={kw}"] },
  { id: "nivod", name: "泥视频", origin: "https://www.nivod.vip", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "ppnix", name: "PPnix", origin: "https://www.ppnix.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/",
    templates: ["{origin}/"] },
  { id: "duse91", name: "91毒舌", origin: "https://www.duse0.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "ifn", name: "IFN", origin: "https://ifn.watch", quality: "4K", qualityScore: 5,
    search: "{origin}/search?q={kw}",
    templates: ["{origin}/search?q={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "fdzys", name: "饭搭子影视", origin: "https://fdzys.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/search?wd={kw}",
    templates: ["{origin}/search?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "sa-video", name: "SA视频", origin: "https://www.lsjys11.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "juok", name: "剧OK", origin: "https://juok3.top", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "yingshidaquan", name: "影视大全", origin: "https://yingshidaquan.top", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "juzong", name: "剧踪影院", origin: "https://www.juzong01.me", quality: "1080P", qualityScore: 3,
    search: "{origin}/vodsearch/{kw}-------------/",
    templates: ["{origin}/vodsearch/{kw}-------------/", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "jianyunys", name: "简云影视", origin: "https://jisuzhuiju.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/search?keyword={kw}",
    templates: ["{origin}/search?keyword={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "pianku", name: "片库", origin: "https://4k01.pianku.online", quality: "1080P", qualityScore: 3,
    search: "{origin}/vodsearch/-------------.html?wd={kw}",
    templates: ["{origin}/vodsearch/-------------.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "66-dapianwang", name: "66 大片网", origin: "https://www.77dpw.vip", quality: "1080P", qualityScore: 3,
    search: "{origin}/vodsearch/-------------.html?wd={kw}",
    templates: ["{origin}/vodsearch/-------------.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "xhkan", name: "星河影视", origin: "https://www.xhkan.top", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "didahd", name: "嘀嗒影视", origin: "https://www.didahd.xyz", quality: "1080P", qualityScore: 3,
    search: "{origin}/search/-------------.html?wd={kw}",
    templates: ["{origin}/search/-------------.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "zhuiying", name: "追影", origin: "https://zhuiying3.cc", quality: "蓝光", qualityScore: 4,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "wbbb", name: "歪比巴卜", origin: "https://wbbb1.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "kxyy", name: "开心影院", origin: "https://www.kxyy1.cc", quality: "1080P", qualityScore: 3,
    search: "{origin}/vodsearch/-------------.html?wd={kw}",
    templates: ["{origin}/vodsearch/-------------.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "dhvideo", name: "豆花电影网", origin: "https://dhvideo.cc", quality: "1080P", qualityScore: 3,
    search: "{origin}/",
    templates: ["{origin}/"] },
  { id: "zip0", name: "ZIP0", origin: "https://zip0.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/search?q={kw}",
    templates: ["{origin}/search?q={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "103-39-111-180-29", name: "可可影视", origin: "https://www.kkys14.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "sotvla", name: "搜TV啦", origin: "https://www.sotvla.cc", quality: "1080P", qualityScore: 3,
    search: "{origin}/search.php?q={kw}",
    templates: ["{origin}/search.php?q={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "libvio", name: "LIBVIO", origin: "https://libviobd.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "dbku", name: "独播库", origin: "https://www.dbku.tv", quality: "1080P", qualityScore: 3,
    search: "{origin}/vodsearch/-------------.html?wd={kw}",
    templates: ["{origin}/vodsearch/-------------.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "yingmao-cangku", name: "影猫仓库", origin: "https://www.ymck.pro", quality: "1080P", qualityScore: 3,
    search: "{origin}/search.html?wd={kw}",
    templates: ["{origin}/search.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "guangsu-yingshi", name: "光速影视", origin: "https://www.yingshiso.link", quality: "1080P", qualityScore: 3,
    search: "{origin}/search.php?searchword={kw}",
    templates: ["{origin}/search.php?searchword={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "naifei-fyi-19", name: "奈飞工厂", origin: "https://naifei.fyi", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "zndy", name: "宅男影视", origin: "https://zndy.top", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "aipan-me-25", name: "爱盼", origin: "https://www.aipan.me", quality: "4K", qualityScore: 5,
    search: "https://search.aipan.me/search?q={kw}",
    templates: ["https://search.aipan.me/search?q={kw}"] },
  { id: "skr-skr1-cc-9", name: "樱之空", origin: "https://skr.skr1.cc:666", quality: "1080P", qualityScore: 3,
    search: "{origin}/vodsearch/{kw}-------------/",
    templates: ["{origin}/vodsearch/{kw}-------------/", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "czzymovie", name: "厂长资源", origin: "https://www.czzymovie.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "aikanbot", name: "爱看机器人", origin: "https://www1.aikanbot.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/search?q={kw}",
    templates: ["{origin}/search?q={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
];

// 把相对详情path转绝对URL（支持 // 协议相对）
function abs(path, origin) {
  if (!path) return null;
  if (/^https?:/i.test(path)) return path;
  if (path.startsWith("//")) return "https:" + path;
  return origin.replace(/\/+$/, "") + (path.startsWith("/") ? path : "/" + path);
}

// 拼接搜索 URL（模板 + origin + 编码关键词）
export function buildSearchUrl(tpl, origin, kw) {
  return (tpl || "")
    .replace("{origin}", origin)
    .replace("{kw}", encodeURIComponent(kw));
}

// 每个站实际尝试的验证模板列表：列出的 + 通用兜底（去重，限 MAX_TEMPLATES_PER_SITE）
function siteTemplates(site) {
  const merged = [...(site.templates || []), ...COMMON_TEMPLATES];
  const seen = new Set();
  const out = [];
  for (const t of merged) { if (!seen.has(t)) { seen.add(t); out.push(t); } }
  return out.slice(0, MAX_TEMPLATES_PER_SITE);
}

// 从HTML解析: has / title / pageUrl / liveQuality / liveScore / needsCaptcha
export function parseResultPage(html, origin, kw) {
  const emptyPats = /没有找到|没有相关|暂无.*结果|搜索不到|没有您要找|抱歉.*没有|not\s*found|暂无该|查无此|未找到相关|未查询到|没有匹配/i;

  const kwNorm = (kw || "").replace(/\s+/g, "");
  const kwSafe = kw || "";
  const textNoTag = html.replace(/<[^>]+>/g, "");
  const hitKw = kwNorm && (
    html.includes(kwSafe) || html.includes(kwNorm) ||
    textNoTag.includes(kwNorm) ||
    textNoTag.replace(/&nbsp;|&#?\w+;/g, "").includes(kwNorm));

  const lenient = [...html.matchAll(
    new RegExp(`href="([^"]*?(?:${DETAIL_RE_SRC})[^"]*?)"`, "gi")
  )];
  const detailCount = lenient.length;

  // 1) 真实结果优先：含关键词 + 存在「文字含关键词」的详情/播放链接 → 判定有片源并直链该结果。
  //    绝不被页脚偶发「验证/安全」字样误杀；也只链真正的搜索结果，不链导航/热门侧栏。
  if (hitKw && detailCount >= 1) {
    const anchored = [...html.matchAll(
      new RegExp(`<a\\b[^>]*href="([^"]*?(?:${DETAIL_RE_SRC})[^"]*?)"[^>]*>([\\s\\S]*?)<\\/a>`, "gi")
    )];
    // 只认「链接文字含关键词」的链接 = 真正的搜索结果（排除页内导航/侧栏热门）
    const matched = anchored.filter((a) => (a[2] || "").includes(kwSafe));
    if (matched.length) {
      const chosen =
        matched.find((a) => DETAIL_PRIORITY.test(a[1])) ||
        matched.find((a) => PLAY_PRIORITY.test(a[1])) ||
        matched[0];
      const detailPath = chosen ? chosen[1] : null;
      let title = chosen && chosen[2] ? chosen[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 40) : null;

      if (!title && lenient[0]) {
        const idx = html.indexOf(lenient[0][1]);
        const near = html.slice(Math.max(0, idx - 60), idx);
        const tM = near.match(/>([^<>]{2,40})<\/a>\s*$/) || near.match(/["']name["']\s*:\s*["']([^"']{2,40})["']/);
        if (tM) title = tM[1].trim();
      }
      if (!title) {
        const hM = html.match(/<h[2-4][^>]*>\s*([^<]{2,60}?)\s*<\/h[2-4]>/i);
        if (hM) title = hM[1].trim();
      }

      let liveQuality = "", liveScore = 0;
      let m = html.match(/<[^>]*>(4K|蓝光|1080P|1080|超清|高清|720P)<\/[^>]*>/i) ||
              html.match(/<(?:em|i|span|b)[^>]*>(4K|蓝光|1080P|超清|高清)<\/[^>]*>/i);
      if (!m) m = html.match(/(4K|蓝光|1080P|超清|高清)/i);
      if (m) {
        const t = m[1].toLowerCase();
        if (t.includes("4k")) { liveQuality = "4K"; liveScore = 5; }
        else if (t.includes("蓝光")) { liveQuality = "蓝光"; liveScore = 4; }
        else if (t.includes("1080")) { liveQuality = "1080P"; liveScore = 3; }
        else if (t.includes("720")) { liveQuality = "720P"; liveScore = 2; }
        else if (t.includes("高清") || t.includes("超清")) { liveQuality = "高清"; liveScore = 2; }
      }

      return { has: true, title, detailPath, liveQuality, liveScore,
               pageUrl: detailPath ? abs(detailPath, origin) : null, needsCaptcha: false, detailCount };
    }
    // 有详情链接但文字均不含关键词（图片结果等）→ 不强行给立即播放，退回普通跳转
  }

  // 2) 无结果时才判定验证码 / 空页（不影响上面已确认有片源的站）
  if (CAPTCHA_PATS.test(html)) return { has: false, needsCaptcha: true, captcha: true, pageUrl: null, title: null, detailCount: 0 };
  if (emptyPats.test(html)) return { has: false, needsCaptcha: false, detailCount: 0 };
  if (!hitKw) return { has: false, needsCaptcha: false, detailCount: 0 };
  return { has: false, needsCaptcha: false, detailCount };
}

// 诊断用：单站可达性（首模板）
export async function probeSiteDebug(site, kw) {
  const origin = site.origin;
  const tpls = siteTemplates(site);
  let lastErr = "";
  for (const tpl of tpls) {
    const target = buildSearchUrl(tpl, origin, kw);
    const start = Date.now();
    try {
      const res = await fetch(target, {
        headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "zh-CN" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: "follow",
      });
      const latency = Date.now() - start;
      const html = await res.text();
      const parsed = parseResultPage(html, origin, kw);
      const anchors = [...html.matchAll(new RegExp(`href="([^"]*?(?:${DETAIL_RE_SRC})[^"]*?)"`, "gi"))];
      return { name: site.name, origin, status: res.status, ok: true, latency,
        has: parsed.has, needsCaptcha: !!parsed.needsCaptcha, kwInHtml: html.includes(kw),
        detailCount: anchors.length, len: html.length, searchUrl: target, tpl };
    } catch (e) { lastErr = String(e).slice(0, 60); continue; }
  }
  return { name: site.name, origin, ok: false, error: lastErr, searchUrl: buildSearchUrl(tpls[0], origin, kw), tpl: tpls[0] };
}

// 全模板诊断（并行）—— 用于逐站精修
export async function findTemplates(site, kw) {
  const origin = site.origin;
  const tpls = siteTemplates(site);
  const tasks = tpls.map(async (tpl) => {
    const target = buildSearchUrl(tpl, origin, kw);
    const start = Date.now();
    try {
      const res = await fetch(target, {
        headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "zh-CN" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: "follow",
      });
      const html = await res.text();
      const parsed = parseResultPage(html, origin, kw);
      const anchors = [...html.matchAll(new RegExp(`href="([^"]*?(?:${DETAIL_RE_SRC})[^"]*?)"`, "gi"))];
      return { tpl, url: target, status: res.status, ok: res.ok, kwInHtml: html.includes(kw),
               has: parsed.has, needsCaptcha: !!parsed.needsCaptcha, detailCount: anchors.length, latency: Date.now() - start };
    } catch (e) { return { tpl, url: target, status: 0, ok: false, error: String(e).slice(0, 50), latency: Date.now() - start }; }
  });
  const results = await Promise.all(tasks);
  results.sort((a, b) => (b.has ? 1 : 0) - (a.has ? 1 : 0) || (b.detailCount) - (a.detailCount));
  return { name: site.name, origin, results };
}

// 逐站探测：只对「该站权威 search 模板」做一次验证尝试（避免对风控站重复抓取拖慢整体）；
// 命中片源 → verified；被风控/超时/SPA → 仍返回 searchUrl，前端按「去站里搜」处理。
export async function probeSite(site, kw) {
  const origin = site.origin;
  const searchUrl = buildSearchUrl(site.search || site.templates?.[0], origin, kw);
  const target = searchUrl;
  const start = Date.now();
  try {
    const res = await fetch(target, {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "zh-CN" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: "follow",
    });
    if (res.ok) {
      const html = await res.text();
      const parsed = parseResultPage(html, origin, kw);
      if (parsed.needsCaptcha) {
        return { id: site.id, name: site.name, origin, quality: site.quality, qualityScore: site.qualityScore,
          latency_ms: Date.now() - start, title: null, pageUrl: null, searchUrl, verified: false, needsCaptcha: true, blocked: false };
      }
      if (parsed.has) {
        const p = parsed;
        return { id: site.id, name: site.name, origin, quality: p.liveQuality || site.quality,
          qualityScore: p.liveScore || site.qualityScore, latency_ms: Date.now() - start,
          title: p.title || null, pageUrl: p.pageUrl || target, searchUrl,
          verified: true, needsCaptcha: false, blocked: false };
      }
    } else if (BLOCKED_STATUS.has(res.status)) {
      return { id: site.id, name: site.name, origin, quality: site.quality, qualityScore: site.qualityScore,
        latency_ms: 0, title: null, pageUrl: null, searchUrl, verified: false, needsCaptcha: true, blocked: true };
    }
  } catch { /* 超时/网络失败：当作 SPA/风控，交给浏览器 */ }
  // 其余（超时/首页/空结果/SPA/非200）：返回 searchUrl，前端按「去站里搜」处理
  return { id: site.id, name: site.name, origin, quality: site.quality, qualityScore: site.qualityScore,
    latency_ms: 0, title: null, pageUrl: null, searchUrl, verified: false, needsCaptcha: false, blocked: false };
}

// 通用并发限制
export async function poolLimit(items, limit, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx]); } catch {} } };
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export const run = {
  async search(kw, max = 40) {
    const out = [];
    await poolLimit(SITES, MAX_CONCURRENT, async (site) => {
      const r = await probeSite(site, kw);
      if (r) out.push(r);
    });
    // 排序：已验证有片源优先（延迟升序、画质次之），其余（需验证/去站里搜）排后面
    out.sort((a, b) =>
      ((b.verified ? 0 : 1) - (a.verified ? 0 : 1)) ||
      ((a.needsCaptcha ? 1 : 0) - (b.needsCaptcha ? 1 : 0)) ||
      (a.latency_ms - b.latency_ms) ||
      (b.qualityScore - a.qualityScore));
    return out.slice(0, max);
  }
};
