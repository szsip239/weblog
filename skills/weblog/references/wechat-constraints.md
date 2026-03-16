# 微信公众号 HTML 约束文档

## 渲染引擎已处理的约束

以下约束已在 render.mjs 中自动处理，无需手动关注：

### CSS 内联化
- 微信会**剥离所有 `<style>` 标签**
- 解决方案: juice 将 CSS 内联到 `style` 属性

### CSS 变量
- 微信不支持 `var(--name)` 语法
- 解决方案: PostCSS 在渲染阶段将变量替换为具体值

### calc() 表达式
- 微信对 `calc()` 支持不完整
- 解决方案: PostCSS 在渲染阶段计算为具体值

### 外链过滤
- 微信过滤**非 mp.weixin.qq.com 域名**的 `<a href>`
- 解决方案: 非微信链接自动转为脚注 `[N]`

### 代码高亮
- 微信不支持依赖 `class` 的语法高亮
- 解决方案: highlight.js 样式通过 juice 内联到每个 `<span>`

### 列表样式
- 微信可能剥离 `list-style` 相关 CSS
- 解决方案: 渲染器直接输出文本前缀（`1.` / `•`）

### 空格保留
- 微信会合并连续空格
- 解决方案: 代码块中空格转为 `&nbsp;`

## 发布时需注意的约束

### 图片
- **格式**: 仅支持 JPG、PNG
- **大小**: 单张 ≤ 1MB（内容图）
- **封面尺寸**: 推荐 900×383 (2.35:1)
- **本地图片**: publish.py 自动上传并替换 URL
- **GIF**: 支持，但建议 ≤ 2MB

### 文章字段
- **标题**: ≤ 32 个字符
- **作者**: ≤ 16 个字符
- **摘要**: ≤ 128 个字符
- **正文**: ≤ 2 万字符（HTML 源码）

### 不支持的 CSS 属性
以下属性在微信中**无效或行为异常**：
- `position: fixed/absolute/sticky`
- `float`
- `@media` 查询
- `@font-face` 自定义字体
- `@keyframes` 动画
- `transform` 中使用 `%` 单位
- `backdrop-filter`
- `clip-path`

### 安全的 CSS 属性
以下属性在微信中**可靠工作**：
- `color`, `background-color`, `background`
- `font-size`, `font-weight`, `font-family`, `font-style`
- `margin`, `padding`, `border`
- `border-radius`, `box-shadow`, `text-shadow`
- `text-align`, `text-indent`, `letter-spacing`, `line-height`
- `display: block/inline/flex/table`
- `max-width`, `width`, `height`
- `overflow: auto/hidden`
- `opacity`
- `linear-gradient()` (用在 background 中)

### 安全的 HTML 标签
- 块级: `section`, `div`, `p`, `h1`-`h6`, `blockquote`, `pre`, `table`, `ul`, `ol`, `li`, `figure`, `figcaption`, `hr`
- 行内: `span`, `a`, `strong`, `em`, `code`, `sup`, `sub`, `br`, `img`
- SVG: `svg`, `path`, `ellipse`（用于图标和装饰）

### 不支持的 HTML
- `<iframe>`, `<video>`, `<audio>`（需要用微信自有的素材系统）
- `<script>`, `<link>`
- `<form>` 及表单元素
- `data-*` 属性（部分被过滤）
