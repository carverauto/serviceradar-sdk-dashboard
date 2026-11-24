export function createDashboardNavigation(options = {}) {
  const {
    defaults: rawDefaults = {},
    validValues = null,
    validate = null,
    parse = null,
    format = null,
    hashPrefix: rawHashPrefix = "",
    window: injectedWindow,
  } = options

  const win = injectedWindow !== undefined
    ? injectedWindow
    : (typeof globalThis.window !== "undefined" ? globalThis.window : null)

  const defaults = normalizeDefaults(rawDefaults)
  const hashPrefix = normalizePrefix(rawHashPrefix)
  const listeners = new Set()
  let destroyed = false

  let state = readFromWindow()

  function readFromWindow() {
    const rawHash = readLocationHash(win)
    return normalizeState(
      parseHash(rawHash),
      defaults,
      validValues,
      validate,
    )
  }

  function parseHash(rawHash) {
    if (typeof parse === "function") {
      return parse(rawHash, {...defaults})
    }
    return parseNavigationHash(rawHash, {defaults, hashPrefix})
  }

  function formatHash(nextState) {
    if (typeof format === "function") {
      const formatted = String(format(nextState, {...defaults}) ?? "")
      if (!formatted) return ""
      return formatted.startsWith("#") ? formatted : `#${formatted}`
    }
    return formatNavigationHash(nextState, {defaults, hashPrefix})
  }

  function notify() {
    if (listeners.size === 0) return
    for (const listener of listeners) {
      listener(state)
    }
  }

  function writeHash(nextHash, replace) {
    if (!win) return

    const history = win.history
    const targetUrl = buildTargetUrl(win, nextHash)
    const method = replace ? "replaceState" : "pushState"

    if (history && typeof history[method] === "function") {
      try {
        const preservedState = history.state !== undefined ? history.state : null
        history[method](preservedState, "", targetUrl)
        return
      } catch {
        // Sandboxed iframes or opaque origins may reject history mutations;
        // fall through to location.hash assignment.
      }
    }

    if (win.location) {
      try {
        win.location.hash = nextHash
      } catch {
        // Ignore restricted location environments.
      }
    }
  }

  function onLocationChange() {
    if (destroyed) return
    const nextState = readFromWindow()
    if (statesEqual(state, nextState)) return
    state = nextState
    notify()
  }

  if (win && typeof win.addEventListener === "function") {
    win.addEventListener("popstate", onLocationChange)
    win.addEventListener("hashchange", onLocationChange)
  }

  function navigate(patchOrFn, opts = {}) {
    if (destroyed) return
    const patch = typeof patchOrFn === "function" ? patchOrFn(state) : patchOrFn
    const merged = patch && typeof patch === "object" && !Array.isArray(patch)
      ? {...state, ...patch}
      : {...state}

    const nextState = normalizeState(merged, defaults, validValues, validate)
    if (statesEqual(state, nextState)) return

    state = nextState
    const nextHash = formatHash(state)
    writeHash(nextHash, Boolean(opts?.replace))
    notify()
  }

  function back() {
    if (destroyed) return
    try {
      win?.history?.back?.()
    } catch {
      // Ignore restricted history environments.
    }
  }

  function forward() {
    if (destroyed) return
    try {
      win?.history?.forward?.()
    } catch {
      // Ignore restricted history environments.
    }
  }

  function getState() {
    return state
  }

  function subscribe(listener) {
    if (destroyed) return () => {}
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    if (win && typeof win.removeEventListener === "function") {
      win.removeEventListener("popstate", onLocationChange)
      win.removeEventListener("hashchange", onLocationChange)
    }
    listeners.clear()
  }

  return {
    navigate,
    back,
    forward,
    getState,
    subscribe,
    destroy,
  }
}

export function parseNavigationHash(rawHash, options = {}) {
  const defaults = normalizeDefaults(options.defaults)
  const prefix = normalizePrefix(options.hashPrefix)
  const defaultKeys = Object.keys(defaults)
  const restrictKeys = defaultKeys.length > 0

  let body = String(rawHash ?? "")
  if (body.startsWith("#")) body = body.slice(1)

  if (prefix) {
    if (!body.startsWith(prefix)) return {...defaults}
    body = body.slice(prefix.length)
  }

  const result = {...defaults}
  if (!body) return result

  const params = new URLSearchParams(body)
  for (const [key, value] of params.entries()) {
    if (restrictKeys && !Object.prototype.hasOwnProperty.call(defaults, key)) continue
    result[key] = value
  }

  return result
}

export function formatNavigationHash(state, options = {}) {
  const defaults = normalizeDefaults(options.defaults)
  const prefix = normalizePrefix(options.hashPrefix)
  const params = new URLSearchParams()

  const source = state && typeof state === "object" ? state : {}
  const keys = Object.keys(defaults).length > 0
    ? Object.keys(defaults)
    : Object.keys(source)

  for (const key of keys) {
    const value = source[key] == null ? "" : String(source[key])
    const defaultValue = Object.prototype.hasOwnProperty.call(defaults, key)
      ? defaults[key]
      : ""
    if (value !== defaultValue) {
      params.set(key, value)
    }
  }

  const encoded = params.toString()
  if (!encoded) return ""
  return `#${prefix}${encoded}`
}

function normalizeDefaults(rawDefaults) {
  if (!rawDefaults || typeof rawDefaults !== "object") return {}
  const out = {}
  for (const [key, value] of Object.entries(rawDefaults)) {
    out[key] = value == null ? "" : String(value)
  }
  return out
}

function normalizePrefix(prefix) {
  const str = String(prefix ?? "")
  return str.startsWith("#") ? str.slice(1) : str
}

function readLocationHash(win) {
  try {
    return typeof win?.location?.hash === "string" ? win.location.hash : ""
  } catch {
    return ""
  }
}

function buildTargetUrl(win, hash) {
  if (hash) return hash
  const loc = win?.location
  const pathname = typeof loc?.pathname === "string" ? loc.pathname : ""
  const search = typeof loc?.search === "string" ? loc.search : ""
  if (pathname || search) return `${pathname}${search}`
  return "#"
}

function normalizeState(candidate, defaults, validValues, validate) {
  const raw = candidate && typeof candidate === "object" ? candidate : {}
  const defaultKeys = Object.keys(defaults)
  const keys = defaultKeys.length > 0 ? defaultKeys : Object.keys(raw)

  let next = {}
  for (const key of keys) {
    const fallback = Object.prototype.hasOwnProperty.call(defaults, key) ? defaults[key] : ""
    const rawValue = Object.prototype.hasOwnProperty.call(raw, key) && raw[key] != null
      ? String(raw[key])
      : fallback
    next[key] = isValueValid(key, rawValue, validValues) ? rawValue : fallback
  }

  if (typeof validate === "function") {
    const validated = validate({...next}, {...defaults})
    if (validated && typeof validated === "object") {
      const validatedKeys = defaultKeys.length > 0 ? defaultKeys : Object.keys(validated)
      const cleaned = {}
      for (const key of validatedKeys) {
        const fallback = Object.prototype.hasOwnProperty.call(defaults, key) ? defaults[key] : ""
        const val = Object.prototype.hasOwnProperty.call(validated, key) && validated[key] != null
          ? String(validated[key])
          : fallback
        cleaned[key] = isValueValid(key, val, validValues) ? val : fallback
      }
      next = cleaned
    }
  }

  return Object.freeze(next)
}

function isValueValid(key, value, validValues) {
  if (!validValues || !Object.prototype.hasOwnProperty.call(validValues, key)) return true
  const rule = validValues[key]
  if (rule == null) return true
  if (typeof rule === "function") return Boolean(rule(value))
  if (rule instanceof Set) return rule.has(value)
  if (Array.isArray(rule)) return rule.includes(value)
  if (typeof rule[Symbol.iterator] === "function") {
    for (const item of rule) {
      if (item === value) return true
    }
    return false
  }
  return true
}

function statesEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}
