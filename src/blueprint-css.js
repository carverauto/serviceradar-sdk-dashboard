export const BLUEPRINT_ROOT_CLASS = "sr-dashboard-blueprint"
export const BLUEPRINT_PORTAL_CLASS = "sr-dashboard-blueprint-portals"
export const BLUEPRINT_DARK_CLASS = "bp6-dark"
export const BLUEPRINT_STYLE_ATTRIBUTE = "data-sr-blueprint-sdk"
export const BLUEPRINT_PORTAL_ATTRIBUTE = "data-sr-blueprint-portals"
export const BLUEPRINT_MOUNT_ATTRIBUTE = "data-sr-blueprint-mount"

const ICON_FONT_SELECTOR_RE = /^(?:\.bp6-icon-[a-z0-9-]+::?before|span\.bp6-icon(?:-standard|-large|:empty(?:::?before|\.bp6-icon-(?:standard|large))?)|\.bp6-tag-remove:empty::?before|\.bp6-tree-node-caret\.bp6-icon-standard::?before)$/i
const PUA_GLYPH_BODY_RE = /content\s*:\s*["']\\f[0-9a-f]{3,}["']/i
const FONT_FAMILY_ICON_REF_RE = /,\s*(?:["'])?blueprint-icons-(?:16|20)(?:["'])?|(?:["'])?blueprint-icons-(?:16|20)(?:["'])?\s*,?/gi
const EXTERNAL_IMPORT_RE = /(?:normalize\.css|blueprint-icons(?:\.css)?)/i
const DARK_CLASS_PREFIX_RE = /^\.bp6-dark(?=$|[ >+~.:[])/
const DARK_SCHEME_PREFIX_RE = /^\[data-bp-color-scheme=["']?dark["']?\](?=$|[ >+~.:[])/i
const BODY_PREFIX_RE = /^body(?=$|[ >+~.:[])/i
const BODY_STATE_CLASS_RE = /^body\.[\w-]+$/i
const FOCUS_DISABLED_PREFIX_RE = /^\.bp6-focus-disabled(?=\s)/
const DIR_PREFIX_RE = /^(\[dir=(?:["']?(?:rtl|ltr)["']?)\])\s+([\s\S]+)$/i

export function scopeBlueprintCss(rawCss, scopeSelector = `.${BLUEPRINT_ROOT_CLASS}`) {
  if (typeof rawCss !== "string" || !rawCss.trim()) return ""
  const scope = String(scopeSelector || `.${BLUEPRINT_ROOT_CLASS}`).trim()
  const cleaned = stripComments(rawCss)
  return transformBlock(cleaned, scope)
}

export function buildBlueprintThemeBridgeCss(scopeSelector = `.${BLUEPRINT_ROOT_CLASS}`) {
  const scope = String(scopeSelector || `.${BLUEPRINT_ROOT_CLASS}`).trim()
  return [
    `${scope},`,
    `${scope}[data-sr-theme]{`,
    "  --bp-typography-family-default: var(--sr-font-sans, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif);",
    "  --bp-typography-family-mono: var(--sr-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);",
    "  --bp-surface-border-radius: var(--sr-radius-small, 4px);",
    "  --bp-surface-background-color-default-rest: var(--sr-color-surface, var(--sr-surface, var(--sr-panel-bg, #ffffff)));",
    "  --bp-surface-background-color-default-hover: var(--sr-color-subtle, #f6f7f9);",
    "  --bp-surface-background-color-default-active: var(--sr-color-raised, #edeff2);",
    "  --bp-surface-border-color-default: var(--sr-color-line, var(--sr-border, var(--sr-panel-border, rgba(17, 20, 24, 0.15))));",
    "  --bp-surface-border-color-strong: var(--sr-color-line-strong, var(--sr-border, rgba(17, 20, 24, 0.28)));",
    "  --bp-typography-color-default-rest: var(--sr-color-ink, var(--sr-ink, #1c2127));",
    "  --bp-typography-color-muted: var(--sr-color-muted, #5f6b7c);",
    "  --bp-intent-primary-rest: var(--sr-color-brand, var(--sr-accent, #2d72d2));",
    "  --bp-intent-primary-hover: var(--sr-color-brand-strong, var(--sr-accent, #215db0));",
    "  --bp-intent-primary-foreground: var(--sr-color-on-brand, #ffffff);",
    "  --bp-emphasis-focus-color: var(--sr-color-focus, var(--sr-color-brand, var(--sr-accent, #2d72d2)));",
    "  color: var(--bp-typography-color-default-rest);",
    "  font-family: var(--bp-typography-family-default);",
    "}",
    `${scope}.${BLUEPRINT_DARK_CLASS},`,
    `${scope}[data-bp-color-scheme="dark"],`,
    `${scope}[data-sr-theme="dark"]{`,
    "  --bp-surface-background-color-default-rest: var(--sr-color-surface, var(--sr-surface, var(--sr-panel-bg, #10191d)));",
    "  --bp-surface-background-color-default-hover: var(--sr-color-subtle, #17252a);",
    "  --bp-surface-background-color-default-active: var(--sr-color-raised, #152126);",
    "  --bp-surface-border-color-default: var(--sr-color-line, var(--sr-border, var(--sr-panel-border, rgba(255, 255, 255, 0.2))));",
    "  --bp-surface-border-color-strong: var(--sr-color-line-strong, var(--sr-border, rgba(255, 255, 255, 0.3)));",
    "  --bp-typography-color-default-rest: var(--sr-color-ink, var(--sr-ink, #edf5f1));",
    "  --bp-typography-color-muted: var(--sr-color-muted, #aab8b2);",
    "  --bp-intent-primary-rest: var(--sr-color-brand, var(--sr-accent, #3ecf87));",
    "  --bp-intent-primary-hover: var(--sr-color-brand-strong, var(--sr-accent, #5bde9b));",
    "  --bp-intent-primary-foreground: var(--sr-color-on-brand, #062b1a);",
    "  --bp-emphasis-focus-color: var(--sr-color-focus, var(--sr-color-brand, var(--sr-accent, #3ecf87)));",
    "}",
    `${scope} .bp6-monospace-text,`,
    `${scope} code,`,
    `${scope} pre{`,
    "  font-family: var(--bp-typography-family-mono);",
    "}",
    `${scope} .bp6-card{`,
    "  background-color: var(--sr-color-surface, var(--sr-surface, var(--sr-panel-bg, var(--bp-surface-background-color-default-rest))));",
    "  border-color: var(--bp-surface-border-color-default);",
    "}",
    `${scope}.${BLUEPRINT_DARK_CLASS} .bp6-card{`,
    "  background-color: var(--sr-color-surface, var(--sr-surface, var(--sr-panel-bg, #1c2127)));",
    "}",
    `${scope} .bp6-drawer{`,
    "  background-color: var(--sr-color-raised, var(--sr-surface, var(--sr-panel-bg, #ffffff)));",
    "  color: var(--bp-typography-color-default-rest);",
    "}",
    `${scope}.${BLUEPRINT_DARK_CLASS} .bp6-drawer{`,
    "  background-color: var(--sr-color-raised, var(--sr-surface, var(--sr-panel-bg, #152126)));",
    "  color: var(--bp-typography-color-default-rest);",
    "}",
    `${scope} .bp6-popover .bp6-popover-content{`,
    "  background-color: var(--sr-color-raised, var(--sr-surface, var(--sr-panel-bg, #ffffff)));",
    "  color: var(--bp-typography-color-default-rest);",
    "}",
    `${scope}.${BLUEPRINT_DARK_CLASS} .bp6-popover .bp6-popover-content{`,
    "  background-color: var(--sr-color-raised, var(--sr-surface, var(--sr-panel-bg, #152126)));",
    "  color: var(--bp-typography-color-default-rest);",
    "}",
    `${scope} .bp6-overlay{`,
    "  z-index: 70;",
    "}",
  ].join("\n")
}

export const BLUEPRINT_THEME_BRIDGE_CSS = buildBlueprintThemeBridgeCss()

function transformBlock(css, scope) {
  const out = []
  let index = 0
  const len = css.length

  while (index < len) {
    index = skipWhitespace(css, index)
    if (index >= len) break

    if (css[index] === "@") {
      const semi = findCharOutsideStrings(css, index, ";")
      const brace = findCharOutsideStrings(css, index, "{")

      if (semi !== -1 && (brace === -1 || semi < brace)) {
        const statement = css.slice(index, semi + 1).trim()
        index = semi + 1
        if (/^@charset\b/i.test(statement)) continue
        if (/^@import\b/i.test(statement) && EXTERNAL_IMPORT_RE.test(statement)) continue
        out.push(statement)
        continue
      }

      if (brace === -1) break
      const header = css.slice(index, brace).trim()
      const closeBrace = findMatchingBrace(css, brace)
      const inner = css.slice(brace + 1, closeBrace)
      index = closeBrace + 1

      if (/^@font-face\b/i.test(header)) continue

      if (/^@(?:-\w+-)?keyframes\b/i.test(header)) {
        out.push(`${header}{${inner}}`)
        continue
      }

      if (/^@(?:media|supports|layer|container|document)\b/i.test(header)) {
        const scopedInner = transformBlock(inner, scope)
        if (scopedInner) out.push(`${header}{\n${scopedInner}\n}`)
        continue
      }

      out.push(`${header}{${inner}}`)
      continue
    }

    const brace = findCharOutsideStrings(css, index, "{")
    if (brace === -1) break
    const selectorText = css.slice(index, brace).trim()
    const closeBrace = findMatchingBrace(css, brace)
    const body = css.slice(brace + 1, closeBrace)
    index = closeBrace + 1

    const selectors = splitSelectors(selectorText)
      .filter((selector) => selector && !ICON_FONT_SELECTOR_RE.test(selector))

    if (selectors.length === 0) continue

    if (PUA_GLYPH_BODY_RE.test(body)) continue

    const sanitizedBody = sanitizeDeclarations(body)
    if (!sanitizedBody.trim()) continue

    const rewritten = []
    for (const selector of selectors) {
      for (const mapped of rewriteSelector(selector, scope)) {
        if (!rewritten.includes(mapped)) rewritten.push(mapped)
      }
    }

    if (rewritten.length === 0) continue
    out.push(`${rewritten.join(",\n")}{${sanitizedBody}}`)
  }

  return out.join("\n")
}

function rewriteSelector(selector, scope) {
  const s = selector.trim()
  if (!s) return []

  if (s === ":root" || s === "html" || s === "body") {
    return [scope]
  }

  if (BODY_STATE_CLASS_RE.test(s)) {
    return [s]
  }

  if (FOCUS_DISABLED_PREFIX_RE.test(s)) {
    return [`.bp6-focus-disabled ${scope}${s.slice(".bp6-focus-disabled".length)}`]
  }

  if (BODY_PREFIX_RE.test(s)) {
    const rest = s.slice(4)
    if (!rest) return [scope]
    if (/^[.:[]/.test(rest)) return [`${scope}${rest}`]
    return [`${scope}${rest}`]
  }

  if (s === "*" || s === "*::before" || s === "*::after" || s === "*:before" || s === "*:after") {
    return [`${scope} ${s}`]
  }

  if (s === "::selection" || s === "::-moz-selection" || s === ":focus") {
    return [`${scope} ${s}`, `${scope}${s}`]
  }

  if (DARK_CLASS_PREFIX_RE.test(s)) {
    const rest = s.slice(".bp6-dark".length)
    return [`${scope}.bp6-dark${rest}`, `${scope} .bp6-dark${rest}`]
  }

  if (DARK_SCHEME_PREFIX_RE.test(s)) {
    const match = s.match(/^(\[data-bp-color-scheme=["']?dark["']?\])([\s\S]*)$/i)
    const attr = match[1]
    const rest = match[2] || ""
    return [`${scope}${attr}${rest}`, `${scope} ${attr}${rest}`]
  }

  const dirMatch = s.match(DIR_PREFIX_RE)
  if (dirMatch) {
    const dirAttr = dirMatch[1]
    const rest = dirMatch[2]
    return [`${dirAttr} ${scope} ${rest}`, `${scope}${dirAttr} ${rest}`]
  }

  return [`${scope} ${s}`]
}

function sanitizeDeclarations(body) {
  return body.replace(FONT_FAMILY_ICON_REF_RE, (match) => (match.startsWith(",") ? "" : ""))
}

function stripComments(css) {
  let out = ""
  let index = 0
  const len = css.length
  let quote = null

  while (index < len) {
    const ch = css[index]
    if (quote) {
      out += ch
      if (ch === "\\" && index + 1 < len) {
        out += css[index + 1]
        index += 2
        continue
      }
      if (ch === quote) quote = null
      index += 1
      continue
    }

    if (ch === "\"" || ch === "'") {
      quote = ch
      out += ch
      index += 1
      continue
    }

    if (ch === "/" && css[index + 1] === "*") {
      const close = css.indexOf("*/", index + 2)
      index = close === -1 ? len : close + 2
      continue
    }

    out += ch
    index += 1
  }

  return out
}

function skipWhitespace(str, index) {
  while (index < str.length && /\s/.test(str[index])) index += 1
  return index
}

function findCharOutsideStrings(str, start, target) {
  let quote = null
  for (let i = start; i < str.length; i += 1) {
    const ch = str[i]
    if (quote) {
      if (ch === "\\" && i + 1 < str.length) {
        i += 1
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === "\"" || ch === "'") {
      quote = ch
      continue
    }
    if (ch === target) return i
  }
  return -1
}

function findMatchingBrace(str, openBraceIndex) {
  let depth = 0
  let quote = null
  for (let i = openBraceIndex; i < str.length; i += 1) {
    const ch = str[i]
    if (quote) {
      if (ch === "\\" && i + 1 < str.length) {
        i += 1
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === "\"" || ch === "'") {
      quote = ch
      continue
    }
    if (ch === "{") depth += 1
    else if (ch === "}") {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return str.length - 1
}

function splitSelectors(selectorText) {
  const parts = []
  let quote = null
  let parenDepth = 0
  let bracketDepth = 0
  let start = 0

  for (let i = 0; i < selectorText.length; i += 1) {
    const ch = selectorText[i]
    if (quote) {
      if (ch === "\\" && i + 1 < selectorText.length) {
        i += 1
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === "\"" || ch === "'") {
      quote = ch
      continue
    }
    if (ch === "(") parenDepth += 1
    else if (ch === ")" && parenDepth > 0) parenDepth -= 1
    else if (ch === "[") bracketDepth += 1
    else if (ch === "]" && bracketDepth > 0) bracketDepth -= 1
    else if (ch === "," && parenDepth === 0 && bracketDepth === 0) {
      parts.push(selectorText.slice(start, i).trim())
      start = i + 1
    }
  }

  parts.push(selectorText.slice(start).trim())
  return parts
}
