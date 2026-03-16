---
name: weblog
description: 微信公众号写作排版发布工具。支持 AI 风格写作、Markdown 渲染排版、AI 去痕、图片消息（小绿书）、AI 图片生成、一键发布草稿箱。适配 Claude Code / OpenClaw 等 AI Coding 工具。
triggers:
  - "帮我排版发布这篇文章"
  - "把 {file} 发到公众号"
  - "用 {theme} 主题渲染"
  - "渲染这篇 markdown"
  - "发布到微信公众号"
  - "帮我写一篇关于 {topic} 的文章"
  - "用 dan-koe 风格写"
  - "去除 AI 痕迹"
  - "humanize"
  - "去痕"
  - "创建小绿书"
  - "图片消息"
  - "weblog"
  - "排版公众号文章"
tools:
  - Bash
  - Read
  - Write
  - Glob
  - Edit
---

# WebLog — 微信公众号写作排版发布

## 工作目录

先定位 weblog 项目根目录（包含 `render.mjs` 的目录），所有命令在该目录下执行。

## 功能总览

| 功能 | 触发词 | 说明 |
|------|--------|------|
| **写作 (write)** | "帮我写一篇..." "用 dan-koe 风格写" | AI 风格写作，从想法生成完整文章 + 封面提示词 |
| **排版 (render)** | "帮我排版..." "渲染这篇 markdown" | Markdown → 微信兼容 HTML，3 种主题 |
| **去痕 (humanize)** | "去除 AI 痕迹" "humanize" | 检测并去除 24 种 AI 写作痕迹 |
| **发布 (publish)** | "发到公众号" "发布到草稿箱" | 上传图片 + 创建微信草稿 |
| **小绿书 (image_post)** | "创建小绿书" "图片消息" | 创建图片消息，最多 20 张 |

---

## 流程一：写作 (write)

### 触发场景
- "帮我写一篇关于 AI Agent 的文章"
- "用 dan-koe 风格写一篇关于自律的文章"
- "我有个想法：xxx，帮我扩展成文章"

### 步骤

1. **确认输入类型**，问用户提供的是哪种素材：
   - `idea` — 一个想法/观点（"我觉得自律是伪命题"）
   - `fragment` — 已有片段需要扩展
   - `outline` — 结构化大纲需要填充
   - `title` — 只有标题，从零展开

2. **选择写作风格**，当前可用：
   - `dan-koe` — 深刻犀利、哲学接地气（默认）
   - 更多风格见 `writers/` 目录

3. **读取风格模板**：
   ```bash
   cat skills/weblog/writers/dan-koe.md
   ```

4. **按风格模板生成文章**，遵循 6 步结构：
   - 钩子开头（150 字，4 种类型选一）
   - 痛点共鸣
   - 价值承诺
   - 核心内容（3-7 个模块，每个有小标题+金句+误区+真相+案例+断言）
   - 金句提取（3-5 句斜体可传播句子）
   - 赋能结尾（3 种类型选一）

5. **生成标题**（用标题公式库生成 3-5 个备选）

6. **生成封面提示词**：
   根据文章主题，生成一段适合 AI 图片生成工具（Midjourney / DALL-E）的英文提示词。
   - 风格：维多利亚木刻/蚀刻版画（Dan Koe 风格）或根据文章调性选择
   - 比例：16:9（微信封面 900×383）
   - 输出格式：`Prompt: [英文提示词]`

7. **保存文章**到 `content/` 目录为 `.md` 文件

8. **询问用户**：是否继续排版发布？如果是，进入流程二。

---

## 流程二：排版 (render)

### 触发场景
- "帮我排版发布这篇文章"
- "把 content/xxx.md 发到公众号"
- "用 grace 主题渲染这篇 markdown"

### 步骤

1. **确认 Markdown 文件**，如果用户未指定，扫描 `content/` 目录：
   ```bash
   ls content/*.md
   ```

2. **选择主题和配色**

   **主题：**
   - `default` — 经典（蓝色调，标题居中）
   - `grace` — 优雅（阴影圆角，斜体引用）
   - `simple` — 简洁（现代极简，渐变装饰）

   **推荐配色：** `#0F4C81`(蓝) `#C04851`(红) `#009B77`(绿) `#E15D44`(橙) `#6B5B95`(紫) `#1E90FF`(亮蓝)

   **代码高亮：** `github`(默认) `github-dark` `atom-one-dark` `vs2015` `monokai`

   如果用户没有偏好，使用 `-t default --code-theme github`。

3. **渲染**：
   ```bash
   node render.mjs -i <markdown_path> -t <theme> [options] --preview
   ```

   常用选项：
   ```bash
   node render.mjs -i content/article.md -t default --preview
   node render.mjs -i content/article.md -t grace --primary "#C04851" --preview
   node render.mjs -i content/article.md -t simple --indent --justify --preview
   node render.mjs -i content/article.md -t default --code-theme atom-one-dark --preview
   ```

4. **预览确认**：告知用户预览文件路径，让用户在浏览器中确认。

5. **如果满意，继续发布**（流程四）。

---

## 流程三：去痕 (humanize)

### 触发场景
- "帮我去除 AI 痕迹"
- "这篇文章 humanize 一下"
- "让这篇文章听起来更自然"

### 步骤

1. **确认文章来源**：让用户提供 Markdown 文件路径或直接粘贴文本。

2. **选择强度**：
   - `gentle` — 轻度，只改明显 AI 词汇
   - `medium` — 中度（默认），替换词汇 + 调整句式 + 删填充
   - `aggressive` — 深度，大幅重写，加入口语感

3. **读取去痕指南**：
   ```bash
   cat skills/weblog/references/humanizer-guide.md
   ```

4. **执行去痕**，按照指南中的 24 种 AI 痕迹逐一检测和修改：
   - 替换 AI 高频词汇（赋能→帮助，助力→推动，深耕→专注...）
   - 删除填充短语（"总的来说" "综上所述"）
   - 增加句长变化（打破匀速节奏）
   - 如果使用了写作风格（如 Dan Koe），保护风格特征

5. **输出 5 维评分**：

   ```
   去痕评分：
   - 直接性: X/10（直来直去 vs 绕弯子）
   - 节奏感: X/10（句长变化 vs 单调）
   - 信任度: X/10（尊重读者 vs 说教）
   - 真实感: X/10（像人写 vs 像 AI 生成）
   - 精炼度: X/10（精简 vs 冗余）
   - 总分: XX/50 — [评级]
   ```

6. **保存修改后的文章**，覆盖原文件或另存为新文件。

7. **询问用户**：是否继续排版发布？

---

## 流程四：发布 (publish)

### 触发场景
- "发布到公众号"
- "把排版好的文章发到草稿箱"

### 步骤

1. **确认 HTML 文件**（如果从流程二过来，已有文件路径）。如果没有，先生成不带 `--preview` 的 HTML：
   ```bash
   node render.mjs -i content/article.md -t default
   ```

2. **确认发布信息**：
   - 标题（≤32 字）
   - 封面图路径（推荐 900×383）
   - 作者（≤16 字，可选）
   - 摘要（≤128 字，可选）

3. **执行发布**：
   ```bash
   python3 publish.py \
     --html output/<name>.html \
     --title "<标题>" \
     --cover <封面图路径> \
     --author "<作者>" \
     --digest "<摘要>"
   ```

4. **返回结果**：`media_id` + 提示去草稿箱发布。

---

## 流程五：小绿书 (image_post)

### 触发场景
- "创建小绿书"
- "做一个图片消息"
- "用这些图片创建图文"

### 步骤

1. **确认图片来源**：
   - 直接指定图片路径（逗号分隔）
   - 从 Markdown 文件中提取图片

2. **确认信息**：
   - 标题（必填）
   - 描述文本（可选）

3. **执行创建**：
   ```bash
   python3 publish.py \
     --mode image_post \
     --title "<标题>" \
     --images "img1.jpg,img2.jpg,img3.jpg" \
     --digest "<描述>"
   ```

   或从 Markdown 提取：
   ```bash
   python3 publish.py \
     --mode image_post \
     --title "<标题>" \
     --from-markdown content/article.md
   ```

4. **返回结果**。

---

## 图片处理

- **本地图片**：放在 `images/` 目录，publish.py 自动压缩（>1920px 缩放，>1MB 降质）后上传。
- **网络图片**：直接使用 URL。
- **AI 生成图片**：在 Markdown 中使用 `![描述](__generate:英文提示词__)` 语法，publish.py 会调用 AI 图片 API 生成后上传。
- **封面图**：推荐尺寸 900×383 (2.35:1)。
- **图床**：优先腾讯云 COS（跨平台），未配置时回退微信临时素材。

## 注意事项

- 确保 `.env` 中已配置必要的环境变量（参考 `.env.example`）
- 首次运行前需安装依赖：`npm install && pip install -r requirements.txt`
- 外链在微信中不可点击，渲染引擎会自动转为脚注
- AI 图片生成需要配置 `IMAGE_API_KEY`（支持 OpenAI DALL-E 等）
