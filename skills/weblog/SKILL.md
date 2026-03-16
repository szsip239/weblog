---
name: weblog
description: 微信公众号文章排版发布工具。将 Markdown 渲染为微信兼容 HTML 并一键发布到草稿箱。支持 3 种 doocs/md 主题、自定义配色字体、90+ 代码高亮主题、GFM Alert。适配 Claude Code / OpenClaw 等 AI Coding 工具。
triggers:
  - "帮我排版发布这篇文章"
  - "把 {file} 发到公众号"
  - "用 {theme} 主题渲染"
  - "渲染这篇 markdown"
  - "发布到微信公众号"
  - "weblog"
  - "排版公众号文章"
tools:
  - Bash
  - Read
  - Write
  - Glob
  - Edit
---

# WebLog — 微信公众号排版发布

## 工作目录

先用 `find` 或 `which` 定位 weblog 项目根目录（包含 `render.mjs` 的目录），所有命令在该目录下执行。

## 工作流程

### 1. 确认 Markdown 文件

如果用户未指定文件，扫描 `content/` 目录：
```bash
ls content/*.md
```

### 2. 选择主题和配色

向用户展示可用选项：

**主题：**
- `default` — 经典（蓝色调，标题居中）
- `grace` — 优雅（阴影圆角，斜体引用）
- `simple` — 简洁（现代极简，渐变装饰）

**推荐配色方案：**
- 经典蓝 `#0F4C81`（默认）
- 中国红 `#C04851`
- 翡翠绿 `#009B77`
- 日落橙 `#E15D44`
- 深紫 `#6B5B95`
- 海洋蓝 `#1E90FF`

**代码高亮主题：**
- `github`（默认，浅色）
- `github-dark`
- `atom-one-dark`
- `vs2015`
- `monokai`

如果用户没有特别偏好，使用默认配置：`-t default --code-theme github`

### 3. 渲染

```bash
node render.mjs -i <markdown_path> -t <theme> [options] --preview
```

常用选项组合：
```bash
# 默认配置
node render.mjs -i content/article.md -t default --preview

# 自定义配色 + 优雅主题
node render.mjs -i content/article.md -t grace --primary "#C04851" --font "Georgia, serif" --preview

# 简洁主题 + 段落缩进
node render.mjs -i content/article.md -t simple --indent --justify --preview

# 深色代码主题
node render.mjs -i content/article.md -t default --code-theme atom-one-dark --preview
```

### 4. 预览确认

渲染后告知用户预览文件路径，让用户在浏览器中确认排版效果：
```
预览文件已生成: output/<name>.preview.html
请在浏览器中打开确认排版效果。
```

如果用户要求调整，修改参数后重新渲染。

### 5. 发布到草稿箱

用户确认后，执行发布：
```bash
python3 publish.py \
  --html output/<name>.html \
  --title "<标题>" \
  --cover <封面图路径> \
  --author "<作者>" \
  --digest "<摘要>"
```

注意：
- 发布前需要先生成不带 `--preview` 的 HTML（纯内容，无预览外壳）
- 封面图推荐尺寸 900×383
- 标题 ≤32 字，作者 ≤16 字，摘要 ≤128 字

### 6. 完成

返回草稿 `media_id`，提示用户：
```
文章已上传到草稿箱！
请前往 微信公众号后台 → 草稿箱 查看并发布。
```

## 图片处理

- **本地图片**：放在 `images/` 目录，在 markdown 中用相对路径引用。publish.py 自动上传到腾讯云 COS 并替换为 CDN URL。
- **网络图片**：直接使用 URL，publish.py 保持不变。
- **封面图**：需要单独准备，推荐尺寸 900×383 (2.35:1)。同时上传到 COS（跨平台用）和微信素材（草稿用）。
- **图床**：腾讯云 COS，路径 `{COS_PREFIX}/{hash}_{filename}`，URL 可跨平台复用。

## 注意事项

- 确保 `.env` 中已配置所有必要的环境变量（参考 `.env.example`）
- 首次运行前需安装依赖：`npm install && pip install -r requirements.txt`
- 外链在微信中不可点击，渲染引擎会自动将外链转为脚注
