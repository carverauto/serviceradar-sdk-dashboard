import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import {renderToStaticMarkup} from "react-dom/server"

import {
  ActionConfirmationDeclinedError,
  actionRequiresConfirmation,
  createActionRunner,
  DashboardCapabilityError,
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
  assert.deepEqual(state.confirmations, {})
  assert.equal(state.pendingConfirmation, null)
  assert.equal(state.declinedConfirmation, null)
})

// A host stand-in that holds an invoke for confirmation the way web-ng does:
// it reports `pending`, then settles when the test plays the operator.
function confirmingHost({capabilities = ["actions.invoke"]} = {}) {
  const held = []
  const calls = []
  const api = {
    capabilityAllowed: (capability) => capabilities.includes(capability),
    actions: {
      allowed: () => true,
      list: async () => [{id: "northbound:reboot", requires_confirmation: true}],
      invoke(request, {onProgress, onConfirmation}) {
        calls.push(request)
        return new Promise((resolve, reject) => {
          onConfirmation({state: "pending", confirmation_id: "conf-1", action_id: request.actionId, expires_in_ms: 120000})
          held.push({
            confirm() {
              onConfirmation({state: "confirmed", confirmation_id: "conf-1", action_id: request.actionId})
              onProgress({invocation_id: "inv-1", state: "dispatching"})
              onProgress({invocation_id: "inv-1", state: "succeeded"})
              resolve({invocation_id: "inv-1", state: "succeeded"})
            },
            refuse(state) {
              onConfirmation({state, confirmation_id: "conf-1", action_id: request.actionId})
              const error = new Error(`confirmation ${state}`)
              error.code = `confirmation_${state}`
              error.confirmationId = "conf-1"
              reject(error)
            },
          })
        })
      },
    },
  }
  return {api, held, calls}
}

const rebootRequest = {actionId: "northbound:reboot", targets: [{deviceUid: "sr:device:sample-01"}]}

test("a confirmation-required invoke resolves only after the host confirms", async () => {
  const {api, held} = confirmingHost()
  const confirmationSnapshots = []
  const runner = createActionRunner({api, onConfirmationChange: (map) => confirmationSnapshots.push(map)})
  let settled = false

  const result = runner.invoke(rebootRequest).then((progress) => {
    settled = true
    return progress
  })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(settled, false)
  assert.equal(runner.confirmations()["conf-1"].state, "pending")
  assert.deepEqual(runner.invocations(), {})

  held[0].confirm()

  assert.deepEqual(await result, {invocation_id: "inv-1", state: "succeeded"})
  assert.deepEqual(
    confirmationSnapshots.map((map) => map["conf-1"].state),
    ["pending", "confirmed"],
  )
  assert.equal(runner.invocations()["inv-1"].state, "succeeded")
})

test("a declined, expired or refused confirmation rejects with ActionConfirmationDeclinedError", async () => {
  for (const state of ["declined", "expired", "rejected"]) {
    const {api, held} = confirmingHost()
    const runner = createActionRunner({api})
    const result = runner.invoke(rebootRequest)
    await new Promise((resolve) => setImmediate(resolve))
    held[0].refuse(state)

    await assert.rejects(result, (error) => {
      assert.ok(error instanceof ActionConfirmationDeclinedError)
      assert.equal(error.reason, state)
      assert.equal(error.code, `confirmation_${state}`)
      assert.equal(error.actionId, "northbound:reboot")
      assert.equal(error.confirmationId, "conf-1")
      return true
    })
    assert.equal(runner.confirmations()["conf-1"].state, state)
    assert.deepEqual(runner.invocations(), {})
  }
})

test("other host errors pass through unchanged", async () => {
  const hostError = Object.assign(new Error("You are not authorized to launch actions."), {code: "rejected"})
  const runner = createActionRunner({
    api: {actions: {invoke: () => Promise.reject(hostError)}},
  })

  await assert.rejects(runner.invoke(rebootRequest), (error) => error === hostError)
})

test("actions reject with a capability error when the manifest lacks actions.invoke", async () => {
  const {api, calls} = confirmingHost({capabilities: ["srql.execute"]})
  const runner = createActionRunner({api})

  for (const call of [runner.invoke(rebootRequest), runner.list({scope: "device"})]) {
    await assert.rejects(call, (error) => {
      assert.ok(error instanceof DashboardCapabilityError)
      assert.equal(error.code, "capability_denied")
      assert.equal(error.capability, "actions.invoke")
      return true
    })
  }
  assert.deepEqual(calls, [])

  const state = render(api, () => useDashboardActions())
  assert.equal(state.allowed, false)
  assert.equal(render(api, useDashboardActionsAvailable), false)
})

test("event subscriptions report a capability error when the manifest lacks events.subscribe", () => {
  let subscribed = false
  const api = {
    capabilityAllowed: () => false,
    events: {allowed: () => true, subscribe: () => (subscribed = true)},
  }
  const errors = []

  assert.equal(subscribeDashboardEvents({api, onEvents: () => {}, onError: (error) => errors.push(error)}), null)
  assert.equal(subscribed, false)
  assert.ok(errors[0] instanceof DashboardCapabilityError)
  assert.equal(errors[0].capability, "events.subscribe")
  assert.equal(render(api, useDashboardEventsAvailable), false)
})

test("actionRequiresConfirmation reads the descriptor flag", () => {
  assert.equal(actionRequiresConfirmation({requires_confirmation: true}), true)
  assert.equal(actionRequiresConfirmation({requires_confirmation: false}), false)
  assert.equal(actionRequiresConfirmation(null), false)
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
