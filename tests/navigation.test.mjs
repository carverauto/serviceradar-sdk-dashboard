import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import {createRoot} from "react-dom/client"
import {renderToStaticMarkup} from "react-dom/server"
import {Window} from "happy-dom"

import {
  createDashboardNavigation,
  formatNavigationHash,
  parseNavigationHash,
} from "../src/navigation.js"
import {createDashboardNavigation as createFromIndex} from "../src/index.js"
import {DashboardProvider, useDashboardNavigation} from "../src/react.js"

function makeFakeWindow({
  pathname = "/dashboards/horizon",
  search = "",
  hash = "",
  historyState = null,
  throwOnPushState = false,
  throwOnReplaceState = false,
} = {}) {
  const listeners = new Map()
  const calls = []
  const stack = [{url: `${pathname}${search}${hash}`, hash, state: historyState}]
  let index = 0

  const location = {
    pathname,
    search,
    get hash() {
      return stack[index].hash
    },
    set hash(next) {
      const normalized = next ? (next.startsWith("#") ? next : `#${next}`) : ""
      calls.push({method: "location.hash", hash: normalized})
      stack.splice(index + 1)
      stack.push({url: `${pathname}${search}${normalized}`, hash: normalized, state: stack[index].state})
      index = stack.length - 1
    },
  }

  function extractHash(url) {
    const str = String(url ?? "")
    const idx = str.indexOf("#")
    return idx >= 0 ? str.slice(idx) : ""
  }

  const history = {
    get state() {
      return stack[index].state
    },
    pushState(state, unused, url) {
      calls.push({method: "pushState", state, unused, url})
      if (throwOnPushState) throw new Error("SecurityError: pushState blocked")
      const nextHash = extractHash(url)
      stack.splice(index + 1)
      stack.push({url: String(url ?? ""), hash: nextHash, state})
      index = stack.length - 1
    },
    replaceState(state, unused, url) {
      calls.push({method: "replaceState", state, unused, url})
      if (throwOnReplaceState) throw new Error("SecurityError: replaceState blocked")
      const nextHash = extractHash(url)
      stack[index] = {url: String(url ?? ""), hash: nextHash, state}
    },
    back() {
      calls.push({method: "back"})
      if (index > 0) {
        index -= 1
        win.dispatch("popstate")
        win.dispatch("hashchange")
      }
    },
    forward() {
      calls.push({method: "forward"})
      if (index < stack.length - 1) {
        index += 1
        win.dispatch("popstate")
        win.dispatch("hashchange")
      }
    },
  }

  const win = {
    location,
    history,
    calls,
    stack,
    get index() {
      return index
    },
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(fn)
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn)
    },
    dispatch(type) {
      const set = listeners.get(type)
      if (!set) return
      for (const fn of [...set]) fn({type})
    },
  }

  return win
}

test("re-exported from package root index", () => {
  assert.equal(createFromIndex, createDashboardNavigation)
})

test("hydrates initial state from window.location.hash with fallback to defaults", () => {
  const win = makeFakeWindow({hash: "#tab=probes&extra=ignored"})
  const nav = createDashboardNavigation({
    defaults: {tab: "overview", target: ""},
    window: win,
  })

  assert.deepEqual(nav.getState(), {tab: "probes", target: ""})
  nav.destroy()
})

test("navigate pushes history by default and replaces when replace: true", () => {
  const win = makeFakeWindow()
  const nav = createDashboardNavigation({
    defaults: {tab: "overview", target: "", q: ""},
    window: win,
  })

  nav.navigate({tab: "probes", target: "core-1"})
  assert.deepEqual(nav.getState(), {tab: "probes", target: "core-1", q: ""})
  assert.equal(win.calls.length, 1)
  assert.equal(win.calls[0].method, "pushState")
  assert.equal(win.calls[0].url, "#tab=probes&target=core-1")
  assert.equal(win.stack.length, 2)

  nav.navigate({q: "den"}, {replace: true})
  assert.deepEqual(nav.getState(), {tab: "probes", target: "core-1", q: "den"})
  assert.equal(win.calls.length, 2)
  assert.equal(win.calls[1].method, "replaceState")
  assert.equal(win.calls[1].url, "#tab=probes&target=core-1&q=den")
  assert.equal(win.stack.length, 2)

  // Functional updater and no-op deduplication
  nav.navigate((prev) => ({target: prev.target === "core-1" ? "core-2" : "core-1"}))
  assert.equal(nav.getState().target, "core-2")
  assert.equal(win.calls.length, 3)

  nav.navigate({target: "core-2"})
  assert.equal(win.calls.length, 3, "identical state must not push duplicate history entry")

  // Returning all fields to defaults clears the hash cleanly
  nav.navigate({tab: "overview", target: "", q: ""})
  assert.equal(win.calls.length, 4)
  assert.equal(win.calls[3].url, "/dashboards/horizon")

  nav.destroy()
})

test("preserves existing window.history.state on both pushState and replaceState (Phoenix LiveView safety)", () => {
  const liveViewState = {type: "patch", id: "phx-F9x1", position: 3, scroll: 240}
  const win = makeFakeWindow({historyState: liveViewState})
  const nav = createDashboardNavigation({
    defaults: {tab: "overview", q: ""},
    window: win,
  })

  nav.navigate({tab: "targets"})
  assert.equal(win.calls[0].method, "pushState")
  assert.strictEqual(win.calls[0].state, liveViewState)
  assert.strictEqual(win.history.state, liveViewState)

  nav.navigate({q: "edge"}, {replace: true})
  assert.equal(win.calls[1].method, "replaceState")
  assert.strictEqual(win.calls[1].state, liveViewState)
  assert.strictEqual(win.history.state, liveViewState)

  nav.destroy()
})

test("Browser Back and Forward deduplicate popstate + hashchange without push-back loops", () => {
  const win = makeFakeWindow()
  const nav = createDashboardNavigation({
    defaults: {tab: "overview", target: ""},
    window: win,
  })

  const events = []
  nav.subscribe((state) => events.push({...state}))

  nav.navigate({tab: "probes"})
  nav.navigate({tab: "probes", target: "rtr-1"})
  assert.equal(events.length, 2)
  assert.equal(win.calls.length, 2)

  // Browser Back triggers BOTH popstate and hashchange
  nav.back()
  assert.deepEqual(nav.getState(), {tab: "probes", target: ""})
  assert.equal(events.length, 3, "popstate + hashchange must notify only once")
  assert.deepEqual(events[2], {tab: "probes", target: ""})
  // Only pushState x2 + back x1; zero push-back writes
  assert.deepEqual(
    win.calls.map((c) => c.method),
    ["pushState", "pushState", "back"],
  )

  // Browser Back again to initial defaults
  nav.back()
  assert.deepEqual(nav.getState(), {tab: "overview", target: ""})
  assert.equal(events.length, 4)

  // Browser Forward restores probes
  nav.forward()
  assert.deepEqual(nav.getState(), {tab: "probes", target: ""})
  assert.equal(events.length, 5)

  // Browser Forward again restores rtr-1
  nav.forward()
  assert.deepEqual(nav.getState(), {tab: "probes", target: "rtr-1"})
  assert.equal(events.length, 6)
  assert.deepEqual(
    win.calls.map((c) => c.method),
    ["pushState", "pushState", "back", "back", "forward", "forward"],
  )

  nav.destroy()
})

test("invalid hash params fall back to defaults via validValues and validate", () => {
  const win = makeFakeWindow({hash: "#tab=bogus&mode=invalid&target=node-9"})
  const nav = createDashboardNavigation({
    defaults: {tab: "overview", mode: "live", target: ""},
    validValues: {
      tab: ["overview", "probes", "targets"],
      mode: new Set(["live", "replay"]),
      target: (val) => val === "" || /^node-\d+$/.test(val),
    },
    validate(candidate) {
      // Cross-field invariant: target is only kept on probes tab
      if (candidate.tab !== "probes") return {...candidate, target: ""}
      return candidate
    },
    window: win,
  })

  assert.deepEqual(nav.getState(), {tab: "overview", mode: "live", target: ""})

  nav.navigate({tab: "probes", target: "node-42"})
  assert.deepEqual(nav.getState(), {tab: "probes", mode: "live", target: "node-42"})

  nav.navigate({target: "not-a-node"})
  assert.deepEqual(nav.getState(), {tab: "probes", mode: "live", target: ""})

  nav.destroy()
})

test("supports hashPrefix for reading and writing namespaced hashes", () => {
  assert.deepEqual(
    parseNavigationHash("#nav/tab=probes", {defaults: {tab: "overview"}, hashPrefix: "nav/"}),
    {tab: "probes"},
  )
  assert.deepEqual(
    parseNavigationHash("#tab=probes", {defaults: {tab: "overview"}, hashPrefix: "nav/"}),
    {tab: "overview"},
  )
  assert.equal(
    formatNavigationHash({tab: "probes"}, {defaults: {tab: "overview"}, hashPrefix: "nav/"}),
    "#nav/tab=probes",
  )

  const win = makeFakeWindow({hash: "#nav/tab=targets"})
  const nav = createDashboardNavigation({
    defaults: {tab: "overview"},
    hashPrefix: "nav/",
    window: win,
  })
  assert.deepEqual(nav.getState(), {tab: "targets"})

  nav.navigate({tab: "probes"})
  assert.equal(win.calls[0].url, "#nav/tab=probes")

  nav.destroy()
})

test("falls back to window.location.hash when history.pushState/replaceState throws (sandboxed iframe)", () => {
  const win = makeFakeWindow({throwOnPushState: true, throwOnReplaceState: true})
  const nav = createDashboardNavigation({
    defaults: {tab: "overview", q: ""},
    window: win,
  })

  const events = []
  nav.subscribe((state) => events.push({...state}))

  nav.navigate({tab: "probes"})
  assert.deepEqual(nav.getState(), {tab: "probes", q: ""})
  assert.equal(win.location.hash, "#tab=probes")
  assert.deepEqual(
    win.calls.map((c) => c.method),
    ["pushState", "location.hash"],
  )
  assert.equal(events.length, 1)

  // Browser fires hashchange after location.hash assignment; must be deduplicated
  win.dispatch("hashchange")
  assert.equal(events.length, 1)

  nav.navigate({q: "abc"}, {replace: true})
  assert.equal(win.location.hash, "#tab=probes&q=abc")
  assert.equal(events.length, 2)

  nav.destroy()
})

test("destroy removes popstate and hashchange listeners and clears subscribers", () => {
  const win = makeFakeWindow()
  const nav = createDashboardNavigation({
    defaults: {tab: "overview"},
    window: win,
  })

  assert.equal(win.listeners.get("popstate")?.size, 1)
  assert.equal(win.listeners.get("hashchange")?.size, 1)

  const events = []
  nav.subscribe((state) => events.push(state))

  nav.destroy()
  assert.equal(win.listeners.get("popstate")?.size, 0)
  assert.equal(win.listeners.get("hashchange")?.size, 0)

  win.location.hash = "#tab=probes"
  win.dispatch("popstate")
  win.dispatch("hashchange")
  nav.navigate({tab: "targets"})

  assert.equal(events.length, 0)
})

test("works gracefully when window is null (SSR / non-browser)", () => {
  const nav = createDashboardNavigation({
    defaults: {tab: "overview"},
    window: null,
  })

  assert.deepEqual(nav.getState(), {tab: "overview"})
  nav.navigate({tab: "probes"})
  assert.deepEqual(nav.getState(), {tab: "probes"})
  nav.back()
  nav.forward()
  nav.destroy()
})

test("useDashboardNavigation() without options preserves host navigation API", () => {
  const calls = []
  const api = {
    navigate(target) {
      calls.push(target)
    },
  }

  function Probe() {
    const nav = useDashboardNavigation()
    nav.toDevice("dev-42")
    nav.toDashboard("horizon")
    return React.createElement("span", null, "ok")
  }

  const html = renderToStaticMarkup(
    React.createElement(DashboardProvider, {host: {}, api}, React.createElement(Probe)),
  )
  assert.equal(html, "<span>ok</span>")
  assert.deepEqual(calls, [
    {type: "device", uid: "dev-42"},
    {type: "dashboard", route_slug: "horizon"},
  ])
})

test("useDashboardNavigation(options) syncs React UI with hash history and cleans up on unmount", async () => {
  const liveViewState = {type: "live_redirect", id: "phx-99", position: 2, scroll: 0}
  const fakeWin = makeFakeWindow({hash: "#tab=probes", historyState: liveViewState})
  const dom = new Window({url: "https://dashboard.serviceradar.test/dashboards/horizon"})

  const keys = ["window", "document", "HTMLElement", "HTMLDivElement", "Element", "Node", "Text"]
  const previous = new Map()
  for (const key of keys) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    const value = key === "window" ? dom : dom[key]
    if (value !== undefined) {
      Object.defineProperty(globalThis, key, {configurable: true, writable: true, value})
    }
  }

  try {
    const container = dom.document.createElement("div")
    dom.document.body.appendChild(container)
    const root = createRoot(container)
    let latestNav = null

    function Dashboard() {
      const nav = useDashboardNavigation({
        defaults: {tab: "overview", target: ""},
        validValues: {tab: ["overview", "probes", "targets"]},
        window: fakeWin,
      })
      latestNav = nav
      return React.createElement("div", null, `${nav.state.tab}:${nav.state.target}`)
    }

    root.render(React.createElement(Dashboard))
    await new Promise((resolve) => setTimeout(resolve, 20))

    assert.equal(container.textContent, "probes:")
    assert.equal(fakeWin.listeners.get("popstate")?.size, 1)

    latestNav.navigate({tab: "targets", target: "edge-1"})
    await new Promise((resolve) => setTimeout(resolve, 20))

    assert.equal(container.textContent, "targets:edge-1")
    assert.strictEqual(fakeWin.history.state, liveViewState)

    latestNav.back()
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(container.textContent, "probes:")

    root.unmount()
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(fakeWin.listeners.get("popstate")?.size, 0)
    assert.equal(fakeWin.listeners.get("hashchange")?.size, 0)
  } finally {
    await dom.happyDOM.close()
    for (const [key, desc] of previous.entries()) {
      if (desc) Object.defineProperty(globalThis, key, desc)
      else delete globalThis[key]
    }
  }
})
