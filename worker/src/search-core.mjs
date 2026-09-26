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
    favicon: "https://cdn.wyteam.net/webapps/maccms/template/blueghost/img/favicon.ico",
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}", "{origin}/search.php?q={kw}"] },
  { id: "auete-video", name: "Auete影视", origin: "https://www.aeete.com", quality: "蓝光", qualityScore: 4,
    search: "{origin}/auete4so.php?searchword={kw}",
    templates: ["{origin}/auete4so.php?searchword={kw}", "{origin}/index.php/vod/search.html?wd={kw}"], captcha: true },
  { id: "darkvod", name: "黑夜影院", origin: "https://darkvod.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php?m=vod-search&wd={kw}",
    templates: ["{origin}/index.php?m=vod-search&wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}", "{origin}/search.php?q={kw}", "{origin}/tag/?wd={kw}&submit="],
    apiSearch: "{origin}/index.php/ajax/suggest?mid=1&wd={kw}&page=1" },
  { id: "ppnix", name: "PPnix", origin: "https://www.ppnix.com/cn", quality: "1080P", qualityScore: 3,
    search: "{origin}/",
    templates: ["{origin}/"],
    noVerify: true },
  { id: "duse91", name: "91毒舌", origin: "https://www.duse0.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/search?t=KX6GEEJawvxs4v0NMbRQfQ%3D%3D&k={kw}",
    templates: ["{origin}/search?t=KX6GEEJawvxs4v0NMbRQfQ%3D%3D&k={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "ifn", name: "IFN", origin: "https://ifn.watch", quality: "4K", qualityScore: 5, login: true,
    search: "{origin}/search?q={kw}",
    templates: ["{origin}/search?q={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "fdzys", name: "饭搭子影视", origin: "https://fdzys.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/yu-{kw}-xianguan-de-yingpian-shippin-zhibo",
    templates: ["{origin}/yu-{kw}-xianguan-de-yingpian-shippin-zhibo", "{origin}/vod/search?wd={kw}", "{origin}/search?wd={kw}"] },
  { id: "juok", name: "剧OK", origin: "https://juok3.top", quality: "1080P", qualityScore: 3,
    favicon: "https://juok3.top/favicon.png",
    search: "{origin}/search?q={kw}",
    templates: ["{origin}/search?q={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "juzong", name: "剧踪影院", origin: "https://www.juzong01.me", quality: "1080P", qualityScore: 3,
    search: "{origin}/vodsearch/{kw}-------------/",
    templates: ["{origin}/vodsearch/{kw}-------------/", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "jianyunys", name: "简云影视", origin: "https://jisuzhuiju.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/search?keyword={kw}",
    templates: ["{origin}/search?keyword={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "pianku", name: "片库", origin: "https://4k01.pianku.online", quality: "1080P", qualityScore: 3,
    search: "{origin}/vodsearch/-------------.html?wd={kw}",
    templates: ["{origin}/vodsearch/-------------.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"],
    apiSearch: "{origin}/index.php/ajax/suggest?mid=1&wd={kw}&page=1" },
  { id: "66-dapianwang", name: "66 大片网", origin: "https://www.77dpw.vip", quality: "1080P", qualityScore: 3,
    search: "{origin}/vodsearch/-------------.html?wd={kw}",
    templates: ["{origin}/vodsearch/-------------.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"],
    apiSearch: "{origin}/index.php/ajax/suggest?mid=1&wd={kw}&page=1" },
  { id: "xhkan", name: "星河影视", origin: "https://www.xhkan.top", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "didahd", name: "嘀嗒影视", origin: "https://www.didahd.xyz", quality: "1080P", qualityScore: 3,
    search: "{origin}/search/-------------.html?wd={kw}",
    templates: ["{origin}/search/-------------.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"],
    apiSearch: "{origin}/index.php/ajax/suggest?mid=1&wd={kw}&page=1" },
  { id: "zhuiying", name: "追影", origin: "https://zhuiying3.cc", quality: "蓝光", qualityScore: 4,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"],
    apiSearch: "{origin}/index.php/ajax/suggest?mid=1&wd={kw}&page=1" },
  { id: "kxyy", name: "开心影院", origin: "https://www.kxyy1.cc", quality: "1080P", qualityScore: 3,
    search: "{origin}/vodsearch/-------------.html?wd={kw}",
    templates: ["{origin}/vodsearch/-------------.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"],
    apiSearch: "{origin}/index.php/ajax/suggest?mid=1&wd={kw}&page=1" },
  { id: "dhvideo", name: "豆花电影网", origin: "https://dhvideo.cc", quality: "1080P", qualityScore: 3,
    search: "{origin}/s.html?name={kw}",
    templates: ["{origin}/s.html?name={kw}"],
    noVerify: true },
  { id: "zip0", name: "ZIP0", origin: "https://zip0.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/search?q={kw}",
    templates: ["{origin}/search?q={kw}", "{origin}/index.php/vod/search.html?wd={kw}"],
    apiSearch: "{origin}/api/videos/search?query={kw}&limit=5" },
  { id: "103-39-111-180-29", name: "可可影视", origin: "https://www.kkys14.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "sotvla", name: "搜TV啦", origin: "https://www.sotvla.cc", quality: "1080P", qualityScore: 3,
    search: "{origin}/search.php?q={kw}",
    templates: ["{origin}/search.php?q={kw}", "{origin}/index.php/vod/search.html?wd={kw}"],
    noVerify: true },
  { id: "libvio", name: "LIBVIO", origin: "https://libviobd.com", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "dbku", name: "独播库", origin: "https://www.dbku.tv", quality: "1080P", qualityScore: 3, ads: false, login: false, pinned: true,
    search: "{origin}/vodsearch/-------------.html?wd={kw}",
    templates: ["{origin}/vodsearch/-------------.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"],
    apiSearch: "{origin}/index.php/ajax/suggest?mid=1&wd={kw}&page=1" },
  { id: "yingmao-cangku", name: "影猫仓库", origin: "https://www.ymck.pro", quality: "1080P", qualityScore: 3,
    search: "{origin}/search.html?wd={kw}",
    templates: ["{origin}/search.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"],
    apiSearch: "{origin}/index.php/ajax/suggest?mid=1&wd={kw}&page=1" },
  { id: "guangsu-yingshi", name: "光速影视", origin: "https://www.yingshiso.link", quality: "1080P", qualityScore: 3, captcha: true,
    search: "{origin}/search.php?searchword={kw}",
    templates: ["{origin}/search.php?searchword={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "naifei-fyi-19", name: "奈飞工厂", origin: "https://naifei.fyi", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"],
    apiSearch: "{origin}/index.php/ajax/suggest?mid=1&wd={kw}&page=1" },
  { id: "zndy", name: "宅男影视", origin: "https://zndy.top", quality: "1080P", qualityScore: 3,
    search: "{origin}/index.php/vod/search.html?wd={kw}",
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "skr-skr1-cc-9", name: "樱之空", origin: "https://skr.skr1.cc:666", quality: "1080P", qualityScore: 3, login: true,
    search: "{origin}/vodsearch/{kw}-------------/",
    templates: ["{origin}/vodsearch/{kw}-------------/", "{origin}/index.php/vod/search.html?wd={kw}"],
    apiSearch: "{origin}/index.php/ajax/suggest?mid=1&wd={kw}&page=1" },
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

// ===== 封面（海报）提取 =====
// 真图常写在懒加载属性里，src 往往是占位图 → 按优先级逐个属性尝试
const IMG_SRC_ATTRS = ["data-original", "data-src", "data-lazy-src", "data-lazy", "data-echo",
  "data-url", "data-lazyload", "data-cfsrc", "data-actualsrc", "src2", "src"];
// 懒加载属性匹配器（一次性编译，复用）
const LAZY_ATTR_RE = IMG_SRC_ATTRS.map(a => new RegExp(`\\b${a}\\s*=\\s*(["'])(.*?)\\1`, "i"));
// 只在这几类「可能承载封面」的标签里找图。
// 关键：苹果CMS/mytheme 主题的封面根本不在 <img> 里，而是
//   <a class="myui-vodlist__thumb lazyload" href="/voddetail/3379.html" title="狂飙" data-original="https://...jpg">
// 所以必须扫全部媒体类标签，不能只扫 <img>。
const MEDIA_TAGS_RE = /<(?:img|a|span|div|li|p|b|i|em|strong|figure|source|td|dt|dd)\b[^>]*>/gi;
// 站标 / 加载动画 / 广告位 / 二维码 / 表情 CDN —— 绝不能当封面
const IMG_NOISE_RE = /favicon|\blo\.gif|\/logo\b|logo[-_./]|icon-|loading|load\.(gif|png|webp|svg)|cebianlan|banner|advert|\/ads?\b|qrcode|qr[-_.]|\/static\/|\/site\/|placeholder|qpic\.cn|bqimg\.com|gpimg\.cn|gtimg\.cn|qlog\.cn/i;
// 只认图片资源：扫全部标签后挡掉误扫到的 <script>/<link> 的 js/css 地址
const NON_IMG_RE = /\.(?:js|css|xml|json|woff2?|ttf|otf|eot|webmanifest|mp3|mp4|flv|m3u8)(?:\?|$)/i;
// 路径像片库的图（可信度高）
const POSTER_HINT_RE = /\/upload\/vod|\/upload\/|\/vod\b|\/image\b|\/pic\b|\/poster|iqiyipic|tmdb|doubanio|vodpic|bimg\.com|zhuiying|img\.bfzy/i;
// 锚点自身带图（懒加载属性 / 内含 <img> / class 是封面位）→ 它的 title 属性就是这张图的标签（片名）
const THUMB_HINT_RE = /myui-vodlist__thumb|v-thumb|lazyload|thumb|pic|poster|cover/i;

function decodeImgPath(p) {
  return ((p || "").trim().replace(/^["']+|["']+$/g, ""))
    .replace(/&quot;/g, '"').replace(/&#x2F;|&#47;|\\u002f/gi, "/").replace(/&amp;/g, "&");
}

// 图片 URL 规整：转绝对 + http→https 升级
//（https 页面加载 http 图片会被浏览器当「混合内容」直接拦截，表现为「封面不显示」）
function normImgUrl(p, origin) {
  const u = decodeImgPath(p);
  if (!u || u.startsWith("data:")) return null;
  if (/\.(svg|ico)(\?|$)/i.test(u) || IMG_NOISE_RE.test(u) || NON_IMG_RE.test(u)) return null;
  if (u.length > 170) return null;   // 海报 URL 都很短；超长基本是带签名的临时资源（广告 / banner）
  const a = abs(u, origin);
  if (!a) return null;
  return /^http:\/\//i.test(a) ? "https://" + a.slice(7) : a;
}

// 标签自身的「图名」：alt 优先，其次 title（mytheme 封面锚点用 title 携带片名）
function tagLabel(tag) {
  const m = tag.match(/\b(?:alt|title)\s*=\s*["']([^"']*)["']/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

// 锚点是否「自带图」：带懒加载属性 / 内含 <img> / class 是封面位
// → 这类锚点的 title 属性是图片标签（片名），不是「在线观看」之类导航噪声
export function isMediaAnchor(tag) {
  return /<img\b/i.test(tag) || THUMB_HINT_RE.test(tag) || LAZY_ATTR_RE.some(re => re.test(tag));
}

// 收集一段 HTML 里「最像本片海报」的候选图，按可信度排序去重。
// 来源①：所有媒体类标签上的懒加载属性；来源②：CSS background:url()（黑夜影院等把封面写在背景里）。
// hints：片名/关键词数组。候选图的 alt 或 title 命中其中任一项 → +100（最强信号，位置无关）。
function collectPosterCands(scope, origin, hints) {
  if (!scope) return [];
  const hintArr = (Array.isArray(hints) ? hints : hints ? [hints] : []).filter(Boolean);
  const cands = [], seen = new Set();
  const push = (u, label, fromBg) => {
    const nu = normImgUrl(u, origin);
    if (!nu || seen.has(nu)) return;
    seen.add(nu);
    let score = 0;
    if (label) {
      const lab = label.toLowerCase();
      for (const h of hintArr) { if (h && lab.includes(h.toLowerCase())) { score += 100; break; } }
    }
    if (POSTER_HINT_RE.test(nu)) score += 40;   // 路径像片库
    if (fromBg) score += 10;                    // CSS 背景图通常是海报位
    // GIF 惩罚：默认动图不作封面，但站点自身的图片 CDN 常把静态海报也用 .gif 后缀（如 ifn.watch 的 /api/image/*.gif）
    // —— 此时 label 已经强命中片名（score>=100）或路径已像片库（score>=40），GIF 惩罚不该再压过强信号。
    if (/\.gif(\?|$)/i.test(nu) && score < 80) score -= 200;
    // 已实测硬 403 的图床（对所有 Referer 都返回 403，IP/TLS 层拦）——
    // 即便它在 HTML 里位置靠前、标签看着像封面，也几乎不可能加载成功，
    // 给它大幅降分，让前端优先选用同一站点上确实能访问的候选图。
    if (/\/pic\.feisuimg\.com\//i.test(nu) || /pic\.feisuimg\.com/i.test(nu)) score -= 300;
    cands.push({ url: nu, label, score });
  };
  for (const t of [...scope.matchAll(MEDIA_TAGS_RE)]) {
    const tag = t[0];
    const label = tagLabel(tag);
    for (const re of LAZY_ATTR_RE) {
      const m = tag.match(re);
      if (m) { push(m[2], label, false); break; }
    }
  }
  for (const b of [...scope.matchAll(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)]) {
    push(b[1], "", true);
  }
  cands.sort((x, y) => y.score - x.score);
  return cands;
}

// 首选封面 URL（兼容原调用方式）
function firstPoster(scope, origin, hints) {
  const c = collectPosterCands(scope, origin, hints);
  return c[0] ? c[0].url : null;
}

// 综合封面提取，分层回退（每层都比下层可信）：
// 1) 结果卡片窗口内有正分候选 —— 封面通常就在结果卡的懒加载属性里
// 2) 全页「alt/title 与片名一致」交叉匹配 —— 封面在结果卡外层、或整页共用一个列表时命中
// 3) 全页其他正分候选（路径像片库）
// 4) 结果窗口内剩余弱候选
function bestPoster(html, href, origin, hints) {
  const i0 = href ? html.indexOf(href) : -1;
  const win = i0 >= 0
    ? collectPosterCands(html.slice(Math.max(0, i0 - 400), Math.min(html.length, i0 + 1600)), origin, hints)
    : [];
  const all = collectPosterCands(html, origin, hints);
  const take = cands => ({ poster: cands[0].url, posterCand: cands.map(x => x.url).slice(0, 5) });
  if (win.some(c => c.score > 0)) return take(win);
  const strong = all.filter(c => c.score >= 100);
  if (strong.length) return take(strong);
  const any = all.filter(c => c.score > 0);
  if (any.length) return take(any);
  if (win.length) return take(win);
  return { poster: null, posterCand: [] };
}

// ===== 封面一律只取自站点自身 HTML =====
// 不接任何第三方图片搜索（Bing/百度/DDG 等）：用户要求封面必须是网站自己的图。
// 站点是 JS 渲染、服务端只拿到空壳页时，就不给封面（前端回退 monogram 井），而不是拿别处的图凑数。

// 清理片名噪声：结果卡里常把评分/集数/画质/地区/年份和片名挤在同一个可见文本里
//（如「8.8 分 狂飙」「已完结 狂飙 2023 / 内地」「654 6.5 HD F1：狂飙」「8.0 HD+137版 流浪地球」），剥掉才好用。
// 注意别误删片名本身的年份/序号，所以年份只作为「开头」的噪声剥掉。
// 注意：
// - `\d+(?:\.\d+)?\s+(?=[A-Za-z])` 要求数字和字母间有真空格 —— 否则会把 `4K` 只吃掉 `4`
//   剩下 `K`（regex 的 `(?=[A-Za-z])` 零宽断言让 `\d+` 停在 `4`，然后 `k` 归给下一段）。
// - `f\d+` 已从列表移除：`F1：狂飙飞车` 是合法片名，不能当徽章剥掉。
const TITLE_LEAD_NOISE = /^(?:\d+(?:\.\d+)?\s+(?=[A-Za-z])|\d+(?:\.\d+)?\s*分|\d{3,4}\s*(?=[^\d])|\d{2,4}\s*集|全部?\d*\s*集|已完结|正片|高清|超清|蓝光|4\s*k|fhd|uhd|hd\+?\s*\d*\s*版?|hd|1080\s*p|720\s*p|未删减|中字|国配|国语|粤语|bf|修复|分)\s*[：:·、,，\-—·+]*/i;
const TITLE_TAIL_NOISE = /[：:·、,，\-—·]?\s*(?:全部?\d*\s*集|已完结|正片|高清|超清|蓝光|hd\+?\s*\d*\s*版?|hd|1080\s*p|720\s*p|中字|未删减|bf)\s*$/i;
const TITLE_TAIL_META = /\s*[/／]\s*(?:中国大陆|中国内地|内地|中国|大陆|美国|日本|韩国|台湾|香港|泰国|印度|法国|英国|西班牙|德国)\s*$/i;
// 结尾年份：`狂飙 2023` / `哪吒 2019` 常见。片名结尾不会单独跟 4 位年份（`2001: 太空漫游` 有冒号隔开），安全剥。
const TITLE_TAIL_YEAR = /\s+\b(?:19|20)\d{2}\b\s*$/;
// 中段信息噪声（不只在开头/结尾）：更新时间 / 播出时间 / 主演 / 导演 / 演员 /
// 更新日期 / 角标徽章 / X.X 评分 / 状态标签 —— 这些常夹在片名中间（如
// 「8.0 已完结 庆余年 8.0 更新时间：0x月xx日 主演…」），必须整段剥掉。
// 用 \b\d{1,2}\.\d\b 抓评分（不会误伤「2001 太空漫游」这种 4 位年份），
// 但也不剥「第X季/第X部/第X集」——那属于合法分季信息。
const TITLE_CLEAN_RE = new RegExp(
  [
    "更新时间[：:]?[^，,；;\\s]{0,20}",
    "播出时间[：:]?[^，,；;\\s]{0,20}",
    "上映时间[：:]?[^，,；;\\s]{0,20}",
    "(?:主演|导演|编剧|演员|监制)[：:]?[^，,；;\\s]{0,40}",
    "年\\d{1,2}月\\d{1,2}日",
    "\\b\\d{1,2}月\\d{1,2}日\\b",
    "在线看|免费在线观看|全集在线观看|免费观看|立即播放",
    "\\[[^\\]]{0,20}\\]",
    "[【「][^】」]{0,15}[】」]",
    "\\b\\d{1,2}\\.\\d\\b",
    "已完结|连载中|热播中|正在更新|更新至|播放中",
    // 演员名录兜底（无「主演」前缀时）：中文/西文名逗号分隔 —— 片名里几乎不会出现，安全剥。
    "[\\u4e00-\\u9fff·A-Za-z]{2,12}(?:[,，][\\u4e00-\\u9fff·A-Za-z]{2,12})+",
  ].join("|"),
  "g"
);

function cleanTitle(t) {
  let s = ((t || "").replace(/(封面图片|海报图片|封面|海报|图片)$/, "").replace(/\s+/g, " ")).trim();
  // 先剥前导噪声 —— 必须先于 TITLE_CLEAN_RE 跑，否则 `\b\d{1,2}\.\d\b` 会把「8.8 分」切成「 分」，
  // 剩下孤立的「分」TITLE_LEAD_NOISE 抓不到（它要求 \d+ 在「分」前面）。
  let prev;
  do { prev = s; s = s.replace(TITLE_LEAD_NOISE, "").trim(); } while (s !== prev);
  // 中段信息噪声（更新时间/主演/评分等）
  s = s.replace(TITLE_CLEAN_RE, " ");
  // 再剥前/尾噪声（TITLE_CLEAN_RE 剥掉中段后，可能会把「8.0 已完结 X 8.0 更新时间」变成「X」，
  // 也可能留下新的前导/尾部噪声）
  do { prev = s; s = s.replace(TITLE_LEAD_NOISE, "").replace(TITLE_TAIL_NOISE, "").replace(TITLE_TAIL_META, "").replace(TITLE_TAIL_YEAR, "").trim(); } while (s !== prev);
  s = s.replace(/\s+/g, " ").replace(/[：:·、,，\-—·]\s*$/, "").trim();
  // 演员表兜底：cleanTitle 之前切过 80 字符，「主演」二字可能已被截掉、剩下「,戴姆森·伊德瑞斯,哈莉…」的
  // 演员名录。正规片名几乎不含逗号（中英文都是），出现逗号基本就是演员表/副标题分隔 —— 在首个逗号处截断。
  const cIdx = s.search(/[,，]/);
  if (cIdx > 0) s = s.slice(0, cIdx).trim();
  return s || null;
}

// 提取标题：优先取「含关键词」的来源（可见文字 / 图片 alt 或 title / 封面位锚点自身的 title），
// 避免把角标「短剧/全64集/正片」误当片名；其次取链接附近含关键词的 <h1-4>（仅限该结果项周边）。
// 第 3 种来源针对 mytheme：封面锚点 <a class="myui-vodlist__thumb lazyload" title="狂飙" data-original="...">
// 的内文只有角标 <span>，片名写在锚点自身 title 上。
function extractTitle(html, tag, innerHtml, kwSafe) {
  let txt = "", alt = "";
  if (innerHtml) {
    txt = innerHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const imgM = innerHtml.match(/\b(?:alt|title)="([^"]*)"/i);
    alt = imgM ? imgM[1].trim() : "";
  }
  const own = tag ? (tag.match(/\btitle\s*=\s*["']([^"']*)["']/i) || [])[1] : "";
  const ownTitle = own ? own.trim() : "";
  // 含关键词的来源优先（切 80 字符：片名噪声常夹在标题中段，切太短会带着脏尾巴返回）
  if (txt && txt.includes(kwSafe)) return cleanTitle(txt.slice(0, 80));
  if (alt && alt.includes(kwSafe)) return cleanTitle(alt.slice(0, 80));
  if (ownTitle && ownTitle.includes(kwSafe)) return cleanTitle(ownTitle.slice(0, 80));
  // 不含关键词的兜底来源
  if (txt) return cleanTitle(txt.slice(0, 80));
  if (alt) return cleanTitle(alt.slice(0, 80));
  if (tag) {
    const idx = html.indexOf((tag.match(/href="([^"]+)"/i) || [])[1] || "");
    if (idx >= 0) {
      const near = html.slice(Math.max(0, idx - 300), idx + 500);
      const hM = near.match(/<h[1-4][^>]*>\s*([^<]{2,60}?)\s*<\/h[1-4]>/i);
      if (hM && hM[1].includes(kwSafe)) return cleanTitle(hM[1].trim().slice(0, 80));
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
    // 超时或网络层失败（DNS/连接被 reset/TLS）：交给代理救一次
    if (proxyBase) { const p = await fetchViaProxy(target, proxyBase); if (p) return { html: p.html, status: 200, viaProxy: p.viaProxy }; }
    if (isTimeout) return { html: null, status: 0, isTimeout: true };
    return { html: null, status: 0, connFailed: true };
  }
  // 直连拿到响应，但被 WAF/风控(4xx)拦截 → 试用代理出口替换（代理 IP 可能不被拦）
  if (directStatus >= 400 && directStatus < 600 && proxyBase) {
    const p = await fetchViaProxy(target, proxyBase);
    if (p) return { html: p.html, status: 200, viaProxy: p.viaProxy }; // 代理成功取到 HTML
  }
  return { html: directHtml, status: directStatus };
}

// 关键词匹配度评分（标题越贴近搜索词 → 分数越高，排序第一优先级）
// 100 完全一致 / 90 以 kw 开头 / 80 前两字命中 / 70 包含 kw / 60 去空格后包含 / 50 含 kw 但有大量额外字符 / 0 无标题
function computeMatchScore(title, kw) {
  if (!title || !kw) return 0;
  const t = title.trim().replace(/\s+/g, "");
  const k = kw.trim().replace(/\s+/g, "");
  if (!t || !k) return 0;
  if (t === k) return 100;                          // 完全一致
  if (t.startsWith(k)) return 90;                   // 以 kw 开头
  if (k.length >= 2 && t.slice(0, 2) === k.slice(0, 2) && t.includes(k)) return 80; // 前两字命中 + 包含
  if (t.includes(k)) return 70;                     // 包含 kw
  // 去空格后包含（中文无空格影响，但英文标题可能有空格差异）
  const tNoSp = t.replace(/\s/g, "");
  const kNoSp = k.replace(/\s/g, "");
  if (tNoSp.includes(kNoSp)) return 60;
  // 含 kw 但额外字符很多（片名长度比 kw 长很多，可能是"XX剧场版""XX2"等）
  if (t.includes(k) && t.length > k.length * 1.5) return 50;
  return 0;
}

// 从HTML解析: has / title / pageUrl / liveQuality / liveScore / needsCaptcha / results
// results: 数组，包含所有匹配的结果（每个元素有 title/pageUrl/poster/posterCand/detailPath/liveQuality/liveScore）
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
      // 关键词在锚点「内文」或锚点内 <img alt/title> 中 = 真正的片名
      if (inner.includes(kwSafe)) return true;
      const imgM = inner.match(/\b(?:alt|title)="([^"]*)"/i);
      if (imgM && imgM[1].includes(kwSafe)) return true;
      // 锚点自身带图（懒加载属性 / 内含 <img> / class 是封面位）时，它的 title 属性就是图片标签 = 片名。
      // 反例（普通导航锚点 <a title="在线观看">）不带图，不会误判。
      if (isMediaAnchor(full)) {
        const tm = full.match(/\btitle\s*=\s*["']([^"']*)["']/i);
        if (tm && tm[1].includes(kwSafe)) return true;
      }
      return false;
    });

    // 收集所有匹配的结果（去重，最多返回 10 条避免过多）
    const results = [];
    const seenUrls = new Set();
    for (const a of matched) {
      const chosenTag = a[0];
      const chosenHref = (chosenTag.match(/href="([^"]+)"/i) || [])[1] || "";
      const chosenInner = chosenTag.slice(chosenTag.indexOf(">") + 1, chosenTag.lastIndexOf("</a>"));
      // 片名提示：关键词 + 提取出的片名（用于 alt/title 与片名一致的交叉匹配）
      const hints = [kwSafe];
      const title = extractTitle(html, chosenTag, chosenInner, kwSafe);
      // 强约束：提取到的标题必须确实包含关键词，否则该链接并非真正的片名
      if (!title || !title.includes(kwSafe)) continue;
      // 去重：同一详情页不重复
      const pageUrl = abs(chosenHref, origin);
      if (seenUrls.has(pageUrl)) continue;
      seenUrls.add(pageUrl);
      // 画质：只在「命中结果附近」提取，避免把页面导航/筛选区的「高清」误当本片实测画质
      const qIdx = chosenHref ? html.indexOf(chosenHref) : -1;
      const qScope = qIdx >= 0 ? html.slice(Math.max(0, qIdx - 400), qIdx + 800) : html;
      const { liveQuality, liveScore } = extractQuality(qScope);
      // 封面：结果卡片窗口内 → 全页「alt/title 与片名一致」交叉匹配 → 全页其他正分候选
      hints.push(title);
      const bp = bestPoster(html, chosenHref, origin, hints);
      let poster = bp.poster;
      let posterCand = bp.posterCand && bp.posterCand.length ? bp.posterCand : [];
      if (!poster && qIdx >= 0) {
        const near = collectPosterCands(html.slice(Math.max(0, qIdx - 800), qIdx + 1000), origin, hints);
        if (near[0]) { poster = near[0].url; posterCand = near.map(x => x.url).concat(posterCand).slice(0, 5); }
      }
      results.push({ title, detailPath: chosenHref, liveQuality, liveScore,
        pageUrl, poster, posterCand });
      if (results.length >= 10) break; // 每站最多返回 10 条
    }

    if (results.length > 0) {
      // 返回所有结果，第一条作为主结果（向后兼容）
      const first = results[0];
      return { has: true, title: first.title, detailPath: first.detailPath,
        liveQuality: first.liveQuality, liveScore: first.liveScore,
        pageUrl: first.pageUrl, poster: first.poster, posterCand: first.posterCand,
        needsCaptcha: false, detailCount, results };
    }
    // 含关键词且存在详情链接，但**无任一详情链接命中关键词、也无共现信号** → 保守判无结果（不绿，退回「去站里搜」）。
    // 封面仍尽力提取并标 posterGuess（弱信号）：让未绿站也能显示海报，而非只剩首字海报井。
    // 真·空结果页已被下方 emptyPats 拦截，不会走到这里，所以不会给空页配假封面。
    const guessCands = collectPosterCands(html, origin, kwSafe);
    return { has: false, title: null, detailPath: null, liveQuality: "", liveScore: 0,
             pageUrl: null, needsCaptcha: false, detailCount, results: [],
             poster: guessCands[0] ? guessCands[0].url : null,
             posterCand: guessCands.map(x => x.url).slice(0, 5), posterGuess: true };
  }

  // 2) 无结果时才判定验证码 / 空页（不影响上面已确认有片源的站）
  if (CAPTCHA_PATS.test(html)) return { has: false, needsCaptcha: true, captcha: true, pageUrl: null, title: null, detailCount: 0, results: [] };
  if (emptyPats.test(html)) return { has: false, needsCaptcha: false, detailCount: 0, results: [] };
  if (!hitKw) return { has: false, needsCaptcha: false, detailCount: 0, results: [] };
  return { has: false, needsCaptcha: false, detailCount, results: [] };
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

// ===== 豆花电影网 SHA1 挑战破解 =====
// 挑战机制：JS 计算 sha1(hash + i) === target，找到 i 后跳转 ?attack_key=i
// Worker 用 crypto.subtle 计算 SHA1，暴力破解找到 i，再带 attack_key 请求真实页面
async function solveDhvideoChallenge(html, baseUrl) {
  try {
    // 提取 hash 和 target
    const hashMatch = html.match(/var\s+hash\s*=\s*'([^']+)'/);
    const targetMatch = html.match(/var\s+target\s*=\s*'([^']+)'/);
    if (!hashMatch || !targetMatch) return null;
    
    const hash = hashMatch[1];
    const target = targetMatch[1];
    
    // 暴力破解：找到 i 使得 sha1(hash + i) === target
    for (let i = 0; i < 1000000; i++) {
      const input = new TextEncoder().encode(hash + i);
      const hashBuf = await crypto.subtle.digest('SHA-1', input);
      const hashHex = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (hashHex === target) {
        // 找到 attack_key，构造真实 URL
        const sep = baseUrl.includes('?') ? '&' : '?';
        return baseUrl + sep + 'attack_key=' + i;
      }
    }
  } catch (e) {
    console.error('Challenge solve failed:', e);
  }
  return null;
}

// 逐站探测：只对「该站权威 search 模板」做一次验证尝试（避免对风控站重复抓取拖慢整体）。
// 判定优先级：命中片源 → verified(立即播放)；
//   WAF/风控(4xx，含403/850) → 站点存活但拦机房IP，浏览器可访问 → 保留(去站里搜/需验证)；
//   服务端错误(5xx) → 视为不可达 → dead，前端自动隐藏；
//   连接失败/DNS/ENOTFOUND → 确属不可达 → dead，隐藏；
//   超时 → 保守保留（可能慢或被静默丢弃，不一定是死站，交给浏览器）。
// proxyBase: 可选免费代理出口（逗号分隔多个），用于绕过 CF 机房 ASN 被封；空=纯直连。
// 外层包一层 try/catch：解析器任何异常都绝不让整站被静默丢弃（并发池会吃掉异常，
// 表现为「这个站凭空消失」——之前就是这个坑，改解析器时务必先跑全量回归）。
export async function probeSite(site, kw, proxyBase = "") {
  const origin = site.origin;
  const searchUrl = buildSearchUrl(site.search || site.templates?.[0], origin, kw);
  const start = Date.now();
  const base = { id: site.id, name: site.name, origin, quality: site.quality, qualityScore: site.qualityScore,
    latency_ms: 0, title: null, pageUrl: null, poster: null, posterCand: [], searchUrl, verified: false,
    needsCaptcha: false, blocked: false, dead: false, realQuality: false, viaProxy: false, matchScore: 0 };
  try {
    const r = await probeSiteImpl(site, kw, proxyBase);
    if (!r) return base;
    // 支持返回数组（多结果）或单对象（单结果）
    const results = Array.isArray(r) ? r : [r];
    return results.map(res => {
      res.latency_ms = res.latency_ms || Date.now() - start;
      res.matchScore = res.matchScore ?? computeMatchScore(res.title, kw);
      return res;
    });
  } catch (e) {
    return { ...base, err: String(e).slice(0, 120), latency_ms: Date.now() - start, matchScore: 0 };
  }
}

async function probeSiteImpl(site, kw, proxyBase) {
  const origin = site.origin;
  const searchUrl = buildSearchUrl(site.search || site.templates?.[0], origin, kw);
  const target = searchUrl;
  const start = Date.now();
  const base = { id: site.id, name: site.name, origin, quality: site.quality, qualityScore: site.qualityScore,
    latency_ms: 0, title: null, pageUrl: null, poster: null, posterCand: [], searchUrl, verified: false, needsCaptcha: false, blocked: false, dead: false, realQuality: false, viaProxy: false };
  
  // 豆花电影网：有 SHA1 计算挑战，需要破解后才能访问真实页面
  // 破解后解析真实页面的搜索结果（服务端渲染，有真实结果）
  if (site.challenge) {
    const f = await fetchWithFallback(target, proxyBase);
    if (!f.html) {
      if (f.isTimeout) return base;
      return { ...base, dead: true };
    }
    if (f.status >= 200 && f.status < 300 && f.html.includes('var hash')) {
      const challengeUrl = await solveDhvideoChallenge(f.html, target);
      if (challengeUrl) {
        const f2 = await fetchWithFallback(challengeUrl, proxyBase);
        if (f2.html && f2.status >= 200 && f2.status < 300) {
          const p = parseResultPage(f2.html, origin, kw);
          if (p.has && p.results && p.results.length > 0) {
            return p.results.map((r, idx) => ({
              ...base, id: p.results.length > 1 ? `${base.id}-${idx}` : base.id,
              quality: r.liveQuality || site.quality, qualityScore: r.liveScore || site.qualityScore,
              latency_ms: Date.now() - start, title: r.title || null, pageUrl: r.pageUrl || challengeUrl,
              poster: r.poster || null, posterCand: r.posterCand || [], verified: true,
              realQuality: !!(r.liveQuality), viaProxy: !!f2.viaProxy,
              matchScore: computeMatchScore(r.title, kw),
              _resultIdx: idx, _totalResults: p.results.length
            }));
          }
        }
      }
    }
    // 挑战破解失败或无结果，回退到普通处理
    if (f.status >= 500 && f.status < 600) return { ...base, dead: true };
    if (f.status >= 400 && f.status < 600) return { ...base, needsCaptcha: true, blocked: true };
    return { ...base };
  }
  
  // 聚合器/纯前端 SPA：无服务端搜索、无海报可解析 —— 只探测可达性，不解析片源、不提取封面
  if (site.noVerify) {
    const f = await fetchWithFallback(target, proxyBase);
    const latency = Date.now() - start;
    if (!f.html) {
      if (f.isTimeout) return { ...base, latency_ms: latency };
      return { ...base, dead: true, latency_ms: latency };
    }
    if (f.status >= 500 && f.status < 600) return { ...base, dead: true, latency_ms: latency };
    if (f.status >= 400 && f.status < 600) return { ...base, needsCaptcha: true, blocked: true, latency_ms: latency };
    return { ...base, latency_ms: latency };
  }
  
  // API 搜索站点（如黑夜影院）：HTML 是 JS 渲染的 SPA，但后端有 JSON API 返回搜索结果+海报
  if (site.apiSearch) {
    const apiUrl = buildSearchUrl(site.apiSearch, origin, kw);
    try {
      const res = await fetch(apiUrl, {
        headers: { "User-Agent": UA, "Accept": "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "follow",
      });
      if (res.ok) {
        const json = await res.json();
        // 兼容两种格式：
        //   苹果CMS: { code:1, list:[{id|url, name, pic?}] }
        //   zip0:   { success:true, data:[{title, url, year?, category?}] }
        const rawList = (json && json.list && json.list.length > 0)
          ? json.list
          : (json && json.data && json.data.length > 0)
            ? json.data
            : null;
        const okFlag = (json && json.code === 1) || (json && json.success === true);
        if (okFlag && rawList && rawList.length > 0) {
          const kwNorm = kw.replace(/\s+/g, "");
          // 匹配字段：name（苹果CMS）或 title（zip0）
          const nameOf = (item) => item.name || item.title || "";
          const matched = rawList.filter(item => nameOf(item).includes(kwNorm));
          const list = (matched.length > 0 ? matched : rawList).slice(0, 10);
          if (list.length > 0) {
            const results = list.map((item, idx) => {
              // 详情页 URL：
              //   有 item.url → 直接用（zip0 完整 URL / dbku 相对路径 / 其他自定义）
              //   有 item.id  → 拼标准苹果CMS /vod/detail/{id}.html
              let detailUrl;
              if (item.url) {
                detailUrl = item.url.startsWith("http") ? item.url : origin + item.url;
              } else if (item.id) {
                detailUrl = `${origin}/vod/detail/${item.id}.html`;
              } else {
                return null; // 既无 url 也无 id，跳过
              }
              let poster = item.pic || "";
              if (poster && poster.startsWith("/")) poster = origin + poster;
              if (poster && poster.startsWith("//")) poster = "https:" + poster;
              return {
                id: list.length > 1 ? `${base.id}-${idx}` : base.id,
                title: nameOf(item), pageUrl: detailUrl, poster: poster || null,
                posterCand: poster ? [poster] : [], _resultIdx: idx, _totalResults: list.length
              };
            }).filter(Boolean);
            // zip0 格式（success:true）API 不返回 poster，从观看页 og:image 提取
            if (json && json.success === true && results.length > 0 && !results[0].poster) {
              try {
                const html = await fetch(results[0].pageUrl, {
                  headers: { "User-Agent": UA },
                  signal: AbortSignal.timeout(5000)
                }).then(r => r.text());
                const m = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
                      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
                if (m && m[1]) {
                  const poster = m[1].replace(/^\/\//, "https://");
                  results[0].poster = poster;
                  results[0].posterCand = [poster];
                }
              } catch (_) { /* 封面抓取失败不阻塞 */ }
            }
            if (results.length > 0) {
              const first = results[0];
              return { ...base, latency_ms: Date.now() - start,
                id: base.id,
                title: first.title, pageUrl: first.pageUrl, poster: first.poster,
                posterCand: first.posterCand, verified: true, realQuality: false, results };
            }
          }
        }
      }
    } catch (e) { /* API 失败则回退到 HTML 解析 */ }
  }
  
  const f = await fetchWithFallback(target, proxyBase);
  if (!f.html) {
    if (f.isTimeout) return base;
    return { ...base, dead: true };
  }
  const html = f.html;
  const status = f.status;
  if (status >= 200 && status < 300) {
    const p = parseResultPage(html, origin, kw);
    if (p.needsCaptcha) return { ...base, latency_ms: Date.now() - start, needsCaptcha: true, blocked: !!f.viaProxy };
    if (p.has) {
      if (p.results && p.results.length > 0) {
        return p.results.map((r, idx) => ({
          ...base, id: p.results.length > 1 ? `${base.id}-${idx}` : base.id,
          quality: r.liveQuality || site.quality, qualityScore: r.liveScore || site.qualityScore,
          latency_ms: Date.now() - start, title: r.title || null, pageUrl: r.pageUrl || target,
          poster: r.poster || null, posterCand: r.posterCand || [], verified: true,
          realQuality: !!(r.liveQuality), viaProxy: !!f.viaProxy,
          matchScore: computeMatchScore(r.title, kw),
          _resultIdx: idx, _totalResults: p.results.length
        }));
      }
      return { ...base, quality: p.liveQuality || site.quality, qualityScore: p.liveScore || site.qualityScore,
        latency_ms: Date.now() - start, title: p.title || null, pageUrl: p.pageUrl || target, poster: p.poster || null,
        posterCand: p.posterCand || [], verified: true,
        realQuality: !!(p.liveQuality), viaProxy: !!f.viaProxy,
        matchScore: computeMatchScore(p.title, kw) };
    }
    return { ...base, latency_ms: Date.now() - start, title: p.title || null,
             poster: p.poster || null, posterCand: p.posterCand || [], posterGuess: !!p.posterGuess };
  }
  if (status >= 500 && status < 600) {
    return { ...base, dead: true, latency_ms: Date.now() - start };
  }
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
    const noVerifySites = new Set(SITES.filter(s => s.noVerify).map(s => s.id));
    await poolLimit(SITES, MAX_CONCURRENT, async (site) => {
      const r = await probeSite(site, kw, proxyBase);
      // 支持数组（多结果）或单对象（单结果）
      if (Array.isArray(r)) out.push(...r);
      else if (r) out.push(r);
    });
    // 分离 noVerify 站点（SPA/聚合器）和普通站点
    // noVerify 站点只探测可达性，不解析片源，所以 matchScore=0, verified=false
    // 这些站点如果可达（未 dead）应该始终显示，不受 max 限制
    const noVerifyResults = [];
    const verifiedResults = [];
    for (const r of out) {
      const baseId = r.id.replace(/-\d+$/, "");
      if (noVerifySites.has(baseId)) {
        if (!r.dead) noVerifyResults.push(r); // 只保留可达的 noVerify 站点
      } else {
        verifiedResults.push(r);
      }
    }
    // 排序：关键词匹配度 > 已验证有片源 > 延迟升序 > 画质次之
    verifiedResults.sort((a, b) =>
      ((b.matchScore || 0) - (a.matchScore || 0)) ||
      ((b.verified ? 0 : 1) - (a.verified ? 0 : 1)) ||
      ((a.needsCaptcha ? 1 : 0) - (b.needsCaptcha ? 1 : 0)) ||
      (a.latency_ms - b.latency_ms) ||
      (b.qualityScore - a.qualityScore));
    // noVerify 站点按画质排序（它们没有 matchScore）
    noVerifyResults.sort((a, b) =>
      ((a.latency_ms || 99999) - (b.latency_ms || 99999)) ||
      (b.qualityScore - a.qualityScore));
    // 合并：先放验证结果（受 max 限制），再放 noVerify 站点（不受限制）
    return [...verifiedResults.slice(0, max), ...noVerifyResults];
  }
};
