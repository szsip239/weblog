# WebLog 主题使用指南

## 三种主题对比

### default（经典）
- **风格**: 蓝色调，标题居中，经典公众号排版
- **适合**: 技术文章、教程、正式内容
- **特点**:
  - H1 居中 + 下边框
  - H2 白字蓝底居中
  - H3 左边框
  - 标准引用块样式
  - 清晰的表格边框

### grace（优雅）
- **风格**: 阴影、圆角、斜体引用，视觉层次丰富
- **适合**: 随笔、思考、观点分享
- **特点**:
  - 标题带文字阴影
  - H2 圆角 + 投影
  - H3 左边框 + 底部虚线
  - 引用块斜体 + 阴影
  - 图片圆角 + 投影
  - 表格圆角 + 投影
  - 代码块内阴影

### simple（简洁）
- **风格**: 现代极简，清新简洁
- **适合**: 日常分享、轻量内容、资讯速递
- **特点**:
  - H2 不对称圆角 (8px 24px 8px 24px)
  - H3 四面边框 + 浅底色
  - 引用块细边框
  - 图片细边框
  - 整体装饰感最少

## CSS 变量自定义

### 主色 (--primary)

| 名称 | 色值 | 适合场景 |
|------|------|----------|
| 经典蓝 | #0F4C81 | 技术、商务 |
| 中国红 | #C04851 | 节日、热点 |
| 翡翠绿 | #009B77 | 环保、健康 |
| 日落橙 | #E15D44 | 活力、创意 |
| 深紫 | #6B5B95 | 优雅、品质 |
| 森林绿 | #2E8B57 | 自然、平静 |
| 海洋蓝 | #1E90FF | 科技、未来 |
| 樱花粉 | #FFB7C5 | 温柔、生活 |

### 字体 (--font)

- 系统默认: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- 衬线体: `Georgia, 'Times New Roman', serif`
- 等宽体: `'Fira Code', Menlo, Consolas, monospace`
- 中文楷体: `楷体, KaiTi, serif`
- 中文宋体: `宋体, SimSun, serif`

### 字号 (--font-size)

- 14px: 紧凑，适合代码密集文章
- 15px: 默认，平衡阅读舒适度
- 16px: 宽松，适合纯文字内容
- 17px: 大字号，适合中老年读者
- 18px: 特大号

### 标题样式变体 (--h2-style 等)

- `default`: 使用主题默认样式
- `color-only`: 仅主题色文字，无装饰
- `border-bottom`: 下边框 + 主题色文字
- `border-left`: 左边框 + 主题色文字

## 代码高亮主题

### 浅色系
- `github` — GitHub 风格（默认推荐）
- `xcode` — Xcode 风格
- `vs` — Visual Studio 浅色

### 深色系
- `github-dark` — GitHub 深色
- `atom-one-dark` — Atom 深色（推荐）
- `vs2015` — VS Code 深色
- `monokai` — 经典 Monokai
- `dracula` — Dracula 主题

## 推荐搭配

| 文章类型 | 主题 | 主色 | 代码主题 | 额外选项 |
|----------|------|------|----------|----------|
| 技术教程 | default | #0F4C81 | github | --line-numbers |
| AI 资讯 | simple | #1E90FF | atom-one-dark | — |
| 深度思考 | grace | #6B5B95 | vs2015 | --justify |
| 工具推荐 | default | #009B77 | github | — |
| 生活随笔 | grace | #C04851 | xcode | --indent --justify |
