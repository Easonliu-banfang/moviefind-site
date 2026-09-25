#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
低频站点探测：请求每个站点首页，解析出搜索接口 URL 模板。
每站最多 1 次请求，随机间隔，携带浏览器 UA，失败即跳过，最大程度避免封 IP。

用法:
  python3 probe.py <id1> <id2> ...   # 只探测指定 id（推荐小批量先验证）
  python3 probe.py all               # 探测全部国内可直连候选
输出: data/search_config.json（只包含探测成功的站点）
"""
import json, os, random, re, sys, time, urllib.parse, urllib.request, urllib.error

BASE = os.path.dirname(os.path.abspath(__file__))
MIN_DELAY, MAX_DELAY = 2.5, 4.0   # 请求间隔秒
TIMEOUT = 6.0
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")


def http_get(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = resp.read().decode("utf-8", "ignore")
            return resp.status, resp.geturl(), (time.time() - start) * 1000, body
    except urllib.error.HTTPError as e:
        return e.code, url, (time.time() - start) * 1000, ""
    except Exception:
        return 0, url, (time.time() - start) * 1000, ""


def infer_search_url(action, origin, input_name):
    """把相对/绝对 action + input 名拼成带 {kw} 占位的搜索 URL；失败返回 None。"""
    if not action:
        return None
    if action.startswith("//"):
        action = "https:" + action
    elif action.startswith("/"):
        action = origin.rstrip("/") + action
    elif not action.startswith("http"):
        action = origin.rstrip("/") + "/" + action
    # 去掉 action 尾部锚点
    action = action.split("#")[0]
    name = input_name or "wd"
    sep = "&" if "?" in action else "?"
    kw = urllib.parse.quote("{kw}")
    return f"{action}{sep}{name}={kw}"


def parse_search_form(html):
    """从首页 HTML 提取 (action, input_name)。优先找包含搜索输入框的表单。"""
    forms = re.findall(r'<form\b[^>]*>', html, re.I)
    # 输入框: 常见 name 关键字
    inp_patterns = ['wd', 'searchword', 'keyword', 'search_text', 'key', 'search']
    for form in forms:
        action = re.search(r'action=["\']([^"\']*)["\']', form, re.I)
        action = action.group(1) if action else ""
        # 从整个 HTML 找输入框名，限定在表单之后小范围
        # 简化：用页面全局搜索较好的输入名
        for name in inp_patterns:
            if re.search(rf'name=["\']{name}["\']', html, re.I):
                return action, name
    # 兜底
    action = None
    for form in forms:
        a = re.search(r'action=["\']([^"\']*)["\']', form, re.I)
        if a:
            action = a.group(1)
            break
    return action, "wd"


def derive_search_url(html, origin):
    action, iname = parse_search_form(html)
    if iname or action:
        u = infer_search_url(action, origin, iname)
        if u:
            return u
    # 常见 MacCMS 路径兜底
    for p in ["/index.php/vod/search.html", "/vodsearch/", "/list/?keyword"]:
        if p in html.lower():
            sep = "&" if "?" in p else "?"
            kw = urllib.parse.quote("{kw}")
            name = "wd" if "search" in p else "keyword"
            return f"{origin.rstrip('/')}{p}{sep}{name}={kw}"
    return None


def load_candidates():
    raw = json.load(open(os.path.join(BASE, "raw_sites.json")))
    return [s for s in raw if not (s.get("needProxy") or "梯子" in s.get("summary_short", ""))]


def main():
    args = sys.argv[1:]
    sites = load_candidates()
    if args and args[0].lower() != "all":
        sites = [s for s in sites if s["id"] in args or s["name"] in args]
    print(f"探测 {len(sites)} 个站点（每站 1 次请求，间隔 {MIN_DELAY}-{MAX_DELAY}s）...")
    result = []
    for i, s in enumerate(sites):
        origin = s["url"].rstrip("/") + "/"
        code, final, ms, body = http_get(s["url"])
        rec = {"id": s["id"], "name": s["name"], "origin": origin,
               "http_code": code, "ttfb_ms": round(ms), "search_url": None}
        if code == 200 and body:
            rec["search_url"] = derive_search_url(body, origin)
        result.append(rec)
        flag = "OK " if rec["search_url"] else "SKIP"
        print(f"[{i+1}/{len(sites)}] {flag} {s['name']:6s} code={code} {ms:6.0f}ms  {rec['search_url']}")
        if i != len(sites) - 1:
            time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))
    ok = [r for r in result if r["search_url"]]
    json.dump(result, open(os.path.join(BASE, "search_config.json"), "w"),
              ensure_ascii=False, indent=2)
    print(f"\n完成 {len(result)} 站，解析出搜索接口 {len(ok)} 站 → data/search_config.json")


if __name__ == "__main__":
    main()