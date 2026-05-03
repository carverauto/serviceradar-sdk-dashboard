import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import {renderToStaticMarkup} from "react-dom/server"

import {
  DashboardProvider,
  useDashboardDetails,
  useDashboardPopup,
  useDashboardPreferences,
  useDashboardSavedQueries,
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
