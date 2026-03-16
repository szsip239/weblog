# WebLog

**用 Markdown 写公众号文章，用 AI Coding 工具一句话完成写作、排版、去痕、发布。**

AI 风格写作 + doocs/md 专业排版 + AI 去痕 + 一键发布草稿箱。搭配内置 Skill，在 Claude Code / OpenClaw 等 AI Coding 工具中自然语言驱动全流程。

<p align="center">
  <img src="images/theme-showcase.gif" alt="主题展示" width="400">
</p>

## 这是什么？

| 你是... | 痛点 | WebLog 怎么帮你 |
|---------|------|----------------|
| 公众号日更作者 | 每次手动排版耗时 | Markdown 写完，一条命令专业排版 |
| 写作小白 | 不知道怎么写出好文章 | AI 风格写作，从一个想法生成完整文章 |
| AI 写作用户 | 文章一看就是 AI 写的 | AI 去痕，24 种痕迹检测 + 5 维评分 |
| 跨平台发布者 | 图片在不同平台要不同 URL | COS 图床一次上传，URL 全平台通用 |
| 技术博主 | 代码块在微信里样式丢失 | 90+ 代码高亮主题，全部内联样式 |
| 图片内容创作者 | 想发图片消息（小绿书） | 小绿书模式，最多 20 张图 |

## 六大核心功能

| 功能 | 命令 | 说明 | 适合谁 |
|------|------|------|--------|
| **风格写作** | `write` | AI 辅助写作，从想法生成文章 + 封面提示词 | 写作小白、内容创作者 |
| **Markdown 排版** | `render` | 3 种 doocs/md 主题，CSS 变量自定义，90+ 代码高亮 | 所有用户 |
| **AI 去痕** | `humanize` | 检测 24 种 AI 痕迹，3 种强度，5 维评分 | AI 写作用户 |
| **草稿发布** | `publish` | 图片压缩 + COS/微信上传 + 一键推送草稿箱 | 需要发布的用户 |
| **小绿书** | `image_post` | 图片消息，最多 20 张，从 MD 提取或手动指定 | 图片内容创作者 |
| **AI 图片生成** | `generate` | Markdown 中 `![alt](__generate:prompt__)` 语法 | 需要配图的用户 |

### write 与 render 的区别

| 对比项 | write（写作） | render（排版） |
|--------|--------------|---------------|
| 输入 | 一个想法/片段/大纲 | 完整的 Markdown 文件 |
| 输出 | 结构化的 Markdown 文章 | 微信兼容 HTML |
| 用途 | 从零创作内容 | 格式转换已有内容 |
| 封面 | 自动生成封面提示词 | 需手动指定封面图 |

## 特性详情

- **3 种排版主题** — 经典 (default)、优雅 (grace)、简洁 (simple)，移植自 doocs/md
- **自定义配色** — 8 种预设色 + 任意 HEX 色值 + 字体/字号/标题样式
- **代码高亮** — highlight.js 90+ 主题，内联样式输出
- **GFM Alert** — `[!TIP]` `[!WARNING]` 等 20+ 类型，带 SVG 图标
- **扩展语法** — `==高亮==` `++下划线++` `~波浪线~` 脚注
- **微信全兼容** — CSS 变量解析 + calc 计算 + juice 内联 + 外链转脚注
- **图片压缩** — 上传前自动缩放（>1920px）和降质（>1MB）
- **AI 图片生成** — Markdown 中 `![alt](__generate:prompt__)` 自动生成
- **图床可选** — 腾讯云 COS（跨平台）或微信自带（零配置）
- **本地预览** — 375px 手机模拟框，浏览器直接查看

## 主题预览

| default（经典） | grace（优雅） | simple（简洁） |
|:---:|:---:|:---:|
| 蓝色调，标题居中 | 阴影圆角，斜体引用 | 现代极简，渐变装饰 |
| 技术文章、教程 | 随笔、观点分享 | 资讯速递、日常分享 |

> 每种主题都支持自定义主色、字体、字号、标题样式，实际视觉组合远超 3 种。运行 `node render.mjs -i content/example.md -t <theme> --preview` 即可在浏览器中查看效果。

## 快速开始

### 1. 安装

```bash
git clone https://github.com/szsip239/weblog-skills.git
cd weblog
npm install
pip install -r requirements.txt
```

### 2. 配置

```bash
cp .env.example .env
```

编辑 `.env`，填入微信公众号凭证（必填）。腾讯云 COS 为可选配置。

### 3. 渲染 + 预览

```bash
node render.mjs -i content/example.md -t default --preview
# 在浏览器打开 output/example.preview.html 查看效果
```

### 4. 发布到草稿箱

```bash
# 生成发布用 HTML（不带预览外壳）
node render.mjs -i content/example.md -t default

# 发布
python3 publish.py --html output/example.html --title "文章标题" --cover images/cover.png
```

## 渲染引擎 CLI

```bash
# 自定义配色 + 字体
node render.mjs -i article.md -t grace --primary "#C04851" --font "Georgia, serif"

# 深色代码主题 + 行号
node render.mjs -i article.md -t default --code-theme atom-one-dark --line-numbers

# 段落缩进 + 两端对齐
node render.mjs -i article.md -t simple --indent --justify

# 标题样式覆盖
node render.mjs -i article.md -t default --h2-style border-left --h3-style color-only

# 查看可用主题
node render.mjs --list-themes
```

## 搭配 AI Coding 工具使用（推荐）

WebLog 内置了一个 Skill 定义，可以安装到支持 Skill/插件 的 AI Coding 工具中，通过自然语言完成排版发布。

### 前置条件

1. 先完成上面的「安装」和「配置」步骤
2. 确保 `node render.mjs` 和 `python3 publish.py` 能正常运行

### 安装 Skill

**Claude Code：**
```bash
# 复制到全局 skills 目录
cp -r skills/weblog ~/.claude/skills/weblog

# 或复制到项目级 skills 目录
cp -r skills/weblog <your-project>/.claude/skills/weblog
```

**OpenClaw：**
```bash
# 复制到 OpenClaw skills 目录
cp -r skills/weblog ~/.openclaw/skills/weblog
```

**其他 AI Coding 工具：**

将 `skills/weblog/` 目录复制到对应工具的 skills/plugins 目录即可。Skill 定义遵循通用的 Markdown frontmatter 格式，大多数支持 Skill 的工具都能识别。

### 使用

安装后，在 AI 对话中直接说：

- **"帮我排版发布这篇文章"**
- **"把 content/xxx.md 发到公众号"**
- **"用 grace 主题渲染这篇 markdown"**
- **"排版公众号文章"**

AI 会自动引导你选择主题配色 → 渲染预览 → 确认发布。

## 架构

```
想法 / 片段 / 大纲
    ↓  (Skill: write + humanize)
AI 风格写作 → AI 去痕 → Markdown 文件
    ↓
render.mjs (Node.js)
    ├── marked@17 自定义 renderer
    ├── highlight.js@11 代码高亮
    ├── PostCSS (CSS 变量 → 具体值)
    ├── juice (CSS → 内联 style 属性)
    └── DOMPurify (HTML 安全过滤)
    ↓
微信兼容 HTML (所有样式内联)
    ↓
publish.py (Python)
    ├── AI 图片生成 (__generate:prompt__)
    ├── 图片压缩 (>1920px / >1MB)
    ├── 腾讯云 COS / 微信临时素材 (图床)
    ├── 微信素材 API (封面图 → media_id)
    └── 微信草稿 API / 小绿书
    ↓
微信公众号草稿箱
```

## 配置说明

复制 `.env.example` 为 `.env`，填入配置：

**必填（微信发布）：**

| 变量 | 说明 | 获取方式 |
|------|------|----------|
| `WECHAT_APPID` | 公众号 AppID | [微信公众平台](https://mp.weixin.qq.com) → 开发 → 基本配置 |
| `WECHAT_SECRET` | 公众号 AppSecret | 同上 |

**可选（腾讯云 COS 图床）：**

不配置时图片通过微信临时素材上传（仅微信可用）。配置后图片上传到 COS，URL 可跨平台复用。

| 变量 | 说明 |
|------|------|
| `COS_SECRET_ID` | 腾讯云 SecretId |
| `COS_SECRET_KEY` | 腾讯云 SecretKey |
| `COS_BUCKET` | COS 存储桶名 |
| `COS_REGION` | COS 地域，如 `ap-guangzhou` |
| `COS_PREFIX` | 图片路径前缀，默认 `article` |

使用 COS 还需安装 SDK：`pip install cos-python-sdk-v5`

**可选（AI 图片生成）：**

在 Markdown 中使用 `![描述](__generate:英文提示词__)` 语法，发布时自动调用 AI 生成图片。

| 变量 | 说明 |
|------|------|
| `IMAGE_API_KEY` | OpenAI API Key 或兼容 API |
| `IMAGE_API_BASE` | API 地址，默认 `https://api.openai.com/v1` |
| `IMAGE_MODEL` | 模型名，默认 `dall-e-3` |
| `IMAGE_SIZE` | 图片尺寸，默认 `1792x1024` |

## 致谢

- [doocs/md](https://github.com/doocs/md) — 排版引擎、CSS 主题、marked 自定义渲染器
- [marked](https://github.com/markedjs/marked) — Markdown 解析
- [highlight.js](https://github.com/highlightjs/highlight.js) — 代码语法高亮
- [juice](https://github.com/Automattic/juice) — CSS 内联化

## License

MIT
