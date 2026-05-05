import assert from "node:assert/strict"
import test from "node:test"

import {createDashboardQueryState, fingerprintQueryState} from "../src/query-state.js"

function makeRecorder() {
  const calls = []
  return {
    calls,
    apply(query, frameQueries) {
      calls.push({query, frameQueries})
    },
  }
}

function makeFakeTimers() {
  const queue = new Map()
  let id = 0
  return {
    queue,
    timers: {
      set(callback, ms) {
        const handle = ++id
        queue.set(handle, {callback, ms})
        return handle
      },
      clear(handle) {
        queue.delete(handle)
      },
    },
    runAll() {
      const entries = Array.from(queue.values())
      queue.clear()
      for (const entry of entries) entry.callback()
    },
  }
}

test("apply commits immediately when no debounce is configured", () => {
  const recorder = makeRecorder()
  const controller = createDashboardQueryState({
    initialState: {},
    buildQuery: (state) => state.q || "in:wifi_sites limit:500",
    apply: recorder.apply,
  })

  controller.apply({q: "in:wifi_sites site_code:(DEN) limit:500"})

  assert.equal(recorder.calls.length, 1)
  assert.equal(recorder.calls[0].query, "in:wifi_sites site_code:(DEN) limit:500")
  assert.deepEqual(recorder.calls[0].frameQueries, {})
})

test("dedupe suppresses identical query and frame override fingerprints", () => {
  const recorder = makeRecorder()
  const controller = createDashboardQueryState({
    initialState: {region: null},
    buildQuery: (state) => state.region ? `in:wifi_sites region:(${state.region}) limit:500` : "in:wifi_sites limit:500",
    buildFrameQueries: (state) => ({
      aps: state.region ? `in:wifi_aps region:(${state.region}) limit:500` : "in:wifi_aps limit:500",
    }),
    apply: recorder.apply,
  })

  controller.apply({region: "AMERICAS"})
  controller.apply({region: "AMERICAS"})
  controller.apply({region: "AMERICAS"})

  assert.equal(recorder.calls.length, 1)
  assert.equal(recorder.calls[0].query, "in:wifi_sites region:(AMERICAS) limit:500")
  assert.deepEqual(recorder.calls[0].frameQueries, {aps: "in:wifi_aps region:(AMERICAS) limit:500"})
})

test("debounce coalesces rapid changes into a single commit", () => {
  const recorder = makeRecorder()
  const fake = makeFakeTimers()
  const controller = createDashboardQueryState({
    initialState: {q: ""},
    buildQuery: (state) => `in:devices name:%${state.q || ""}% limit:50`,
    apply: recorder.apply,
    debounceMs: 200,
    timers: fake.timers,
  })

  controller.apply({q: "a"})
  controller.apply({q: "ap"})
  controller.apply({q: "ap-"})
  controller.apply({q: "ap-100"})

  assert.equal(recorder.calls.length, 0, "no commits during debounce window")
  assert.equal(controller.getSnapshot().dirty, true)
  assert.equal(controller.getSnapshot().state.q, "ap-100")

  fake.runAll()

  assert.equal(recorder.calls.length, 1)
  assert.equal(recorder.calls[0].query, "in:devices name:%ap-100% limit:50")
  assert.equal(controller.getSnapshot().dirty, false)
})

test("reset restores initial state and clears overrides immediately", () => {
  const recorder = makeRecorder()
  const controller = createDashboardQueryState({
    initialState: {region: null, ap: null},
    buildQuery: (state) => state.region ? `in:wifi_sites region:(${state.region}) limit:500` : "in:wifi_sites limit:500",
    buildFrameQueries: (state) => state.ap ? {ap_detail: `in:wifi_aps mac:(${state.ap})`} : {},
    apply: recorder.apply,
  })

  controller.apply({region: "EMEA", ap: "aa:bb:cc:dd:ee:ff"})
  assert.equal(recorder.calls.length, 1)
  assert.equal(recorder.calls[0].query, "in:wifi_sites region:(EMEA) limit:500")
  assert.deepEqual(recorder.calls[0].frameQueries, {ap_detail: "in:wifi_aps mac:(aa:bb:cc:dd:ee:ff)"})

  controller.reset()

  assert.equal(recorder.calls.length, 2)
  assert.equal(recorder.calls[1].query, "in:wifi_sites limit:500")
  assert.deepEqual(recorder.calls[1].frameQueries, {})
  assert.deepEqual(controller.getState(), {region: null, ap: null})
})

test("flush forces a pending debounced commit", () => {
  const recorder = makeRecorder()
  const fake = makeFakeTimers()
  const controller = createDashboardQueryState({
    initialState: {q: ""},
    buildQuery: (state) => `in:devices name:%${state.q || ""}% limit:50`,
    apply: recorder.apply,
    debounceMs: 200,
    timers: fake.timers,
  })

  controller.apply({q: "wlc"})
  assert.equal(recorder.calls.length, 0)

  controller.flush()
  assert.equal(recorder.calls.length, 1)
  assert.equal(recorder.calls[0].query, "in:devices name:%wlc% limit:50")
})

test("optimistic host sync is independent of debounced commit", () => {
  const recorder = makeRecorder()
  const fake = makeFakeTimers()
  const controller = createDashboardQueryState({
    initialState: {q: ""},
    buildQuery: (state) => `in:devices name:%${state.q || ""}% limit:50`,
    apply: recorder.apply,
    debounceMs: 200,
    timers: fake.timers,
  })

  controller.apply({q: "den"})
  assert.equal(controller.getSnapshot().state.q, "den")
  assert.equal(controller.getSnapshot().query, "in:devices name:%den% limit:50")
  assert.equal(controller.getSnapshot().dirty, true)
  assert.equal(recorder.calls.length, 0)

  fake.runAll()
  assert.equal(recorder.calls.length, 1)
  assert.equal(controller.getSnapshot().dirty, false)
})

test("subscribe receives snapshots on schedule and commit", () => {
  const recorder = makeRecorder()
  const fake = makeFakeTimers()
  const controller = createDashboardQueryState({
    initialState: {q: ""},
    buildQuery: (state) => `in:devices name:%${state.q || ""}% limit:50`,
    apply: recorder.apply,
    debounceMs: 200,
    timers: fake.timers,
  })

  const events = []
  controller.subscribe((snapshot) => events.push(snapshot.state.q))

  controller.apply({q: "x"})
  controller.apply({q: "xy"})
  fake.runAll()

  assert.deepEqual(events, ["x", "xy", "xy"])
})

test("hydrate replaces state and emits a fresh commit", () => {
  const recorder = makeRecorder()
  const controller = createDashboardQueryState({
    initialState: {region: null},
    buildQuery: (state) => state.region ? `in:wifi_sites region:(${state.region}) limit:500` : "in:wifi_sites limit:500",
    apply: recorder.apply,
    hydrateFilters: (input) => ({region: input?.region ?? null}),
  })

  controller.hydrate({region: "APAC"})
  assert.equal(recorder.calls.length, 1)
  assert.equal(recorder.calls[0].query, "in:wifi_sites region:(APAC) limit:500")
})

test("fingerprintQueryState matches helper-internal dedupe", () => {
  const a = fingerprintQueryState("in:wifi_sites limit:500", {ap: "in:wifi_aps limit:500"})
  const b = fingerprintQueryState("in:wifi_sites limit:500", {ap: "in:wifi_aps limit:500"})
  const c = fingerprintQueryState("in:wifi_sites region:(AMERICAS) limit:500", {ap: "in:wifi_aps limit:500"})

  assert.equal(a, b)
  assert.notEqual(a, c)
})

test("buildFrameQueries falsy values are dropped from fingerprint", () => {
  const recorder = makeRecorder()
  const controller = createDashboardQueryState({
    initialState: {ap: null},
    buildQuery: () => "in:wifi_sites limit:500",
    buildFrameQueries: (state) => ({
      ap_detail: state.ap ? `in:wifi_aps mac:(${state.ap})` : null,
    }),
    apply: recorder.apply,
  })

  controller.apply({ap: null})
  controller.apply({ap: null})

  assert.equal(recorder.calls.length, 0, "no-op apply must not commit when fingerprint matches initial")
})

test("delegates to srqlClient.update when no apply override is provided", () => {
  const recorder = []
  const srqlClient = {
    update(query, frameQueries) {
      recorder.push({query, frameQueries})
    },
  }
  const controller = createDashboardQueryState({
    initialState: {region: null},
    buildQuery: (state) => state.region ? `in:wifi_sites region:(${state.region}) limit:500` : "in:wifi_sites limit:500",
    srqlClient,
  })

  controller.apply({region: "AMERICAS"})

  assert.equal(recorder.length, 1)
  assert.equal(recorder[0].query, "in:wifi_sites region:(AMERICAS) limit:500")
})
