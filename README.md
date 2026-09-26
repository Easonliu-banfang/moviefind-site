# 🎬 3F影视 (moviefind)

聚合搜索工具：输入片名 → Cloudflare Worker 并行搜 33 个影视站 → 卡片网格展示片源 → 点击跳转播放。

> 只做聚合跳转，不存储/解析/播放片源。

---

## 线上地址

- 前端：`https://easonliu-banfang.github.io/moviefind-site/`
- Worker：`https://moviefind-search.17721266011.workers.dev`

---

## 目录结构

```
moviefind/
├── worker/src/
│   ├── search-core.mjs   # 站点数据 + 搜索/解析/判定核心
│   └── index.mjs         # Cloudflare Worker 入口（API 路由）
├── frontend/
│   ├── src/App.vue       # Vue3 主界面（搜索 + 卡片网格）
│   └── src/sites.js      # 前端站点清单（与 worker 同步）
└── .github/workflows/    # GitHub Pages 自动部署
```

---

## API 端点

| 端点 | 功能 |
|------|------|
| `GET /api/search?q=片名&max=40` | 聚合搜索，返回有片源站点（延迟升序） |
| `GET /api/img?u=图片URL` | 封面代取（击穿防盗链，带同源 Referer） |
| `GET /api/favicon?url=站点URL` | 从站点 HTML 解析真实 favicon URL |
| `GET /api/sites` | 站点清单 |
| `GET /api/probe?q=片名` | 逐站可达性诊断 |

---

## Worker 核心机制

### 有片源判定
1. HTML 含关键词 + 详情链接 ≥ 1 = 有片源
2. 标题必须含关键词（强约束，防假绿）
3. 排除空结果页 / 验证码页

### 封面提取（全部来自站点自身 HTML）
- **禁止第三方图源**（百度/Bing/DDG 一律不接）
- 从搜索结果 HTML 解析 `<img>` / `background:url()` / `data-original`
- 评分排序：片名匹配 +100，片库路径 +40，GIF 惩罚（强信号不受影响）
- 图床防盗链：Worker `/api/img` 带同源 Referer 代取
- 候选图回退：直链 → Worker 代取 → 下一候选 → 站点 favicon

### 站点特殊处理

| 站点 | 标记 | 说明 |
|------|------|------|
| 影猫仓库 (ymck) | `noVerify` | Vue SPA 聚合器，无服务端搜索，只探测可达性 |
| 黑夜影院 (darkvod) | `apiSearch` | JS 渲染 SPA，调用 `ajax/suggest` API 返回 JSON 结果+海报 |
| IFN | 特殊 GIF 处理 | 海报是 `.gif` 格式，强信号（片名匹配）时跳过 GIF 惩罚 |

### favicon 回退链
```
站点 HTML <link rel="icon"> → /favicon.ico → 渐变 monogram 大字标
```
Worker 解析站点首页 HTML 提取真实 favicon URL（路径各异，如 `/template/.../favicon.ico`、`/favicon.png`）。

---

## 前端卡片网格

```css
grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
max-width: 1600px;
```
- 宽屏自适应更多列，窄屏自动减少
- 移动端 `minmax(125px, 1fr)`，400px 以下 2 列等分
- 无边框纯阴影，hover 上浮 + ▶ 播放覆盖层
- 整卡可点击跳转

### 站点图标回退卡片（无电影封面时）
```
┌─────────────┐
│  网格纹理背景  │
│   ╭───────╮ │
│   │ favicon│ │  ← 圆形徽章（渐变描边+光晕+旋转光带）
│   ╰───────╯ │
│   站点名称   │
│   资源站     │
└─────────────┘
```

---

## 部署

### Worker
```bash
cd worker
wrangler deploy --config wrangler.toml
```

### 前端（GitHub Pages）
```bash
cd frontend
npm install
npm run build
# 推到 GitHub → Actions 自动部署
```

### 密钥配置
- `VITE_WORKER_URL` = Worker 地址

---

## 站点数据

33 站，定义在 `worker/src/search-core.mjs` 的 `SITES` 数组。

每条字段：
- `id` / `name` / `origin`：站点标识
- `quality` / `qualityScore`：画质口碑（4K=5 / 蓝光=4 / 1080P=3 / 高清=2）
- `search`：搜索 URL 模板（`{origin}` / `{kw}` 占位符）
- `templates`：验证模板候选列表
- `noVerify`：聚合器标记（只探测可达性，不解析）
- `apiSearch`：API 搜索标记（JS 渲染站点，调后端 JSON API）
- `captcha`：需人机验证
- `login`：需登录
- `ads`：含广告

---

## 已知限制

- CF 数据中心 IP 常被国内影视站封锁 → 部分站从 Worker 搜不到（前端仍显示，用户浏览器可访问）
- 画质是站点口碑级，非按片名实时判断
- 站点会失效/换域，失效站自动过滤不显示
- SPA 站（JS 渲染）需 `apiSearch` 标记才能解析结果