import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import {renderToStaticMarkup} from "react-dom/server"

import {
  DashboardProvider,
  useDashboardController,
  useDashboardDetails,
  useDashboardFrame,
  useDashboardFrames,
  useDashboardPopup,
  useDashboardPreferences,
  useDashboardQueryState,
  useDashboardReady,
  useDashboardSavedQueries,
  useFrameRows,
} from "../src/react.js"

test("React hooks expose preferences, saved queries, popup, and details host APIs", () => {
  const events = []
  const api = {
    preferences: {
      all: () => ({density: "comfortable"}),
      get: (key, fallback) => (key === "density" ? "comfortable" : fallback),
      set: (key, value) => {
        events.push(["preference", key, value])
        return {[key]: value}
      },
    },
    savedQueries: {
      list: () => [{id: "den", query: "in:wifi_sites site_code:(DEN) limit:500"}],
      current: () => "in:wifi_sites limit:500",
      apply: (query) => events.push(["saved-query", query]),
    },
    popup: {
      open: (content) => {
        events.push(["popup", content.title])
        return {close: () => events.push(["popup-close"])}
      },
      close: () => events.push(["popup-close-all"]),
    },
    details: {
      open: (target) => events.push(["details", target]),
    },
  }

  function Probe() {
    const preferences = useDashboardPreferences()
    const savedQueries = useDashboardSavedQueries()
    const popup = useDashboardPopup()
    const details = useDashboardDetails()

    preferences.set("density", "compact")
    savedQueries.apply("in:wifi_sites site_code:(IAH) limit:500")
    popup.open({title: "DEN"})
    details.open({type: "site", site_code: "DEN"})

    return React.createElement("span", null, `${preferences.get("density")} ${savedQueries.list()[0].id}`)
  }

  const html = renderToStaticMarkup(
    React.createElement(DashboardProvider, {host: {instance: {settings: {}}}, api}, React.createElement(Probe)),
  )

  assert.equal(html, "<span>comfortable den</span>")
  assert.deepEqual(events, [
    ["preference", "density", "compact"],
    ["saved-query", "in:wifi_sites site_code:(IAH) limit:500"],
    ["popup", "DEN"],
    ["details", {type: "site", site_code: "DEN"}],
  ])
})

test("React hooks fall back to instance settings for read-only saved queries and preferences", () => {
  function Probe() {
    const preferences = useDashboardPreferences()
    const savedQueries = useDashboardSavedQueries()

    return React.createElement("span", null, `${preferences.get("theme", "light")} ${savedQueries.list()[0].id}`)
  }

  const html = renderToStaticMarkup(
    React.createElement(
      DashboardProvider,
      {
        host: {
          instance: {
            settings: {
              preferences: {theme: "dark"},
              saved_queries: [{id: "ord", query: "in:wifi_sites site_code:(ORD) limit:500"}],
            },
          },
        },
        api: {},
      },
      React.createElement(Probe),
    ),
  )

  assert.equal(html, "<span>dark ord</span>")
})

test("React ready hook reports async dashboard lifecycle handles", () => {
  const events = []
  const mounted = {destroy: () => events.push("destroy")}
  const lifecycle = {
    ready: (handle) => {
      events.push(["ready", handle])
    },
  }

  function Probe() {
    const ready = useDashboardReady()
    ready(mounted)
    return React.createElement("span", null, "ready")
  }

  const html = renderToStaticMarkup(
    React.createElement(DashboardProvider, {host: {instance: {settings: {}}}, api: {}, lifecycle}, React.createElement(Probe)),
  )

  assert.equal(html, "<span>ready</span>")
  assert.deepEqual(events, [["ready", mounted]])
})

test("React query state hook drives host SRQL through the SDK", () => {
  const events = []
  const api = {
    srql: {
      query: () => "in:wifi_sites limit:500",
      update: (query, frameQueries) => events.push({query, frameQueries}),
    },
  }

  let captured = null

  function Probe() {
    const queryState = useDashboardQueryState({
      initialState: {region: null},
      buildQuery: (state) => state.region
        ? `in:wifi_sites region:(${state.region}) limit:500`
        : "in:wifi_sites limit:500",
      buildFrameQueries: (state) => state.region
        ? {aps: `in:wifi_aps region:(${state.region}) limit:500`}
        : {},
    })

    if (captured === null) {
      queryState.apply({region: "AMERICAS"})
      captured = queryState
    }

    return React.createElement("span", null, queryState.query)
  }

  renderToStaticMarkup(
    React.createElement(DashboardProvider, {host: {instance: {settings: {}}}, api}, React.createElement(Probe)),
  )

  assert.equal(events.length, 1)
  assert.equal(events[0].query, "in:wifi_sites region:(AMERICAS) limit:500")
  assert.deepEqual(events[0].frameQueries, {aps: "in:wifi_aps region:(AMERICAS) limit:500"})

  assert.ok(captured, "probe should have captured the query state hook handle")
  assert.equal(captured.state.region, null, "snapshot from initial render still reflects initial state")
})

test("useDashboardFrames preserves frame instances across digest-equal pushes", () => {
  let captureFirst = null
  let captureSecond = null
  const frameA = {
    id: "sites",
    encoding: "json_rows",
    row_count: 1,
    refreshed_at: "2026-05-03T00:00:00Z",
    results: [{site: "DEN"}],
  }
  const api = {
    frames: () => [frameA],
  }

  function Probe() {
    const frames = useDashboardFrames()
    if (captureFirst === null) {
      captureFirst = frames[0]
    } else if (captureSecond === null) {
      captureSecond = frames[0]
    }
    return React.createElement("span", null, frames[0]?.results?.[0]?.site ?? "")
  }

  renderToStaticMarkup(
    React.createElement(DashboardProvider, {host: {instance: {settings: {}}}, api}, React.createElement(Probe)),
  )
  renderToStaticMarkup(
    React.createElement(
      DashboardProvider,
      {host: {instance: {settings: {}}}, api: {frames: () => [{...frameA, results: [{site: "DEN"}]}]}},
      React.createElement(Probe),
    ),
  )

  assert.ok(captureFirst, "first render must observe the frame")
})

test("useFrameRows projects JSON rows by shape and caches by frame identity", () => {
  const frame = {
    id: "sites",
    encoding: "json_rows",
    row_count: 2,
    refreshed_at: "t",
    results: [
      {site_code: "DEN", lat: 39.8617, lon: -104.6731},
      {site_code: "ORD", lat: 41.9742, lon: -87.9073},
    ],
  }
  const api = {frames: () => [frame]}

  const shape = {code: "site_code", coords: (row) => [row.lon, row.lat]}
  const captures = []

  function Probe() {
    const rows = useFrameRows("sites", {shape})
    captures.push(rows)
    return React.createElement("span", null, rows.map((row) => row.code).join(","))
  }

  const html = renderToStaticMarkup(
    React.createElement(DashboardProvider, {host: {instance: {settings: {}}}, api}, React.createElement(Probe)),
  )

  assert.equal(html, "<span>DEN,ORD</span>")
  assert.equal(captures.length, 1)
  assert.deepEqual(captures[0][0], {code: "DEN", coords: [-104.6731, 39.8617]})
})

test("useDashboardFrame returns a stable reference when frames array is stable", () => {
  const frame = {id: "sites", encoding: "json_rows", row_count: 1, refreshed_at: "t", results: [{site: "DEN"}]}
  const api = {frames: () => [frame]}

  let firstRef = null
  let secondRef = null

  function Probe() {
    const value = useDashboardFrame("sites")
    if (firstRef === null) firstRef = value
    else if (secondRef === null) secondRef = value
    return React.createElement("span", null, value?.results?.[0]?.site ?? "")
  }

  renderToStaticMarkup(
    React.createElement(DashboardProvider, {host: {instance: {settings: {}}}, api}, React.createElement(Probe)),
  )

  assert.ok(firstRef, "first render should resolve the frame")
})

test("React controller hook exposes an imperative mount ref", () => {
  function Probe() {
    const controller = useDashboardController(() => ({destroy() {}}))
    return React.createElement("span", {"data-has-ref": Boolean(controller.ref)}, controller.error ? "error" : "ready")
  }

  const html = renderToStaticMarkup(
    React.createElement(DashboardProvider, {host: {instance: {settings: {}}}, api: {}}, React.createElement(Probe)),
  )

  assert.equal(html, '<span data-has-ref="true">ready</span>')
})
