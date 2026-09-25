// 搜索核心：可被 Worker 入口或本地测试复用
// 站点数据由 awesome-zhuiju-free 仓库 resources.json 提取（在线影视·国内可直连）
export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 9000;
export const MAX_CONCURRENT = 10;
export const MAX_TEMPLATES_PER_SITE = 2;

// 人机验证 / 反爬挑战页识别（命中即标记 needsCaptcha，不强行判定有片源）
export const CAPTCHA_PATS = /验证码|人机验证|安全验证|滑动验证|点击验证|行为验证|拖动验证|完成验证|验证中心|请.*通过.*验证|verify\s+you\s+are\s+human|are\s+you\s+a\s+human|recaptcha|turnstile|cf[-_]?chl|challenge[-_]?platform|just\s+a\s+moment|checking\s+your\s+browser|security\s+check|access\s+denied|robot\s+check/i;

export const SITES = [
  { id: "sorani", name: "青空次元", origin: "https://www.sorani.net", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "appmovie", name: "APP影院", origin: "https://www.appmovie.art", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "auete-video", name: "Auete影视", origin: "https://www.aeete.com", quality: "蓝光", qualityScore: 4,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "dyrs", name: "电影人生", origin: "https://dyrs.tv", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "darkvod", name: "黑夜影院", origin: "https://darkvod.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "nivod", name: "泥视频", origin: "https://www.nivod.vip", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "ppnix", name: "PPnix", origin: "https://www.ppnix.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "duse91", name: "91毒舌", origin: "https://www.duse0.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "ifn", name: "IFN", origin: "https://ifn.watch", quality: "4K", qualityScore: 5,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "fdzys", name: "饭搭子影视", origin: "https://fdzys.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "sa-video", name: "SA视频", origin: "https://www.lsjys11.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "juok", name: "剧OK", origin: "https://juok3.top", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "dandanqi", name: "蛋蛋奇", origin: "https://www.dandanqi.cc", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "yingshidaquan", name: "影视大全", origin: "https://yingshidaquan.top", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "juzong", name: "剧踪影院", origin: "https://www.juzong01.me", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "jianyunys", name: "简云影视", origin: "https://jianyunys.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "pianku", name: "片库", origin: "https://4k01.pianku.online", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/vodsearch/-------------.html?wd={kw}", "{origin}/index.php/vod/search.html?wd={kw}"] },
  { id: "66-dapianwang", name: "66 大片网", origin: "https://www.77dpw.vip", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "xhkan", name: "星河影视", origin: "https://www.xhkan.top", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "didahd", name: "嘀嗒影视", origin: "https://www.didahd.xyz", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "zhuiying", name: "追影", origin: "https://zhuiying3.cc", quality: "蓝光", qualityScore: 4,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "wbbb", name: "歪比巴卜", origin: "https://wbbb1.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "kxyy", name: "开心影院", origin: "https://www.kxyy1.cc", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "dhvideo", name: "豆花电影网", origin: "https://dhvideo.cc", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "zip0", name: "ZIP0", origin: "https://zip0.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "103-39-111-180-29", name: "可可影视", origin: "https://www.kkys14.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "sotvla", name: "搜TV啦", origin: "https://www.sotvla.cc", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "libvio", name: "LIBVIO", origin: "https://libviobd.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "dbku", name: "独播库", origin: "https://www.dbku.tv", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "bubu-zhuiju", name: "布布追剧", origin: "https://bubuzhuiju.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "yingmao-cangku", name: "影猫仓库", origin: "https://www.ymck.pro", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "guangsu-yingshi", name: "光速影视", origin: "https://www.yingshiso.link", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "naifei-fyi-19", name: "奈飞工厂", origin: "https://naifei.fyi", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "zndy", name: "宅男影视", origin: "https://zndy.top", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "aipan-me-25", name: "爱盼", origin: "https://www.aipan.me", quality: "4K", qualityScore: 5,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "skr-skr1-cc-9", name: "樱之空", origin: "https://skr.skr1.cc:666", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "czzymovie", name: "厂长资源", origin: "https://www.czzymovie.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
  { id: "aikanbot", name: "爱看机器人", origin: "https://www1.aikanbot.com", quality: "1080P", qualityScore: 3,
    templates: ["{origin}/index.php/vod/search.html?wd={kw}", "{origin}/index.php?m=vod-search&wd={kw}"] },
];

// 把相对详情path转绝对URL
function abs(path, origin) {
  if (!path) return null;
  if (/^https?:/i.test(path)) return path;
  if (path.startsWith("//")) return "https:" + path;
  return origin.replace(/\/+$/, "") + (path.startsWith("/") ? path : "/" + path);
}

// 从HTML解析: has / title / pageUrl / liveQuality / liveScore / needsCaptcha
// 判定策略（双保险，最大限度避免误判）：
//   1) 页面必须真实包含搜索关键词 —— 证明这页确实是关于该片的搜索结果；
//   2) 详情链接(detail/voddetail/vodshort/play)数 >= 2 —— 证明是结果列表而非导航栏/页脚残留。
export function parseResultPage(html, origin, kw) {
  const emptyPats = /没有找到|没有相关|暂无.*结果|搜索不到|没有您要找|抱歉.*没有|not\s*found|暂无该|查无此|未找到相关/i;

  // 人机验证 / 反爬挑战页：能打开但被拦截，无法确认片源，单独标记（不计入有片源）
  if (CAPTCHA_PATS.test(html)) return { has: false, needsCaptcha: true, captcha: true, pageUrl: null, title: null };

  if (emptyPats.test(html)) return { has: false, needsCaptcha: false };

  // 关键词必须命中（去掉空格做容错，如「流浪地球 2」与「流浪地球2」）
  const kwNorm = (kw || "").replace(/\s+/g, "");
  const hitKw = kwNorm && (html.includes(kw) || html.includes(kwNorm) ||
    html.replace(/&nbsp;|&#?\w+;/g, "").includes(kwNorm) ||
    html.replace(/<[^>]+>/g, "").includes(kwNorm));
  if (!hitKw) return { has: false, needsCaptcha: false };

  const detailRe = /href="[^"]*?(?:voddetail|vodshort|detail|play)\/[^"]*\.html?"/gi;
  const detailMatches = html.match(detailRe) || [];
  const detailCount = detailMatches.length;
  // 取第一个详情链接作为跳转目标，并抓取链接文字作为片名（比 h2-h4 更准）
  const firstM = html.match(/href="([^"]*?(?:voddetail|vodshort|detail|play)\/[^"]*\.html?)"/i);
  const detailPath = firstM ? firstM[1] : null;
  const titleM = html.match(/<a[^>]*href="[^"]*?(?:voddetail|vodshort|detail|play)\/[^"]*\.html?"[^>]*>\s*([^<]{2,40}?)\s*<\/a>/i);
  let title = titleM ? titleM[1].trim() : null;

  // 兜底标题：结果页的 h2-h4
  if (!title) {
    const hM = html.match(/<h[2-4][^>]*>\s*([^<]{2,60}?)\s*<\/h[2-4]>/i);
    if (hM) title = hM[1].trim();
  }

  // 画质标签
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

  const hasIndex = detailCount >= 2;
  return { has: hasIndex, title, detailPath, liveQuality, liveScore,
           pageUrl: detailPath ? abs(detailPath, origin) : null, needsCaptcha: false, detailCount };
}

// 诊断用：返回单站可达性详情（不严格判定，只看能否拿到含关键词的页面）
export async function probeSiteDebug(site, kw) {
  const origin = site.origin;
  const tpl = (site.templates[0] || "").replace("{origin}", origin).replace("{kw}", encodeURIComponent(kw));
  const start = Date.now();
  try {
    const res = await fetch(tpl, {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "zh-CN" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: "follow",
    });
    const latency = Date.now() - start;
    const html = await res.text();
    const parsed = parseResultPage(html, origin, kw);
    const detailRe = /href="[^"]*?(?:voddetail|vodshort|detail|play)\/[^"]*\.html?"/gi;
    const detailCount = (html.match(detailRe) || []).length;
    return { name: site.name, origin, status: res.status, ok: true, latency,
             has: parsed.has, needsCaptcha: !!parsed.needsCaptcha, kwInHtml: html.includes(kw),
             detailCount, len: html.length, searchUrl: tpl, tpl };
  } catch (e) {
    return { name: site.name, origin, ok: false, error: String(e).slice(0, 60), latency: Date.now() - start, searchUrl: tpl, tpl };
  }
}

// 逐个模板探测一个站
export async function probeSite(site, kw) {
  const origin = site.origin;
  // 主搜索页 URL（已带关键词）—— 前端点击跳转的目标，保证「跳到已搜关键词的页面」
  const searchUrl = (site.templates[0] || "").replace("{origin}", origin).replace("{kw}", encodeURIComponent(kw));
  let captchaSeen = false;
  for (const tpl of site.templates.slice(0, MAX_TEMPLATES_PER_SITE)) {
    const target = tpl.replace("{origin}", origin).replace("{kw}", encodeURIComponent(kw));
    const start = Date.now();
    let res;
    try {
      res = await fetch(target, {
        headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "zh-CN" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "follow",
      });
    } catch { continue; }
    const latency = Date.now() - start;
    if (!res || !res.ok || res.status >= 400) continue;
    const html = await res.text();
    const parsed = parseResultPage(html, origin, kw);
    if (parsed.needsCaptcha) { captchaSeen = true; continue; } // 换模板再试，仍可能被拦
    if (!parsed.has) continue;
    return {
      id: site.id, name: site.name, origin, quality: parsed.liveQuality || site.quality,
      qualityScore: parsed.liveScore || site.qualityScore,
      latency_ms: latency, title: parsed.title || null,
      pageUrl: parsed.pageUrl || target, searchUrl, needsCaptcha: false,
    };
  }
  // 多个模板都撞上人机验证 → 仍返回该站（排末尾、标需验证），让用户在浏览器里过验证
  if (captchaSeen) {
    return {
      id: site.id, name: site.name, origin, quality: site.quality,
      qualityScore: site.qualityScore, latency_ms: 0, title: null,
      pageUrl: null, searchUrl, needsCaptcha: true,
    };
  }
  return null;
}

// 通用并发限制
export async function poolLimit(items, limit, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx]); } catch {} } };
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export const run = {
  async search(kw, max = 8) {
    const out = [];
    await poolLimit(SITES, MAX_CONCURRENT, async (site) => {
      const r = await probeSite(site, kw);
      if (r) out.push(r);
    });
    // 排序：先正常有片源（延迟升序、画质次之），人机验证站统一排末尾
    out.sort((a, b) =>
      ((a.needsCaptcha ? 1 : 0) - (b.needsCaptcha ? 1 : 0)) ||
      (a.latency_ms - b.latency_ms) ||
      (b.qualityScore - a.qualityScore));
    return out.slice(0, max);
  }
};
