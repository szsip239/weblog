# WebLog

微信公众号 AI 写作发布工具。Markdown → 专业排版 HTML → 一键发布到草稿箱。

基于 [doocs/md](https://github.com/doocs/md) 排版引擎移植，支持 3 种主题、自定义配色字体、代码高亮、GFM Alert，输出微信兼容的内联样式 HTML。

## 特性

- **3 种主题** — 经典 (default)、优雅 (grace)、简洁 (simple)
- **自定义配色** — 8 种预设色 + 任意 HEX 色值
- **代码高亮** — highlight.js 90+ 主题，内联样式输出
- **GFM Alert** — `[!TIP]` `[!WARNING]` 等 20+ 类型，带 SVG 图标
- **扩展语法** — `==高亮==` `++下划线++` `~波浪线~` 脚注
- **微信兼容** — CSS 变量解析、calc 计算、juice 内联、外链转脚注
- **图床可选** — 腾讯云 COS（跨平台复用）或微信自带（零配置）
- **本地预览** — 375px 手机模拟框，浏览器直接查看
- **Claude Code Skill** — 自然语言触发排版发布流程

## 快速开始

```bash
# 克隆项目
git clone https://github.com/szsip239/weblog.git
cd weblog

# 安装依赖
npm install
pip install -r requirements.txt

# 配置凭证
cp .env.example .env
# 编辑 .env 填入微信 AppID/Secret（必填），COS 密钥（可选）

# 渲染 + 预览
node render.mjs -i content/example.md -t default --preview

# 发布到微信草稿箱
python3 publish.py --html output/example.html --title "文章标题" --cover images/cover.png
```

## 渲染引擎 CLI

```bash
# 基础渲染
node render.mjs -i article.md -t default -o output/article.html

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

# 本地预览
node render.mjs -i article.md -t default --preview
```

## 主题预览

| 主题 | 风格 | 适合场景 |
|------|------|----------|
| `default` | 蓝色调、标题居中、经典公众号 | 技术文章、教程 |
| `grace` | 阴影圆角、斜体引用、优雅 | 随笔、观点分享 |
| `simple` | 现代极简、渐变装饰 | 资讯速递、日常分享 |

## 架构

```
Markdown 文件
    ↓
render.mjs (Node.js)
    ├── marked@17 自定义 renderer
    ├── highlight.js@11 代码高亮
    ├── PostCSS (CSS 变量 → 具体值)
    ├── juice (CSS → 内联 style)
    └── DOMPurify (HTML 安全过滤)
    ↓
微信兼容 HTML (所有样式内联)
    ↓
publish.py (Python)
    ├── 腾讯云 COS (可选，跨平台图床)
    ├── 微信素材 API (封面图 + 回退图床)
    └── 微信草稿 API (创建草稿)
    ↓
微信公众号草稿箱
```

## 配置

复制 `.env.example` 为 `.env`，填入：

**必填（微信发布）：**

| 变量 | 说明 | 获取方式 |
|------|------|----------|
| `WECHAT_APPID` | 公众号 AppID | 微信公众平台 → 开发 → 基本配置 |
| `WECHAT_SECRET` | 公众号 AppSecret | 同上 |

**可选（腾讯云 COS 图床）：**

不配置时图片通过微信临时素材上传，仅微信可用。配置后图片上传到 COS，URL 可跨平台复用。

| 变量 | 说明 | 获取方式 |
|------|------|----------|
| `COS_SECRET_ID` | 腾讯云 SecretId | 腾讯云控制台 → 访问密钥 |
| `COS_SECRET_KEY` | 腾讯云 SecretKey | 同上 |
| `COS_BUCKET` | COS 存储桶名 | 腾讯云 COS 控制台 |
| `COS_REGION` | COS 地域 | 如 `ap-guangzhou` |
| `COS_PREFIX` | 图片路径前缀 | 默认 `article` |

使用 COS 还需安装 SDK：`pip install cos-python-sdk-v5`

## Claude Code Skill

本项目包含一个 Claude Code Skill，可通过自然语言触发排版发布流程。

### 安装

将 `skills/weblog/` 目录复制到你的 Claude Code skills 目录：

```bash
# 方式一：复制到全局 skills 目录
cp -r skills/weblog ~/.claude/skills/weblog

# 方式二：复制到项目级 skills 目录
cp -r skills/weblog <your-project>/.claude/skills/weblog
```

### 使用

在 Claude Code 对话中直接说：

- **"帮我排版发布这篇文章"**
- **"把 content/xxx.md 发到公众号"**
- **"用 grace 主题渲染这篇 markdown"**
- **"排版公众号文章"**

Skill 会自动引导你选择主题配色、生成预览、确认后发布到草稿箱。

## 致谢

- [doocs/md](https://github.com/doocs/md) — 排版引擎、CSS 主题、marked 自定义渲染器
- [marked](https://github.com/markedjs/marked) — Markdown 解析
- [highlight.js](https://github.com/highlightjs/highlight.js) — 代码语法高亮
- [juice](https://github.com/Automattic/juice) — CSS 内联化

## License

MIT
