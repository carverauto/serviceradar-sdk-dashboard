import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import {renderToStaticMarkup} from "react-dom/server"

import {
  createActionRunner,
  isTerminalActionState,
  subscribeDashboardEvents,
  useDashboardActions,
  useDashboardActionsAvailable,
  useDashboardEventsAvailable,
  useFrameRefresh,
} from "../src/live.js"
import {DashboardProvider} from "../src/react.js"

function render(api, Component) {
  let result
  function Probe() {
    result = Component()
    return null
  }
  renderToStaticMarkup(React.createElement(DashboardProvider, {host: {}, api}, React.createElement(Probe)))
  return result
}

test("the action runner records every progress step by invocation id", async () => {
  const snapshots = []
  const api = {
    actions: {
      allowed: () => true,
      invoke: async (_request, {onProgress}) => {
        onProgress({invocation_id: "inv-1", state: "dispatching"})
        onProgress({invocation_id: "inv-1", state: "succeeded"})
        return {invocation_id: "inv-1", state: "succeeded"}
      },
    },
  }
  const runner = createActionRunner({api, onChange: (invocations) => snapshots.push(invocations)})

  const result = await runner.invoke({actionId: "northbound:jam", targets: [{deviceUid: "d1"}]})

  assert.equal(result.state, "succeeded")
  assert.deepEqual(
    snapshots.map((invocations) => invocations["inv-1"].state),
    ["dispatching", "succeeded"],
  )
})

test("the action runner rejects when the host has no actions API", async () => {
  await assert.rejects(createActionRunner({api: {}}).invoke({actionId: "a", targets: []}), {code: "capability_denied"})
})

test("event subscriptions pass filter and callback through and report a missing API", () => {
  const seen = []
  const api = {
    events: {
      subscribe(filter, onEvents) {
        seen.push(filter)
        onEvents([{id: "e1"}])
        return () => seen.push("unsubscribed")
      },
    },
  }
  const delivered = []
  const unsubscribe = subscribeDashboardEvents({api, filter: {min_severity_id: 4}, onEvents: (events) => delivered.push(...events)})
  unsubscribe()

  assert.deepEqual(seen, [{min_severity_id: 4}, "unsubscribed"])
  assert.deepEqual(delivered, [{id: "e1"}])

  const errors = []
  assert.equal(subscribeDashboardEvents({api: {}, onEvents: () => {}, onError: (error) => errors.push(error.code)}), null)
  assert.deepEqual(errors, ["capability_denied"])
})

test("a host that throws on subscribe reports the error instead of crashing", () => {
  const errors = []
  const api = {
    events: {
      subscribe() {
        const error = new Error("denied")
        error.code = "permission_denied"
        throw error
      },
    },
  }

  assert.equal(subscribeDashboardEvents({api, onEvents: () => {}, onError: (error) => errors.push(error.code)}), null)
  assert.deepEqual(errors, ["permission_denied"])
})

test("availability follows the host's allowed() answer", () => {
  const api = {actions: {allowed: () => false}, events: {allowed: () => true}}

  assert.equal(render(api, useDashboardActionsAvailable), false)
  assert.equal(render(api, useDashboardEventsAvailable), true)
  assert.equal(render({}, useDashboardEventsAvailable), false)
})

test("useDashboardActions starts empty and reports availability", () => {
  const state = render({actions: {allowed: () => true, list: async () => []}}, () => useDashboardActions())

  assert.equal(state.allowed, true)
  assert.deepEqual(state.actions, [])
  assert.deepEqual(state.invocations, {})
})

test("useFrameRefresh falls back when the host cannot refresh", async () => {
  const refresh = render({}, useFrameRefresh)
  assert.deepEqual(await refresh(), {refreshed: false, reason: "unsupported"})

  const hostRefresh = render({refreshFrames: async () => ({refreshed: true})}, useFrameRefresh)
  assert.deepEqual(await hostRefresh(), {refreshed: true})
})

test("terminal action states", () => {
  assert.equal(isTerminalActionState("succeeded"), true)
  assert.equal(isTerminalActionState("running"), false)
})
