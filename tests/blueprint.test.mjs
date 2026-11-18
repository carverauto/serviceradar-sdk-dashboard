import assert from "node:assert/strict"
import {execFileSync} from "node:child_process"
import path from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"
import React, {useEffect, useState} from "react"
import {createRoot} from "react-dom/client"
import {renderToStaticMarkup} from "react-dom/server"
import {Window} from "happy-dom"
import {
  Button,
  Callout,
  Card,
  Drawer,
  MenuItem,
  PopoverNext,
  Tag,
  Tooltip,
} from "@blueprintjs/core"
import {PulseIcon} from "@blueprintjs/icons"
import {Select} from "@blueprintjs/select"

import {
  BLUEPRINT_DARK_CLASS,
  BLUEPRINT_PORTAL_ATTRIBUTE,
  BLUEPRINT_PORTAL_CLASS,
  BLUEPRINT_ROOT_CLASS,
  BLUEPRINT_SCOPED_CSS,
  BLUEPRINT_STYLE_ATTRIBUTE,
  BLUEPRINT_THEME_BRIDGE_CSS,
  BlueprintDashboardProvider,
  mountBlueprintDashboard,
  scopeBlueprintCss,
  useBlueprintPortalContainer,
} from "../src/blueprint.js"
import {useDashboardReady} from "../src/react.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

function createDashboardApi({initialTheme = "light"} = {}) {
  let theme = initialTheme
  const themeListeners = new Set()

  return {
    api: {
      theme: () => theme,
      isDarkMode: () => theme === "dark",
      frames: () => [],
      onThemeChange(listener) {
        themeListeners.add(listener)
        return () => themeListeners.delete(listener)
      },
    },
    setTheme(nextTheme) {
      theme = nextTheme
      for (const listener of [...themeListeners]) {
        listener(nextTheme)
      }
    },
  }
}

const nativeSetTimeout = globalThis.setTimeout

async function flushReact(ticks = 6) {
  for (let i = 0; i < ticks; i += 1) {
    await new Promise((resolve) => nativeSetTimeout(resolve, 10))
  }
}

async function withHappyDom(fn) {
  const win = new Window({url: "https://dashboard.serviceradar.test/"})
  const keys = [
    "window",
    "document",
    "HTMLElement",
    "HTMLDivElement",
    "Element",
    "Node",
    "Text",
    "SVGElement",
    "DocumentFragment",
    "MutationObserver",
    "ResizeObserver",
    "IntersectionObserver",
    "Event",
    "CustomEvent",
    "MouseEvent",
    "KeyboardEvent",
    "FocusEvent",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "setTimeout",
    "clearTimeout",
    "matchMedia",
  ]
  const previous = new Map()

  for (const key of keys) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    const value = key === "window" ? win : win[key]
    if (value !== undefined) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value: typeof value === "function" && key !== "MutationObserver" && key !== "ResizeObserver" && key !== "IntersectionObserver" && !/^[A-Z]/.test(key)
          ? value.bind(win)
          : value,
      })
    }
  }

  try {
    return await fn(win)
  } finally {
    await flushReact(4)
    await win.happyDOM.close()
    for (const [key, desc] of previous.entries()) {
      if (desc) Object.defineProperty(globalThis, key, desc)
      else delete globalThis[key]
    }
  }
}

function collectNonKeyframeSelectors(css) {
  const selectors = []
  let index = 0
  const len = css.length

  function scan(end) {
    while (index < end) {
      while (index < end && /\s/.test(css[index])) index += 1
      if (index >= end) break
      if (css[index] === "@") {
        const semi = css.indexOf(";", index)
        const brace = css.indexOf("{", index)
        if (semi !== -1 && (brace === -1 || semi < brace)) {
          index = semi + 1
          continue
        }
        const header = css.slice(index, brace).trim()
        let depth = 1
        let cursor = brace + 1
        while (cursor < end && depth > 0) {
          if (css[cursor] === "{") depth += 1
          else if (css[cursor] === "}") depth -= 1
          cursor += 1
        }
        index = brace + 1
        if (!/^@(?:-\w+-)?keyframes\b/i.test(header)) {
          scan(cursor - 1)
        }
        index = cursor
        continue
      }

      const brace = css.indexOf("{", index)
      if (brace === -1 || brace >= end) break
      const selectorText = css.slice(index, brace).trim()
      let depth = 1
      let cursor = brace + 1
      while (cursor < end && depth > 0) {
        if (css[cursor] === "{") depth += 1
        else if (css[cursor] === "}") depth -= 1
        cursor += 1
      }
      index = cursor
      for (const part of selectorText.split(",")) {
        if (part.trim()) selectors.push(part.trim())
      }
    }
  }

  scan(len)
  return selectors
}

test("BLUEPRINT_SCOPED_CSS excludes normalize, icon fonts, and bare globals while scoping selectors", () => {
  assert.ok(BLUEPRINT_SCOPED_CSS.includes(`.${BLUEPRINT_ROOT_CLASS} .bp6-card`))
  assert.ok(BLUEPRINT_SCOPED_CSS.includes(`.${BLUEPRINT_ROOT_CLASS} .bp6-drawer`))
  assert.ok(BLUEPRINT_SCOPED_CSS.includes(`.${BLUEPRINT_ROOT_CLASS} .bp6-popover`))
  assert.ok(BLUEPRINT_SCOPED_CSS.includes(`.${BLUEPRINT_ROOT_CLASS} .bp6-select-popover`))
  assert.ok(BLUEPRINT_SCOPED_CSS.includes(`.${BLUEPRINT_ROOT_CLASS}.${BLUEPRINT_DARK_CLASS}`))
  assert.ok(BLUEPRINT_SCOPED_CSS.includes(".bp6-icon > svg"))
  assert.ok(BLUEPRINT_SCOPED_CSS.includes(".bp6-icon.bp6-intent-primary"))

  assert.equal(/@font-face/i.test(BLUEPRINT_SCOPED_CSS), false)
  assert.equal(/@charset/i.test(BLUEPRINT_SCOPED_CSS), false)
  assert.equal(/normalize\.css/i.test(BLUEPRINT_SCOPED_CSS), false)
  assert.equal(/blueprint-icons-/i.test(BLUEPRINT_SCOPED_CSS), false)
  assert.equal(/content\s*:\s*["']\\f[0-9a-f]{3,}["']/i.test(BLUEPRINT_SCOPED_CSS), false)

  const selectors = collectNonKeyframeSelectors(BLUEPRINT_SCOPED_CSS)
  assert.ok(selectors.length > 500)
  const unscoped = selectors.filter((selector) => !selector.includes(`.${BLUEPRINT_ROOT_CLASS}`))
  assert.deepEqual(unscoped, [])
})

test("BLUEPRINT_THEME_BRIDGE_CSS maps ServiceRadar --sr-color-* tokens and overlay z-index", () => {
  assert.ok(BLUEPRINT_THEME_BRIDGE_CSS.includes("--sr-color-surface"))
  assert.ok(BLUEPRINT_THEME_BRIDGE_CSS.includes("--sr-color-raised"))
  assert.ok(BLUEPRINT_THEME_BRIDGE_CSS.includes("--sr-color-ink"))
  assert.ok(BLUEPRINT_THEME_BRIDGE_CSS.includes("--sr-color-muted"))
  assert.ok(BLUEPRINT_THEME_BRIDGE_CSS.includes("--sr-color-line"))
  assert.ok(BLUEPRINT_THEME_BRIDGE_CSS.includes("--sr-color-brand"))
  assert.ok(BLUEPRINT_THEME_BRIDGE_CSS.includes("--sr-font-sans"))
  assert.ok(BLUEPRINT_THEME_BRIDGE_CSS.includes("--sr-font-mono"))
  assert.ok(BLUEPRINT_THEME_BRIDGE_CSS.includes(`.${BLUEPRINT_ROOT_CLASS} .bp6-overlay`))
  assert.ok(BLUEPRINT_THEME_BRIDGE_CSS.includes("z-index: 70"))
})

test("scopeBlueprintCss preserves @keyframes and recursively scopes @media/@supports", () => {
  const sample = `
    @charset "UTF-8";
    @import url("normalize.css");
    @font-face { font-family: "blueprint-icons-16"; src: url("x.woff2"); }
    :root { --bp-typography-family-default: "Inter", blueprint-icons-16, sans-serif; }
    html, body { margin: 0; }
    body.bp6-overlay-open { overflow: hidden; }
    .bp6-icon-add::before { content: "\\f109"; }
    @keyframes bp6-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @media (min-width: 600px) {
      .bp6-dark .bp6-card { color: #fff; }
      a:hover { text-decoration: underline; }
    }
  `

  const scoped = scopeBlueprintCss(sample)
  assert.equal(/@charset|@import|@font-face|blueprint-icons-16|\\f109/.test(scoped), false)
  assert.ok(scoped.includes("@keyframes bp6-spin{ from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"))
  assert.ok(scoped.includes("@media (min-width: 600px){"))
  assert.ok(scoped.includes(".sr-dashboard-blueprint.bp6-dark .bp6-card"))
  assert.ok(scoped.includes(".sr-dashboard-blueprint .bp6-dark .bp6-card"))
  assert.ok(scoped.includes(".sr-dashboard-blueprint a:hover"))
  assert.ok(scoped.includes(".sr-dashboard-blueprint.bp6-overlay-open"))
})

test("scripts/generate-blueprint-css.mjs --check matches installed Blueprint CSS", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-blueprint-css.mjs", "--check"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
  assert.match(output, /up to date/)
})

test("SSR renderToStaticMarkup supports light/dark themes, standalone provider, and modular SVG icons", () => {
  function Probe() {
    const portalContainer = useBlueprintPortalContainer()
    return React.createElement(
      Card,
      null,
      React.createElement(Callout, {intent: "warning", title: "Degraded"}, "Packet loss"),
      React.createElement(Tag, {intent: "primary", onRemove: () => {}}, "hub-east"),
      React.createElement(PulseIcon, {"data-testid": "pulse-icon"}),
      React.createElement("span", {"data-portal": String(portalContainer)}),
    )
  }

  const lightHtml = renderToStaticMarkup(
    React.createElement(
      BlueprintDashboardProvider,
      {theme: "light"},
      React.createElement(Probe),
    ),
  )
  assert.ok(lightHtml.includes(`class="${BLUEPRINT_ROOT_CLASS}"`))
  assert.equal(lightHtml.includes(BLUEPRINT_DARK_CLASS), false)
  assert.ok(lightHtml.includes('data-portal="null"'))
  assert.ok(lightHtml.includes("<svg"))
  assert.ok(lightHtml.includes("<path"))

  const darkHtml = renderToStaticMarkup(
    React.createElement(
      BlueprintDashboardProvider,
      {theme: "dark"},
      React.createElement(Probe),
    ),
  )
  assert.ok(darkHtml.includes(`class="${BLUEPRINT_ROOT_CLASS} ${BLUEPRINT_DARK_CLASS}"`))
  assert.ok(darkHtml.includes('data-bp-color-scheme="dark"'))
})

test("mountBlueprintDashboard syncs .bp6-dark, contains Drawer/Popover/Tooltip/Select portals, and cleans up on destroy", async () => {
  await withHappyDom(async (win) => {
    const root = win.document.createElement("div")
    win.document.body.appendChild(root)

    const {api, setTheme} = createDashboardApi({initialTheme: "light"})
    let observedPortalContainer = null

    function Dashboard() {
      const portalContainer = useBlueprintPortalContainer()
      observedPortalContainer = portalContainer
      const [selected, setSelected] = useState("hub-a")

      return React.createElement(
        "div",
        null,
        React.createElement(
          Card,
          null,
          React.createElement(PulseIcon, null),
          React.createElement(
            Tooltip,
            {content: React.createElement("span", {"data-testid": "tooltip-body"}, "Tip"), isOpen: true},
            React.createElement(Button, {text: "Hover"}),
          ),
          React.createElement(
            PopoverNext,
            {content: React.createElement("div", {"data-testid": "popover-body"}, "PopoverBody"), isOpen: true},
            React.createElement(Button, {text: "Popover"}),
          ),
          React.createElement(
            Select,
            {
              items: ["hub-a", "hub-b"],
              filterable: false,
              popoverProps: {isOpen: true},
              itemRenderer: (item, {handleClick}) => React.createElement(MenuItem, {key: item, text: item, onClick: handleClick}),
              onItemSelect: setSelected,
            },
            React.createElement(Button, {text: selected}),
          ),
        ),
        React.createElement(
          Drawer,
          {isOpen: true, title: "Spoke Detail", hasBackdrop: true},
          React.createElement("div", {"data-testid": "drawer-body"}, "DrawerBody"),
        ),
      )
    }

    const mounted = await mountBlueprintDashboard(Dashboard)(root, {}, api)
    await flushReact()

    const styleEl = root.querySelector(`style[${BLUEPRINT_STYLE_ATTRIBUTE}="true"]`)
    assert.ok(styleEl, "style tag should be mounted inside root")
    assert.equal(win.document.head.querySelectorAll(`style[${BLUEPRINT_STYLE_ATTRIBUTE}]`).length, 0)

    const wrapper = root.querySelector(`.${BLUEPRINT_ROOT_CLASS}`)
    assert.ok(wrapper)
    assert.equal(wrapper.classList.contains(BLUEPRINT_DARK_CLASS), false)

    const portalHost = wrapper.querySelector(`[${BLUEPRINT_PORTAL_ATTRIBUTE}="true"]`)
    assert.ok(portalHost)
    assert.equal(observedPortalContainer, portalHost)
    assert.ok(portalHost.classList.contains(BLUEPRINT_PORTAL_CLASS))

    // All portals must live strictly inside .sr-dashboard-blueprint-portals, zero in document.body
    const bodyDirectPortals = Array.from(win.document.body.children).filter((el) => el.classList.contains("bp6-portal"))
    assert.equal(bodyDirectPortals.length, 0)

    assert.ok(portalHost.querySelector('[data-testid="drawer-body"]'), "Drawer portal must be inside portalHost")
    assert.ok(portalHost.querySelector('[data-testid="popover-body"]'), "PopoverNext portal must be inside portalHost")
    assert.ok(portalHost.querySelector('[data-testid="tooltip-body"]'), "Tooltip portal must be inside portalHost")
    assert.ok(portalHost.querySelector(".bp6-select-popover"), "Select portal must be inside portalHost")
    assert.ok(wrapper.querySelector(".bp6-icon svg path"), "Modular SVG icon path must render")

    // Live theme toggle light -> dark -> light
    setTheme("dark")
    await flushReact()
    assert.equal(wrapper.classList.contains(BLUEPRINT_DARK_CLASS), true)
    assert.equal(wrapper.getAttribute("data-bp-color-scheme"), "dark")

    setTheme("light")
    await flushReact()
    assert.equal(wrapper.classList.contains(BLUEPRINT_DARK_CLASS), false)
    assert.equal(wrapper.getAttribute("data-bp-color-scheme"), "light")

    // Detached and idempotent destroy
    const detachedDestroy = mounted.destroy
    detachedDestroy()
    detachedDestroy()
    await flushReact()

    assert.equal(root.children.length, 0)
    assert.equal(win.document.body.querySelectorAll(".bp6-portal").length, 0)
    assert.equal(win.document.querySelectorAll(`style[${BLUEPRINT_STYLE_ATTRIBUTE}]`).length, 0)
  })
})

test("multi-instance isolation and remount cleanup preserve sibling dashboards", async () => {
  await withHappyDom(async (win) => {
    const rootA = win.document.createElement("div")
    const rootB = win.document.createElement("div")
    win.document.body.append(rootA, rootB)

    const hostA = createDashboardApi({initialTheme: "dark"})
    const hostB = createDashboardApi({initialTheme: "light"})

    function InstanceView({label}) {
      return React.createElement(
        Drawer,
        {isOpen: true, title: label, hasBackdrop: false},
        React.createElement("span", {"data-instance": label}, label),
      )
    }

    const mountA = mountBlueprintDashboard(() => React.createElement(InstanceView, {label: "A"}))
    const mountB = mountBlueprintDashboard(() => React.createElement(InstanceView, {label: "B"}))

    const handleA = await mountA(rootA, {}, hostA.api)
    const handleB = await mountB(rootB, {}, hostB.api)
    await flushReact()

    assert.ok(rootA.querySelector(`.${BLUEPRINT_ROOT_CLASS}.${BLUEPRINT_DARK_CLASS}`))
    assert.equal(rootB.querySelector(`.${BLUEPRINT_ROOT_CLASS}`).classList.contains(BLUEPRINT_DARK_CLASS), false)
    assert.ok(rootA.querySelector('[data-instance="A"]'))
    assert.ok(rootB.querySelector('[data-instance="B"]'))

    // Destroy A; B must stay completely intact
    handleA.destroy()
    await flushReact()
    assert.equal(rootA.children.length, 0)
    assert.ok(rootB.querySelector(`style[${BLUEPRINT_STYLE_ATTRIBUTE}]`))
    assert.ok(rootB.querySelector('[data-instance="B"]'))

    // Remount B without prior destroy: must not duplicate <style>
    const handleB2 = await mountB(rootB, {}, hostB.api)
    await flushReact()
    assert.equal(rootB.querySelectorAll(`style[${BLUEPRINT_STYLE_ATTRIBUTE}]`).length, 1)
    assert.ok(rootB.querySelector('[data-instance="B"]'))

    handleB2.destroy()
    await flushReact()
    assert.equal(rootB.children.length, 0)
  })
})

test("mountBlueprintDashboard honors waitForReady option", async () => {
  await withHappyDom(async (win) => {
    const root = win.document.createElement("div")
    win.document.body.appendChild(root)
    const {api} = createDashboardApi()
    let readyFired = false

    function AsyncDashboard() {
      const markReady = useDashboardReady()
      useEffect(() => {
        const timer = setTimeout(() => {
          readyFired = true
          markReady()
        }, 20)
        return () => clearTimeout(timer)
      }, [markReady])
      return React.createElement(Card, null, "async-ready")
    }

    const mounted = await mountBlueprintDashboard(AsyncDashboard, {waitForReady: true})(root, {}, api)
    assert.equal(readyFired, true)
    assert.ok(root.textContent.includes("async-ready"))
    mounted.destroy()
    await flushReact()
    assert.equal(root.children.length, 0)
  })
})

test("standalone BlueprintDashboardProvider injects/cleans scoped styles and supports injectStyles: false", async () => {
  await withHappyDom(async (win) => {
    const root = win.document.createElement("div")
    win.document.body.appendChild(root)
    const {api} = createDashboardApi({initialTheme: "dark"})
    const reactRoot = createRoot(root)

    function StandaloneApp() {
      const portalContainer = useBlueprintPortalContainer()
      return React.createElement(
        "span",
        {"data-has-portal": String(Boolean(portalContainer))},
        "standalone",
      )
    }

    reactRoot.render(
      React.createElement(
        BlueprintDashboardProvider,
        {host: {}, api},
        React.createElement(StandaloneApp),
      ),
    )
    await flushReact()

    const wrapper = root.querySelector(`.${BLUEPRINT_ROOT_CLASS}`)
    assert.ok(wrapper)
    assert.ok(wrapper.classList.contains(BLUEPRINT_DARK_CLASS))
    assert.ok(wrapper.querySelector(`style[${BLUEPRINT_STYLE_ATTRIBUTE}="true"]`))
    assert.ok(wrapper.querySelector('[data-has-portal="true"]'))

    reactRoot.unmount()
    await flushReact()
    assert.equal(root.children.length, 0)

    const rootNoStyles = win.document.createElement("div")
    win.document.body.appendChild(rootNoStyles)
    const mountedNoStyles = await mountBlueprintDashboard(
      () => React.createElement(Card, null, "no-styles"),
      {injectStyles: false},
    )(rootNoStyles, {}, api)
    await flushReact()

    assert.equal(rootNoStyles.querySelectorAll(`style[${BLUEPRINT_STYLE_ATTRIBUTE}]`).length, 0)
    assert.ok(rootNoStyles.textContent.includes("no-styles"))
    mountedNoStyles.destroy()
    await flushReact()
    assert.equal(rootNoStyles.children.length, 0)
  })
})

