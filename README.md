# 🎬 聚合追剧 (moviefind)

一个**聚合搜索**工具：输入片名 → 后端（Cloudflare Worker / 本地代理）并行去数十个影视站搜索 → **只展示真正有片源的站**，**延迟最低排最前**，点击一键跳转该站播放页。

> 本站**只做聚合跳转**，不存储、不解析、不播放任何片源，所有内容均来自第三方站点。

---

## 工作原理

浏览器有同源策略（CORS），无法在前端直接请求第三方影视站。因此搜索逻辑放在一个轻量的**云端代理**里：

```
用户输入片名
   ↓
前端 (GitHub Pages / 本地)
   ↓  GET /api/search?q=片名
云端代理 (Cloudflare Worker 或本地 Node)
   ↓  并行请求各站搜索接口（带浏览器 UA + 超时 + 并发池）
解析每个站返回的 HTML
   ↓  判定「页面含关键词 且 详情链接数 ≥ 2」= 有片源
返回按「延迟升序 · 画质次之」排序的结果 JSON
   ↓
前端渲染卡片，点击跳转到对应站点
```

**有片源判定（双保险，最大限度防误判）**：
1. 页面必须真实包含搜索关键词（证明这页确实是该片的搜索结果）；
2. 详情链接数 ≥ 2（证明是结果列表，而非导航栏/页脚残留链接）。

**排序**：延迟从低到高；延迟相同时画质高者优先（4K > 蓝光 > 1080P > 高清）。

---

## 目录结构

```
moviefind/
├── worker/                 # 搜索代理（Cloudflare Worker 或本地 Node 通用核心）
│   ├── src/
│   │   ├── search-core.mjs # 站点数据 + 搜索/解析/判定核心逻辑
│   │   ├── index.mjs       # Cloudflare Worker 入口
│   │   └── local-dev.mjs   # 本地调试用 Node 服务（与 Worker 接口一致）
│   └── wrangler.toml       # Cloudflare Worker 配置
├── frontend/               # Vue3 + Vite 静态前端
│   ├── src/App.vue         # 搜索页主界面
│   └── .env.example        # Worker 地址配置样例
├── data/                   # 数据源与探测脚本
│   └── raw_sites.json      # 从 awesome-zhuiju-free 提取的站点元数据
└── .github/workflows/      # GitHub Pages 自动部署
```

---

## 一、本地体验（无需任何账号，5 分钟跑通）

需要 Node 18+。

```bash
# 终端1：启动本地搜索代理（默认 8787 端口）
cd worker
node local-dev.mjs
# → http://localhost:8787 已就绪

# 终端2：启动前端
cd frontend
npm install      # 首次需要
npm run dev
# → 打开 http://localhost:5173 ，即可搜索
```

前端默认连 `http://localhost:8787`（见 `frontend/.env`）。

---

## 二、部署到线上

### 1) 部署搜索代理到 Cloudflare Worker（免费）

1. 注册免费 Cloudflare 账号（无需绑卡）。
2. 安装 wrangler：`npm i -g wrangler` 并 `wrangler login`。
3. 部署：
   ```bash
   cd worker
   wrangler deploy
   ```
4. 记下你的 Worker 地址，形如 `https://moviefind-search.<你的子域>.workers.dev`。
   - **建议**：绑定一个自定义域名（Cloudflare 免费），国内访问更稳（`*.workers.dev` 偶尔需要梯子）。

> 免费额度：10 万次请求/天，对个人使用绰绰有余。一次搜索只算 1 次配额（内部并行请求不计）。

### 2) 部署前端到 GitHub Pages（免费）

1. 把这个仓库推到 GitHub（确保 `frontend/` 与 `.github/` 都在）。
2. 仓库 **Settings → Secrets and variables → Actions**，新增仓库密钥：
   - 名称：`VITE_WORKER_URL`
   - 值：上面拿到的 Worker 地址（如 `https://moviefind-search.xxx.workers.dev`）
3. 仓库 **Settings → Pages → Build and deployment → Source 选 "GitHub Actions"**。
4. 推送 `main` 分支（或手动在 Actions 里 Run workflow），自动构建并发布。
5. 访问 `https://<你的用户名>.github.io/<仓库名>/` 即可使用。

---

## 三、新增 / 调整站点

所有站点集中在 `worker/src/search-core.mjs` 的 `SITES` 数组。每条：

```js
{ id: "pianku", name: "片库", origin: "https://4k01.pianku.online",
  quality: "1080P", qualityScore: 3,
  templates: ["{origin}/vodsearch/-------------.html?wd={kw}",
              "{origin}/index.php/vod/search.html?wd={kw}"] }
```

- `origin`：站点根域名（自动去掉 `?ref=` 等参数）。
- `quality` / `qualityScore`：站点整体画质口碑（用于排序兜底，4K=5/蓝光=4/1080P=3/高清=2）。
- `templates`：搜索 URL 模板，`{origin}` 和 `{kw}` 会被替换。多数 MacCMS 站用
  `/index.php/vod/search.html?wd={kw}` 或 `/index.php?m=vod-search&wd={kw}`。
  代理会按顺序尝试，命中即返回。

新增站点后，本地 `node worker/local-dev.mjs` 即可测；Worker 重新 `wrangler deploy`。

---

## 四、已知限制

- **画质是站点口碑级**，不是按片名实时判断的（无服务器方案无法跨域读取各站结果页的具体清晰度标签，已用关键词+详情链接保证"有片源"准确）。
- **延迟是「搜索接口响应延迟」**，非视频播放延迟，但已是最接近真实的可行近似。
- 部分站点为 SPA / 非 MacCMS 模板，标准模板搜不到就**不会显示**（不会误显示），后续可单独逆向其接口补模板。
- 站点会失效/更换域名，失效的站搜索失败会被自动过滤不显示；发现新站按第三节添加即可。
