#!/usr/bin/env node

/**
 * WebLog 渲染引擎
 * 移植自 doocs/md 完整渲染管线，适配 Node.js + 微信公众号
 *
 * 管线: Markdown → marked.parse() → PostCSS → juice → DOMPurify → HTML
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname, join, basename } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { marked } from 'marked'
import hljs from 'highlight.js'
import postcss from 'postcss'
import postcssCustomProperties from 'postcss-custom-properties'
import postcssCalc from 'postcss-calc'
import juice from 'juice'
import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)

// ── DOMPurify setup ──────────────────────────────────
const window = new JSDOM('').window
const DOMPurify = createDOMPurify(window)

// ══════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════

const THEMES = {
  default: { name: '经典', desc: '蓝色调，标题居中，经典公众号风格' },
  grace:   { name: '优雅', desc: '阴影圆角斜体引用，优雅视觉效果' },
  simple:  { name: '简洁', desc: '现代极简设计，渐变装饰' },
}

const DEFAULTS = {
  primaryColor: '#0F4C81',
  fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif`,
  fontSize: '15px',
  textColor: '#333333',
  blockquoteBg: 'rgba(0, 0, 0, 0.03)',
}

const macCodeSvg = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" x="0px" y="0px" width="45px" height="13px" viewBox="0 0 450 130"><ellipse cx="50" cy="65" rx="50" ry="52" stroke="rgb(220,60,54)" stroke-width="2" fill="rgb(237,108,96)"/><ellipse cx="225" cy="65" rx="50" ry="52" stroke="rgb(218,151,33)" stroke-width="2" fill="rgb(247,193,81)"/><ellipse cx="400" cy="65" rx="50" ry="52" stroke="rgb(27,161,37)" stroke-width="2" fill="rgb(100,200,86)"/></svg>`

// ══════════════════════════════════════════════════════
// CLI Argument Parsing
// ══════════════════════════════════════════════════════

function parseArgs(argv) {
  const args = argv.slice(2)
  const opts = {
    input: null, output: null, theme: 'default',
    primary: null, font: null, fontSize: null,
    codeTheme: 'github', indent: false, justify: false,
    preview: false, listThemes: false, macCode: true,
    lineNumbers: false, citeStatus: true, headingStyles: {},
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i], next = () => args[++i]
    switch (arg) {
      case '-i': case '--input':      opts.input = next(); break
      case '-o': case '--output':     opts.output = next(); break
      case '-t': case '--theme':      opts.theme = next(); break
      case '--primary':               opts.primary = next(); break
      case '--font':                  opts.font = next(); break
      case '--font-size':             opts.fontSize = next(); break
      case '--code-theme':            opts.codeTheme = next(); break
      case '--indent':                opts.indent = true; break
      case '--justify':               opts.justify = true; break
      case '--preview':               opts.preview = true; break
      case '--list-themes':           opts.listThemes = true; break
      case '--no-mac-code':           opts.macCode = false; break
      case '--line-numbers':          opts.lineNumbers = true; break
      case '--no-cite':               opts.citeStatus = false; break
      case '--h1-style':              opts.headingStyles.h1 = next(); break
      case '--h2-style':              opts.headingStyles.h2 = next(); break
      case '--h3-style':              opts.headingStyles.h3 = next(); break
      case '--h4-style':              opts.headingStyles.h4 = next(); break
      case '--h5-style':              opts.headingStyles.h5 = next(); break
      case '--h6-style':              opts.headingStyles.h6 = next(); break
      default:
        if (!arg.startsWith('-') && !opts.input) opts.input = arg
    }
  }
  return opts
}

// ══════════════════════════════════════════════════════
// Front-matter Parser
// ══════════════════════════════════════════════════════

function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { meta: {}, content }
  const meta = {}
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':')
    if (idx > 0) {
      const key = line.slice(0, idx).trim()
      const val = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
      meta[key] = val
    }
  })
  return { meta, content: match[2] }
}

// ══════════════════════════════════════════════════════
// Code Formatting (ported from doocs/md languages.ts)
// ══════════════════════════════════════════════════════

function formatHighlightedCode(html, preserveNewlines = false) {
  let f = html
  // Move spaces between spans inside the second span
  f = f.replace(/(<span[^>]*>[^<]*<\/span>)(\s+)(<span[^>]*>[^<]*<\/span>)/g,
    (_, s1, sp, s2) => s1 + s2.replace(/^(<span[^>]*>)/, `$1${sp}`))
  f = f.replace(/(\s+)(<span[^>]*>)/g,
    (_, sp, s) => s.replace(/^(<span[^>]*>)/, `$1${sp}`))
  // Tabs → 4 spaces
  f = f.replace(/\t/g, '    ')

  if (preserveNewlines) {
    f = f.replace(/\r\n/g, '<br/>').replace(/\n/g, '<br/>')
      .replace(/(>[^<]+)|(^[^<]+)/g, s => s.replace(/\s/g, '&nbsp;'))
  } else {
    f = f.replace(/(>[^<]+)|(^[^<]+)/g, s => s.replace(/\s/g, '&nbsp;'))
  }
  return f
}

function highlightAndFormatCode(text, language, showLineNumber) {
  if (showLineNumber) {
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    const highlighted = lines.map(line => {
      const h = hljs.highlight(line, { language }).value
      const f = formatHighlightedCode(h, false)
      return f === '' ? '&nbsp;' : f
    })
    const lineNums = highlighted.map((_, i) =>
      `<section style="padding:0 10px 0 0;line-height:1.75">${i + 1}</section>`).join('')
    const codeInner = highlighted.join('<br/>')
    const codeLines = `<div style="white-space:pre;min-width:max-content;line-height:1.75">${codeInner}</div>`
    const lnStyles = 'text-align:right;padding:8px 0;border-right:1px solid rgba(0,0,0,0.04);user-select:none;'
    return `<section style="display:flex;align-items:flex-start;overflow-x:hidden;overflow-y:auto;width:100%;max-width:100%;padding:0;box-sizing:border-box"><section class="line-numbers" style="${lnStyles}">${lineNums}</section><section class="code-scroll" style="flex:1 1 auto;overflow-x:auto;overflow-y:visible;padding:8px;min-width:0;box-sizing:border-box">${codeLines}</section></section>`
  }
  const raw = hljs.highlight(text, { language }).value
  return formatHighlightedCode(raw, true)
}

// ══════════════════════════════════════════════════════
// Marked Extensions (ported from doocs/md)
// ══════════════════════════════════════════════════════

// ── GFM Alert Extension ──────────────────────────────
const ALERT_VARIANTS = [
  { type: 'note',      icon: `<svg class="alert-icon-note" style="margin-right:0.25em" viewBox="0 0 16 16" width="16" height="16"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>` },
  { type: 'tip',       icon: `<svg class="alert-icon-tip" style="margin-right:0.25em" viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>` },
  { type: 'important', icon: `<svg class="alert-icon-important" style="margin-right:0.25em" viewBox="0 0 16 16" width="16" height="16"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>` },
  { type: 'warning',   icon: `<svg class="alert-icon-warning" style="margin-right:0.25em" viewBox="0 0 16 16" width="16" height="16"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>` },
  { type: 'caution',   icon: `<svg class="alert-icon-caution" style="margin-right:0.25em" viewBox="0 0 16 16" width="16" height="16"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>` },
]

function createAlertExtension() {
  const className = 'markdown-alert'

  function createSyntaxPattern(type) {
    return new RegExp(`^(?:\\[!${type}])\\s*?\n*`, 'i')
  }

  function renderAlert(token) {
    const { meta, tokens = [] } = token
    const text = this.parser.parse(tokens)
    let tmpl = `<blockquote class="${meta.className} ${meta.className}-${meta.variant}">\n`
    tmpl += `<p class="${meta.titleClassName} alert-title-${meta.variant}">`
    tmpl += meta.icon
    tmpl += meta.title
    tmpl += `</p>\n`
    tmpl += text
    tmpl += `</blockquote>\n`
    return tmpl
  }

  return {
    walkTokens(token) {
      if (token.type !== 'blockquote') return
      const matched = ALERT_VARIANTS.find(({ type }) =>
        createSyntaxPattern(type).test(token.text))
      if (!matched) return

      const typeRegexp = createSyntaxPattern(matched.type)
      Object.assign(token, {
        type: 'alert',
        meta: {
          className,
          variant: matched.type,
          icon: matched.icon,
          title: matched.type.charAt(0).toUpperCase() + matched.type.slice(1),
          titleClassName: `${className}-title`,
        },
      })

      const firstLine = token.tokens?.[0]
      const firstLineText = firstLine?.raw?.replace(typeRegexp, '').trim()
      if (firstLineText) {
        const patternToken = firstLine.tokens[0]
        Object.assign(patternToken, {
          raw: patternToken.raw.replace(typeRegexp, ''),
          text: patternToken.text.replace(typeRegexp, ''),
        })
        if (firstLine.tokens[1]?.type === 'br') {
          firstLine.tokens.splice(1, 1)
        }
      } else {
        token.tokens?.shift()
      }
    },
    extensions: [{
      name: 'alert',
      level: 'block',
      renderer: renderAlert,
    }],
  }
}

// ── Markup Extension (==highlight==, ++underline++, ~wavyline~) ──
function createMarkupExtension() {
  return {
    extensions: [
      {
        name: 'markup_highlight', level: 'inline',
        start: src => src.match(/==(?!=)/)?.index,
        tokenizer(src) {
          const m = /^==((?:[^=]|=(?!=))+)==/.exec(src)
          if (m) return { type: 'markup_highlight', raw: m[0], text: m[1] }
        },
        renderer: token => `<span class="markup-highlight">${token.text}</span>`,
      },
      {
        name: 'markup_underline', level: 'inline',
        start: src => src.match(/\+\+(?!\+)/)?.index,
        tokenizer(src) {
          const m = /^\+\+((?:[^+]|\+(?!\+))+)\+\+/.exec(src)
          if (m) return { type: 'markup_underline', raw: m[0], text: m[1] }
        },
        renderer: token => `<span class="markup-underline">${token.text}</span>`,
      },
      {
        name: 'markup_wavyline', level: 'inline',
        start: src => src.match(/~(?!~)/)?.index,
        tokenizer(src) {
          const m = /^~([^~\n]+)~(?!~)/.exec(src)
          if (m) return { type: 'markup_wavyline', raw: m[0], text: m[1] }
        },
        renderer: token => `<span class="markup-wavyline">${token.text}</span>`,
      },
    ],
  }
}

// ── Footnotes Extension ──────────────────────────────
function createFootnotesExtension() {
  const fnMap = new Map()
  return {
    extensions: [
      {
        name: 'footnoteDef', level: 'block',
        start(src) { fnMap.clear(); return src.match(/^\[\^/)?.index },
        tokenizer(src) {
          const m = src.match(/^\[\^(.*)\]:(.*)/)
          if (m) {
            const [raw, fnId, text] = m
            const index = fnMap.size + 1
            fnMap.set(fnId, { index, text })
            return { type: 'footnoteDef', raw, fnId, index, text }
          }
        },
        renderer(token) {
          const { index, text, fnId } = token
          const inner = `<code style="font-size:90%;opacity:0.6">[${index}]</code> <span>${text}</span> <a href="#fnRef-${fnId}" style="color:var(--md-primary-color)">\u21A9\uFE0E</a><br/>`
          if (index === 1) return `<p style="font-size:80%;margin:0.5em 8px;word-break:break-all">${inner}`
          if (index === fnMap.size) return `${inner}</p>`
          return inner
        },
      },
      {
        name: 'footnoteRef', level: 'inline',
        start: src => src.match(/\[\^/)?.index,
        tokenizer(src) {
          const m = src.match(/^\[\^(.*?)\]/)
          if (m && fnMap.has(m[1])) return { type: 'footnoteRef', raw: m[0], fnId: m[1] }
        },
        renderer(token) {
          const { index } = fnMap.get(token.fnId)
          return `<sup style="color:var(--md-primary-color)"><a href="#fnDef-${token.fnId}" id="fnRef-${token.fnId}">[${index}]</a></sup>`
        },
      },
    ],
  }
}

// ══════════════════════════════════════════════════════
// Marked Renderer (ported from doocs/md renderer-impl.ts)
// ══════════════════════════════════════════════════════

const HEADING_TAG_RE = /^h\d$/
const MP_WEIXIN_LINK_RE = /^https?:\/\/mp\.weixin\.qq\.com/

function createRenderer(opts) {
  const footnotes = []
  let footnoteIndex = 0
  const listOrderedStack = []
  const listCounters = []

  function styledContent(styleLabel, content, tagName) {
    const tag = tagName ?? styleLabel
    const cls = styleLabel.replace(/_/g, '-')
    const headingAttr = HEADING_TAG_RE.test(tag) ? ' data-heading="true"' : ''
    return `<${tag} class="${cls}"${headingAttr}>${content}</${tag}>`
  }

  function addFootnote(title, link) {
    const existing = footnotes.find(([, , l]) => l === link)
    if (existing) return existing[0]
    footnotes.push([++footnoteIndex, title, link])
    return footnoteIndex
  }

  const renderer = {
    heading({ tokens, depth }) {
      return styledContent(`h${depth}`, this.parser.parseInline(tokens))
    },

    paragraph({ tokens }) {
      const text = this.parser.parseInline(tokens)
      if ((text.includes('<figure') && text.includes('<img')) || !text.trim()) return text
      return styledContent('p', text)
    },

    blockquote({ tokens }) {
      return styledContent('blockquote', this.parser.parse(tokens))
    },

    code({ text, lang = '' }) {
      const langText = lang.split(' ')[0]
      const language = hljs.getLanguage(langText) ? langText : 'plaintext'
      const highlighted = highlightAndFormatCode(text, language, opts.lineNumbers)

      const macSign = opts.macCode
        ? `<span class="mac-sign" style="padding:10px 14px 0">${macCodeSvg}</span>`
        : ''
      return `<pre class="hljs code__pre">${macSign}<code class="language-${lang}">${highlighted}</code></pre>`
    },

    codespan({ text }) {
      const escaped = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;')
      return styledContent('codespan', escaped, 'code')
    },

    list({ ordered, items, start = 1 }) {
      listOrderedStack.push(ordered)
      listCounters.push(Number(start))
      const html = items.map(item => this.listitem(item)).join('')
      listOrderedStack.pop()
      listCounters.pop()
      return styledContent(ordered ? 'ol' : 'ul', html)
    },

    listitem(token) {
      const ordered = listOrderedStack[listOrderedStack.length - 1]
      const idx = listCounters[listCounters.length - 1]
      listCounters[listCounters.length - 1] = idx + 1
      const prefix = ordered ? `${idx}. ` : '\u2022 '

      let content
      try { content = this.parser.parseInline(token.tokens) }
      catch { content = this.parser.parse(token.tokens).replace(/^<p[^>]*>([\s\S]*?)<\/p>/, '$1') }

      return styledContent('listitem', `${prefix}${content}`, 'li')
    },

    image({ href, title, text }) {
      const subText = text ? styledContent('figcaption', text) : ''
      const titleAttr = title ? ` title="${title}"` : ''
      return `<figure><img src="${href}"${titleAttr} alt="${text || ''}"/>${subText}</figure>`
    },

    link({ href, title, text, tokens }) {
      const parsed = this.parser.parseInline(tokens)
      if (MP_WEIXIN_LINK_RE.test(href)) {
        return `<a href="${href}" title="${title || text}">${parsed}</a>`
      }
      if (href === text) return parsed
      if (opts.citeStatus) {
        const ref = addFootnote(title || text, href)
        return `<a href="${href}" title="${title || text}">${parsed}<sup>[${ref}]</sup></a>`
      }
      return `<a href="${href}" title="${title || text}">${parsed}</a>`
    },

    strong({ tokens }) {
      return styledContent('strong', this.parser.parseInline(tokens))
    },

    em({ tokens }) {
      return styledContent('em', this.parser.parseInline(tokens))
    },

    table({ header, rows }) {
      const headerRow = header.map(cell =>
        styledContent('th', this.parser.parseInline(cell.tokens))).join('')
      const body = rows.map(row => {
        const rowContent = row.map(cell => this.tablecell(cell)).join('')
        return styledContent('tr', rowContent)
      }).join('')
      return `<section style="max-width:100%;overflow:auto"><table class="preview-table"><thead>${headerRow}</thead><tbody>${body}</tbody></table></section>`
    },

    tablecell(token) {
      return styledContent('td', this.parser.parseInline(token.tokens))
    },

    hr() {
      return styledContent('hr', '')
    },
  }

  function buildFootnotes() {
    if (!footnotes.length) return ''
    const items = footnotes.map(([i, t, l]) =>
      l === t
        ? `<code style="font-size:90%;opacity:0.6">[${i}]</code>: <i style="word-break:break-all">${t}</i><br/>`
        : `<code style="font-size:90%;opacity:0.6">[${i}]</code> ${t}: <i style="word-break:break-all">${l}</i><br/>`
    ).join('\n')
    return styledContent('h4', '引用链接') + styledContent('footnotes', items, 'p')
  }

  function reset() {
    footnotes.length = 0
    footnoteIndex = 0
  }

  return { renderer, buildFootnotes, reset }
}

// ══════════════════════════════════════════════════════
// CSS Generation
// ══════════════════════════════════════════════════════

function generateCSSVariables(opts) {
  const primary = opts.primary || DEFAULTS.primaryColor
  const font = opts.font || DEFAULTS.fontFamily
  const size = opts.fontSize || DEFAULTS.fontSize
  const textColor = DEFAULTS.textColor
  const bqBg = DEFAULTS.blockquoteBg

  let css = `:root {
  --md-primary-color: ${primary};
  --md-font-family: ${font};
  --md-font-size: ${size};
  --md-text-color: ${textColor};
  --blockquote-background: ${bqBg};
}\n`

  // Paragraph indent/justify
  if (opts.indent || opts.justify) {
    css += `p {\n`
    if (opts.indent) css += `  text-indent: 2em;\n`
    if (opts.justify) css += `  text-align: justify;\n`
    css += `}\n`
  }

  return css
}

function generateHeadingOverrides(headingStyles) {
  const rules = []
  for (const [level, style] of Object.entries(headingStyles)) {
    if (!style || style === 'default') continue
    const base = 'display:block;text-align:left;background:transparent;'
    switch (style) {
      case 'color-only':
        rules.push(`${level} { color: var(--md-primary-color); background: transparent; }`)
        break
      case 'border-bottom':
        rules.push(`${level} { ${base} padding-bottom:0.3em; border-bottom:2px solid var(--md-primary-color); color:var(--md-primary-color); }`)
        break
      case 'border-left':
        rules.push(`${level} { ${base} margin-left:0; padding-left:10px; border-left:4px solid var(--md-primary-color); color:var(--md-primary-color); }`)
        break
    }
  }
  return rules.join('\n')
}

function loadCodeThemeCSS(codeTheme) {
  // Resolve highlight.js styles directory
  const hljsEntry = require.resolve('highlight.js')
  const hljsRoot = resolve(dirname(hljsEntry), '..')
  const stylesDir = join(hljsRoot, 'styles')

  // Try minified first, then regular
  for (const ext of ['.min.css', '.css']) {
    const p = join(stylesDir, codeTheme + ext)
    if (existsSync(p)) return readFileSync(p, 'utf-8')
  }
  // Fallback to github
  console.warn(`Code theme "${codeTheme}" not found, falling back to "github"`)
  const fallback = join(stylesDir, 'github.min.css')
  if (existsSync(fallback)) return readFileSync(fallback, 'utf-8')
  return readFileSync(join(stylesDir, 'github.css'), 'utf-8')
}

// ══════════════════════════════════════════════════════
// PostCSS Processing
// ══════════════════════════════════════════════════════

async function processCSS(css) {
  const result = await postcss([
    postcssCustomProperties({ preserve: false }),
    postcssCalc({ preserve: false, mediaQueries: false, selectors: false }),
  ]).process(css, { from: undefined })
  return result.css
}

// ══════════════════════════════════════════════════════
// Main Render Pipeline
// ══════════════════════════════════════════════════════

async function render(markdownPath, opts) {
  // 1. Read and parse front-matter
  const raw = readFileSync(markdownPath, 'utf-8')
  const { meta, content: markdown } = parseFrontMatter(raw)

  // 2. Setup marked with custom renderer + extensions
  const { renderer, buildFootnotes, reset } = createRenderer(opts)
  reset()

  marked.setOptions({ breaks: true })
  marked.use({ renderer })
  marked.use(createAlertExtension())
  marked.use(createMarkupExtension())
  marked.use(createFootnotesExtension())

  // 3. Parse markdown → HTML
  let html = marked.parse(markdown)

  // 4. Build footnotes section
  const footnotesHtml = buildFootnotes()

  // 5. Wrap in container
  html = `<section class="container">${html}${footnotesHtml}</section>`

  // 6. Load CSS
  const baseCSS = readFileSync(join(__dirname, 'themes', 'base.css'), 'utf-8')
  const themeCSS = readFileSync(join(__dirname, 'themes', `${opts.theme}.css`), 'utf-8')
  const codeThemeCSS = loadCodeThemeCSS(opts.codeTheme)

  // 7. Generate CSS variables + heading overrides
  const varsCSS = generateCSSVariables(opts)
  const headingCSS = generateHeadingOverrides(opts.headingStyles)

  // 8. Combine all CSS (order matters: variables → base → theme → code → overrides)
  const allCSS = [varsCSS, baseCSS, themeCSS, codeThemeCSS, headingCSS].join('\n')

  // 9. PostCSS: flatten CSS variables + calc()
  const processedCSS = await processCSS(allCSS)

  // 10. juice: inline CSS → style attributes
  const htmlWithStyle = `<style>${processedCSS}</style>${html}`
  const inlined = juice(htmlWithStyle, {
    removeStyleTags: true,
    preserveImportant: true,
    preserveMediaQueries: false,
  })

  // 11. DOMPurify: sanitize (permissive config for WeChat HTML)
  const clean = DOMPurify.sanitize(inlined, {
    USE_PROFILES: { html: true, svg: true },
    ADD_TAGS: ['section', 'container'],
    ADD_ATTR: ['style', 'data-heading', 'class'],
    WHOLE_DOCUMENT: false,
  })

  return { html: clean, meta }
}

// ══════════════════════════════════════════════════════
// Preview Template
// ══════════════════════════════════════════════════════

function wrapPreview(html, title) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || '预览'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #f5f5f5;
      display: flex;
      justify-content: center;
      padding: 20px;
    }
    .phone-frame {
      width: 375px;
      min-height: 600px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      padding: 20px 16px;
      overflow-y: auto;
    }
    @media (max-width: 420px) {
      body { padding: 0; }
      .phone-frame {
        width: 100%;
        border-radius: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="phone-frame">
    ${html}
  </div>
</body>
</html>`
}

// ══════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════

async function main() {
  const opts = parseArgs(process.argv)

  // --list-themes
  if (opts.listThemes) {
    console.log('\n可用主题:\n')
    for (const [id, info] of Object.entries(THEMES)) {
      console.log(`  ${id.padEnd(10)} ${info.name} — ${info.desc}`)
    }
    console.log('\n用法: node render.mjs -i article.md -t <theme>\n')
    process.exit(0)
  }

  // Validate
  if (!opts.input) {
    console.error('错误: 请指定输入文件 (-i <file.md>)')
    console.error('用法: node render.mjs -i article.md [-t default] [-o output.html]')
    console.error('      node render.mjs --list-themes')
    process.exit(1)
  }

  const inputPath = resolve(opts.input)
  if (!existsSync(inputPath)) {
    console.error(`错误: 文件不存在 — ${inputPath}`)
    process.exit(1)
  }

  if (!THEMES[opts.theme]) {
    console.error(`错误: 未知主题 "${opts.theme}"，可用: ${Object.keys(THEMES).join(', ')}`)
    process.exit(1)
  }

  // Render
  console.log(`渲染: ${basename(inputPath)} [主题: ${opts.theme}]`)
  const { html, meta } = await render(inputPath, opts)

  // Determine output path
  const outputDir = join(__dirname, 'output')
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  let outputPath
  if (opts.output) {
    outputPath = resolve(opts.output)
  } else {
    const name = basename(inputPath, '.md')
    const ext = opts.preview ? '.preview.html' : '.html'
    outputPath = join(outputDir, name + ext)
  }

  // Write output
  const finalHtml = opts.preview ? wrapPreview(html, meta.title) : html
  writeFileSync(outputPath, finalHtml, 'utf-8')
  console.log(`输出: ${outputPath}`)

  if (opts.preview) {
    console.log(`预览: 在浏览器中打开 file://${outputPath}`)
  }
}

main().catch(err => {
  console.error('渲染失败:', err.message)
  process.exit(1)
})
