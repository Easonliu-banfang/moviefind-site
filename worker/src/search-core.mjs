// 搜索核心：可被 Worker 入口或本地测试复用
// 站点数据由 awesome-zhuiju-free 仓库 resources.json 提取（在线影视·国内可直连）
// 2026-09-25 全站适配修正：每个站的 search 模板已按「站点自身搜索表单」逐站实测校准
export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 4500;
// 经代理出口的超时（免费代理普遍较慢，放宽到 9s）
const PROXY_TIMEOUT_MS = 9000;
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
    templates: ["{origin}/auete4so.php?searchword={kw}", "{origin}/index.php/vod/search.html?wd={kw}"], captcha: true },
  { id: "darkvod", name: "黑夜影院", origin: "https://darkvod.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/tag/?wd={kw}&submit=",
    templates: ["{origin}/tag/?wd={kw}&submit=", "{origin}/index.php?m=vod-search&wd={kw}", "{origin}/search.php?q={kw}"] },
  { id: "nivod", name: "泥视频", origin: "https://www.nivod.vip", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "ppnix", name: "PPnix", origin: "https://www.ppnix.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/",
    templates: ["{origin}/"] },
  { id: "duse91", name: "91毒舌", origin: "https://www.duse0.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/search?t=KX6GEEJawvxs4v0NMbRQfQ%3D%3D&k={kw}",
    templates: ["{origin}/search?t=KX6GEEJawvxs4v0NMbRQfQ%3D%3D&k={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "ifn", name: "IFN", origin: "https://ifn.watch", quality: "4K", qualityScore: 5, login: true,
    search: "{origin}/search?q={kw}",
    templates: ["{origin}/search?q={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "fdzys", name: "饭搭子影视", origin: "https://fdzys.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/yu-{kw}-xianguan-de-yingpian-shippin-zhibo",
    templates: ["{origin}/yu-{kw}-xianguan-de-yingpian-shippin-zhibo"] },
  { id: "sa-video", name: "SA视频", origin: "https://www.lsjys11.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "juok", name: "剧OK", origin: "https://juok3.top", quality: "1080P", qualityScore: 3,
    search: "{origin}/search?q={kw}",
    templates: ["{origin}/search?q={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
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
    search: "{origin}/s.html?name={kw}",
    templates: ["{origin}/s.html?name={kw}"] },
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
  { id: "dbku", name: "独播库", origin: "https://www.dbku.tv", quality: "1080P", qualityScore: 3, ads: false, login: false, pinned: true,
    search: "{origin}/vodsearch/-------------.html?wd={kw}",
    templates: ["{origin}/vodsearch/-------------.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "yingmao-cangku", name: "影猫仓库", origin: "https://www.ymck.pro", quality: "1080P", qualityScore: 3,
    search: "{origin}/search.html?wd={kw}",
    templates: ["{origin}/search.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "guangsu-yingshi", name: "光速影视", origin: "https://www.yingshiso.link", quality: "1080P", qualityScore: 3, captcha: true,
    search: "{origin}/search.php?searchword={kw}",
    templates: ["{origin}/search.php?searchword={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "naifei-fyi-19", name: "奈飞工厂", origin: "https://naifei.fyi", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "zndy", name: "宅男影视", origin: "https://zndy.top", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "skr-skr1-cc-9", name: "樱之空", origin: "https://skr.skr1.cc:666", quality: "1080P", qualityScore: 3, login: true,
    search: "{origin}/vodsearch/{kw}-------------/",
    templates: ["{origin}/vodsearch/{kw}-------------/", "{origin}/index.php/vod/search.html?wd={kw}"] },
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

// 从一段 HTML 片段里取「电影封面」：优先 data-src / data-original（懒加载），其次 src。
// 过滤 favicon / logo / 1x1 / .ico，避免把站标当封面。返回绝对地址。
function firstPoster(scope, origin) {
  if (!scope) return null;
  const tags = [...scope.matchAll(/<img\b[^>]*>/gi)];
  for (const t of tags) {
    const tag = t[0];
    const ds = tag.match(/\b(?:data-src|data-original|data-lazy-src|data-lazy)\s*=\s*"([^"]+)"/i);
    const s = tag.match(/\bsrc\s*=\s*"([^"]+)"/i);
    const src = (ds && ds[1]) || (s && s[1]) || null;
    if (!src) continue;
    if (src.startsWith("data:") || /\.ico(\?|$)/i.test(src)) continue;
    if (/favicon|logo\b|icon-/i.test(src)) continue;
    return abs(src, origin);
  }
  return null;
}

// 清理片名后缀噪声（封面图片 / 海报 等）
function cleanTitle(t) {
  return ((t || "").replace(/(封面图片|海报图片|封面|海报|图片)$/, "").trim()) || null;
}

// 提取标题：优先取「含关键词」的来源（可见文字 或 图片 alt/title），避免把角标「短剧/全64集/正片」误当片名；
// 其次取链接附近含关键词的 <h1-4>（仅限该结果项周边，不取页面级标题）。
function extractTitle(html, href, innerHtml, kwSafe) {
  if (innerHtml) {
    const txt = innerHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const imgM = innerHtml.match(/\b(?:alt|title)="([^"]*)"/i);
    const alt = imgM && imgM[1].trim();
    // 优先含关键词的来源
    if (txt && txt.includes(kwSafe)) return cleanTitle(txt.slice(0, 40));
    if (alt && alt.includes(kwSafe)) return cleanTitle(alt.slice(0, 40));
    if (txt) return cleanTitle(txt.slice(0, 40));
    if (alt) return cleanTitle(alt.slice(0, 40));
  }
  if (href) {
    const idx = html.indexOf(href);
    if (idx >= 0) {
      const near = html.slice(Math.max(0, idx - 300), idx + 500);
      const hM = near.match(/<h[1-4][^>]*>\s*([^<]{2,40}?)\s*<\/h[1-4]>/i);
      if (hM && hM[1].includes(kwSafe)) return cleanTitle(hM[1].trim().slice(0, 40));
    }
  }
  return null;
}

// 从「命中结果附近」提取实测画质（避免把页面导航/筛选区的「高清」误当本片画质）
function extractQuality(scope) {
  let m = scope.match(/<[^>]*>(4K|蓝光|1080P|1080|超清|高清|720P)<\/[^>]*>/i) ||
          scope.match(/<(?:em|i|span|b)[^>]*>(4K|蓝光|1080P|超清|高清)<\/[^>]*>/i);
  if (!m) m = scope.match(/(4K|蓝光|1080P|超清|高清)/i);
  if (m) {
    const t = m[1].toLowerCase();
    if (t.includes("4k")) return { liveQuality: "4K", liveScore: 5 };
    if (t.includes("蓝光")) return { liveQuality: "蓝光", liveScore: 4 };
    if (t.includes("1080")) return { liveQuality: "1080P", liveScore: 3 };
    if (t.includes("720")) return { liveQuality: "720P", liveScore: 2 };
    if (t.includes("高清") || t.includes("超清")) return { liveQuality: "高清", liveScore: 2 };
  }
  return { liveQuality: "", liveScore: 0 };
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

// ===== 免费代理出口（解决 CF 机房 IP 被影视站风控拦截）=====
// 原理：CF Worker 出口是数据中心 ASN，常被 WAF/风控按 ASN 拦（403/406/850 等）。
// 通过免费 CORS/代理服务（allorigins / corsproxy 等均为 GitHub 开源小众方案）把请求转发，
// 实际出口变成「代理服务器的 IP」，从而绕开针对 CF ASN 的封禁——不花钱、不封号。
// 默认 proxyBase 为空 = 纯直连（与旧行为一致）；配置后才启用，且任何失败都回退直连，绝不破坏可达性。
async function fetchViaProxy(target, proxyBase) {
  const bases = (proxyBase || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const base of bases) {
    try {
      const res = await fetch(base + encodeURIComponent(target), {
        headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "zh-CN" },
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS), redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (!html || html.length < 50) continue;
      return { html, viaProxy: base };
    } catch { continue; }
  }
  return null;
}

// 直连优先；直连被 WAF/风控(4xx)拦截 或 网络层失败 时，若配置了代理则回退到代理出口。
// 返回 { html, status, viaProxy }；html 为 null 表示彻底拿不到（连接失败/超时/代理也失败）。
async function fetchWithFallback(target, proxyBase) {
  let directHtml = null, directStatus = 0;
  try {
    const res = await fetch(target, {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "zh-CN" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: "follow",
    });
    directHtml = await res.text();
    directStatus = res.status;
  } catch (e) {
    const isTimeout = e && (e.name === "TimeoutError" || e.name === "AbortError" || (e.cause && e.cause.name === "TimeoutError"));
    if (isTimeout) return { html: null, status: 0, isTimeout: true };
    // 网络层失败（DNS/连接被 reset/TLS）：交给代理救一次
    if (proxyBase) { const p = await fetchViaProxy(target, proxyBase); if (p) return { html: p.html, status: 200, viaProxy: p.viaProxy }; }
    return { html: null, status: 0, connFailed: true };
  }
  // 直连拿到响应，但被 WAF/风控(4xx)拦截 → 试用代理出口替换（代理 IP 可能不被拦）
  if (directStatus >= 400 && directStatus < 600 && proxyBase) {
    const p = await fetchViaProxy(target, proxyBase);
    if (p) return { html: p.html, status: 200, viaProxy: p.viaProxy }; // 代理成功取到 HTML
  }
  return { html: directHtml, status: directStatus };
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

  // 1) 真实结果优先：含关键词 + 存在「文字/alt/title 含关键词」的详情/播放链接（强信号）→ 判定有片源并直链该结果。
  //    次级信号：关键词与详情链接在同一小窗口共现（覆盖「标题在链接兄弟节点、不在 <a> 内」的真实结果页）。
  //    空结果页的「无结果」提示语附近不计入，避免把模板/侧栏详情链接误判为片源（假绿）。
  if (hitKw && detailCount >= 1) {
    // 主信号：详情链接的全文（含属性/alt/title/内文）包含关键词 = 真正的搜索结果
    const allAnchors = [...html.matchAll(/<a\b([\s\S]*?)>([\s\S]*?)<\/a>/gi)];
    const detailRe = new RegExp(`(?:${DETAIL_RE_SRC})`, "i");
    const matched = allAnchors.filter((a) => {
      const full = a[0];
      const href = (full.match(/href="([^"]+)"/i) || [])[1] || "";
      if (!detailRe.test(href)) return false;
      const inner = a[2] || "";
      // 关键词必须在锚点「内文」或锚点内 <img alt/title> 中（才是真正的片名），
      // 排除锚点自身 title 属性（常被站点塞入「相关 / 在线观看」等噪声，导致误判）。
      if (inner.includes(kwSafe)) return true;
      const imgM = inner.match(/\b(?:alt|title)="([^"]*)"/i);
      return !!(imgM && imgM[1].includes(kwSafe));
    });

    let chosenHref = null, chosenInner = null;
    if (matched.length) {
      const pick = matched.find((a) => DETAIL_PRIORITY.test(a[0])) ||
                   matched.find((a) => PLAY_PRIORITY.test(a[0])) ||
                   matched[0];
      chosenHref = (pick[0].match(/href="([^"]+)"/i) || [])[1] || "";
      chosenInner = pick[2];
    }

    if (chosenHref) {
      const title = extractTitle(html, chosenHref, chosenInner, kwSafe);
      // 强约束：提取到的标题必须确实包含关键词，否则该链接并非真正的片名
      //（如「电影 正片」「短剧」「电视剧 30集全」等模板/推荐噪声）→ 判为无结果，不绿。
      if (!title || !title.includes(kwSafe)) {
        return { has: false, title: null, detailPath: null, liveQuality: "", liveScore: 0,
                 pageUrl: null, needsCaptcha: false, detailCount };
      }
      // 画质：只在「命中结果附近」提取，避免把页面导航/筛选区的「高清」误当本片实测画质
      const qIdx = chosenHref ? html.indexOf(chosenHref) : -1;
      const qScope = qIdx >= 0 ? html.slice(Math.max(0, qIdx - 400), qIdx + 800) : html;
      const { liveQuality, liveScore } = extractQuality(qScope);
      // 封面：优先链接内 <img>（含懒加载 data-src），其次附近 <img>
      let poster = firstPoster(chosenInner, origin);
      if (!poster && qIdx >= 0) poster = firstPoster(html.slice(Math.max(0, qIdx - 600), qIdx + 600), origin);

      return { has: true, title, detailPath: chosenHref, liveQuality, liveScore,
               pageUrl: abs(chosenHref, origin), poster, needsCaptcha: false, detailCount };
    }
    // 含关键词且存在详情链接，但**无任一详情链接命中关键词、也无共现信号** → 保守判无结果（不绿，退回「去站里搜」）。
    return { has: false, title: null, detailPath: null, liveQuality: "", liveScore: 0,
             pageUrl: null, needsCaptcha: false, detailCount };
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

// 逐站探测：只对「该站权威 search 模板」做一次验证尝试（避免对风控站重复抓取拖慢整体）。
// 判定优先级：命中片源 → verified(立即播放)；
//   WAF/风控(4xx，含403/850) → 站点存活但拦机房IP，浏览器可访问 → 保留(去站里搜/需验证)；
//   服务端错误(5xx) → 视为不可达 → dead，前端自动隐藏；
//   连接失败/DNS/ENOTFOUND → 确属不可达 → dead，隐藏；
//   超时 → 保守保留（可能慢或被静默丢弃，不一定是死站，交给浏览器）。
// proxyBase: 可选免费代理出口（逗号分隔多个），用于绕过 CF 机房 ASN 被封；空=纯直连。
export async function probeSite(site, kw, proxyBase = "") {
  const origin = site.origin;
  const searchUrl = buildSearchUrl(site.search || site.templates?.[0], origin, kw);
  const target = searchUrl;
  const start = Date.now();
  const base = { id: site.id, name: site.name, origin, quality: site.quality, qualityScore: site.qualityScore,
    latency_ms: 0, title: null, pageUrl: null, poster: null, searchUrl, verified: false, needsCaptcha: false, blocked: false, dead: false, realQuality: false, viaProxy: false };
  const f = await fetchWithFallback(target, proxyBase);
  if (!f.html) {
    if (f.isTimeout) return base; // 超时：保守保留，交给浏览器
    return { ...base, dead: true }; // 连接失败 / DNS / ENOTFOUND → 确属不可达，隐藏
  }
  const html = f.html;
  const status = f.status;
  // 经代理拿到的 HTML（代理层 200）按「拿到即解析」处理；直连则按状态码分流
  if (status >= 200 && status < 300) {
    const parsed = parseResultPage(html, origin, kw);
    if (parsed.needsCaptcha) return { ...base, latency_ms: Date.now() - start, needsCaptcha: true, blocked: !!f.viaProxy };
    if (parsed.has) {
      const p = parsed;
      return { ...base, quality: p.liveQuality || site.quality, qualityScore: p.liveScore || site.qualityScore,
        latency_ms: Date.now() - start, title: p.title || null, pageUrl: p.pageUrl || target, poster: p.poster || null, verified: true,
        realQuality: !!(p.liveQuality), viaProxy: !!f.viaProxy };
    }
    return base; // 200 但无结果/SPA → 仍交给浏览器去搜
  }
  if (status >= 500 && status < 600) {
    return { ...base, dead: true, latency_ms: Date.now() - start }; // 服务端错误 → 不可达
  }
  // 4xx（WAF/风控 401/403/406/412/419/429/451/499/850）→ 存活但拦机房IP，浏览器可访问
  return { ...base, needsCaptcha: true, blocked: true, latency_ms: Date.now() - start };
}

// 通用并发限制
export async function poolLimit(items, limit, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx]); } catch {} } };
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export const run = {
  async search(kw, max = 40, proxyBase = "") {
    const out = [];
    await poolLimit(SITES, MAX_CONCURRENT, async (site) => {
      const r = await probeSite(site, kw, proxyBase);
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
