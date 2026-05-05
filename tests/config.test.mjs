import assert from "node:assert/strict"
import test from "node:test"

import {DASHBOARD_CONFIG_VERSION, defineDashboardConfig} from "../src/config.js"

test("defineDashboardConfig is identity at runtime", () => {
  const input = {
    manifest: {id: "com.example", name: "Ex", version: "1.0.0"},
    renderer: {entry: "src/main.jsx"},
  }
  assert.equal(defineDashboardConfig(input), input)
})

test("defineDashboardConfig preserves nullish exports at runtime", () => {
  assert.equal(defineDashboardConfig(undefined), undefined)
  assert.equal(defineDashboardConfig(null), null)
})

test("DASHBOARD_CONFIG_VERSION is exposed for downstream pinning", () => {
  assert.equal(DASHBOARD_CONFIG_VERSION, 1)
})
