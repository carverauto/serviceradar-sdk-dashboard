export function createDashboardQueryState(options = {}) {
  const {
    initialState = {},
    baseQuery = "",
    buildQuery,
    buildFrameQueries,
    serializeFilters,
    hydrateFilters,
    debounceMs = 0,
    onBeforeApply,
    onAfterApply,
    srqlClient,
    apply: applyFn,
    timers = defaultTimers,
  } = options

  let state = cloneState(initialState)
  let pendingState = null
  let timer = null
  let committedFingerprint = computeFingerprint(state)
  const listeners = new Set()

  function computeFingerprint(nextState) {
    const {query, frameQueries} = computeQuery(nextState)
    return fingerprint(query, frameQueries)
  }

  function computeQuery(nextState) {
    const query = typeof buildQuery === "function"
      ? normalizeQuery(buildQuery(nextState))
      : normalizeQuery(baseQuery)
    const frameQueries = typeof buildFrameQueries === "function"
      ? sanitizeFrameQueries(buildFrameQueries(nextState))
      : {}
    return {query, frameQueries}
  }

  function clearTimer() {
    if (timer != null) {
      timers.clear(timer)
      timer = null
    }
  }

  function commit() {
    clearTimer()
    if (pendingState !== null) {
      state = pendingState
      pendingState = null
    }

    const {query, frameQueries} = computeQuery(state)
    const fp = fingerprint(query, frameQueries)

    if (fp === committedFingerprint) {
      notify()
      return
    }

    onBeforeApply?.({state, query, frameQueries})
    committedFingerprint = fp
    runApply(query, frameQueries)
    onAfterApply?.({state, query, frameQueries})
    notify()
  }

  function runApply(query, frameQueries) {
    if (typeof applyFn === "function") {
      applyFn(query, frameQueries)
      return
    }

    if (srqlClient && typeof srqlClient.update === "function") {
      srqlClient.update(query, frameQueries)
    }
  }

  function schedule(opts) {
    const requestedMs = opts && Number.isFinite(opts.debounceMs) ? opts.debounceMs : debounceMs
    const ms = Math.max(0, Number(requestedMs) || 0)

    if (ms === 0 || (opts && opts.immediate)) {
      commit()
      return
    }

    clearTimer()
    timer = timers.set(commit, ms)
    notify()
  }

  function applyAction(patchOrFn, opts) {
    const base = pendingState !== null ? pendingState : state
    const patch = typeof patchOrFn === "function" ? patchOrFn(base) : patchOrFn

    if (patch && typeof patch === "object" && !Array.isArray(patch)) {
      pendingState = {...base, ...patch}
    } else {
      pendingState = cloneState(patch ?? base)
    }

    schedule(opts)
  }

  function reset(opts = {}) {
    pendingState = cloneState(initialState)
    if (opts.immediate === false) {
      schedule(opts)
    } else {
      commit()
    }
  }

  function getSnapshot() {
    const effective = pendingState !== null ? pendingState : state
    const {query, frameQueries} = computeQuery(effective)
    const fp = fingerprint(query, frameQueries)
    return {
      state: effective,
      query,
      frameQueries,
      dirty: pendingState !== null && fp !== committedFingerprint,
    }
  }

  function notify() {
    if (listeners.size === 0) return
    const snapshot = getSnapshot()
    for (const listener of listeners) listener(snapshot)
  }

  return {
    apply: applyAction,
    reset,
    flush: commit,
    getState() {
      return pendingState !== null ? pendingState : state
    },
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    serialize() {
      const effective = pendingState !== null ? pendingState : state
      return typeof serializeFilters === "function" ? serializeFilters(effective) : effective
    },
    hydrate(input) {
      const next = typeof hydrateFilters === "function" ? hydrateFilters(input) : input
      pendingState = cloneState(next ?? initialState)
      commit()
    },
    destroy() {
      clearTimer()
      listeners.clear()
    },
  }
}

export function fingerprintQueryState(query, frameQueries) {
  return fingerprint(normalizeQuery(query), sanitizeFrameQueries(frameQueries))
}

function fingerprint(query, frameQueries) {
  const keys = Object.keys(frameQueries).sort()
  const ordered = keys.map((key) => [key, frameQueries[key]])
  return JSON.stringify([query, ordered])
}

function normalizeQuery(value) {
  return String(value ?? "").trim()
}

function sanitizeFrameQueries(input) {
  if (!input || typeof input !== "object") return {}
  const out = {}

  for (const key of Object.keys(input).sort()) {
    const value = input[key]
    if (value == null) continue
    const normalized = String(value).trim()
    if (normalized) out[key] = normalized
  }

  return out
}

function cloneState(value) {
  if (value == null) return {}
  if (Array.isArray(value)) return value.slice()
  if (typeof value === "object") return {...value}
  return value
}

const defaultTimers = {
  set(callback, ms) {
    return setTimeout(callback, ms)
  },
  clear(handle) {
    clearTimeout(handle)
  },
}
