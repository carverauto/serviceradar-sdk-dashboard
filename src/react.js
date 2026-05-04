import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react"
import {createRoot} from "react-dom/client"
import {createSrqlClient} from "./srql.js"
import {createDashboardQueryState} from "./query-state.js"
import {frameDigest, frameRows, isArrowFrame} from "./frames.js"
import {decodeArrowFrame} from "./arrow.js"
import {createIndexedRows} from "./filtering.js"

const DashboardContext = createContext(null)

export function DashboardProvider({host, api, lifecycle, children}) {
  const value = useMemo(() => ({host, api, lifecycle}), [host, api, lifecycle])
  return React.createElement(DashboardContext.Provider, {value}, children)
}

export function useDashboardHost() {
  return useDashboardContext().host
}

export function useDashboardApi() {
  return useDashboardContext().api
}

export function useDashboardReady() {
  const {lifecycle} = useDashboardContext()

  return useCallback((mounted) => {
    lifecycle?.ready?.(mounted)
  }, [lifecycle])
}

export function useDashboardFrames() {
  const {api} = useDashboardContext()
  const cacheRef = useRef({frames: [], digests: []})

  const reconcile = useCallback((candidate) => {
    const next = Array.isArray(candidate) ? candidate : []
    const digests = next.map(frameDigest)
    const cached = cacheRef.current

    if (cached.frames.length === next.length) {
      let identical = true
      for (let index = 0; index < next.length; index += 1) {
        if (cached.digests[index] !== digests[index]) {
          identical = false
          break
        }
      }
      if (identical) return cached.frames
    }

    const merged = next.map((frame, index) => {
      const previousIndex = cached.digests.indexOf(digests[index])
      return previousIndex >= 0 ? cached.frames[previousIndex] : frame
    })

    cacheRef.current = {frames: merged, digests}
    return merged
  }, [])

  const [frames, setFrames] = useState(() => reconcile(safeFrames(api)))

  useEffect(() => {
    setFrames(reconcile(safeFrames(api)))
    return api?.onFrameUpdate?.(({frames: nextFrames}) => {
      const candidate = Array.isArray(nextFrames) ? nextFrames : safeFrames(api)
      const reconciled = reconcile(candidate)
      setFrames((previous) => (previous === reconciled ? previous : reconciled))
    })
  }, [api, reconcile])

  return frames
}

export function useDashboardFrame(frameId) {
  const frames = useDashboardFrames()
  const target = String(frameId)
  return useMemo(() => frames.find((frame) => String(frame?.id) === target), [frames, target])
}

export function useFrameRows(frameId, options) {
  const frame = useDashboardFrame(frameId)
  return useDecodedFrameRows(frame, options)
}

export function useFrameRowsFromFrame(frame, options) {
  return useDecodedFrameRows(frame, options)
}

export function useIndexedRows(rows, options) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  return useMemo(() => createIndexedRows(rows, optionsRef.current), [rows])
}

export function useFilterState(options = {}) {
  const initialState = useMemo(() => options.initialState ? {...options.initialState} : {}, [options.initialState])
  const debounceMs = Math.max(0, Number(options.debounceMs) || 0)
  const debounceFields = Array.isArray(options.debounceFields) ? options.debounceFields : null

  const [state, setStateInternal] = useState(initialState)
  const [debouncedState, setDebouncedState] = useState(initialState)
  const timerRef = useRef(null)

  useEffect(() => {
    if (debounceMs === 0) {
      setDebouncedState(state)
      return undefined
    }

    if (debounceFields && !someFieldsDiffer(state, debouncedState, debounceFields)) {
      setDebouncedState(state)
      return undefined
    }

    if (timerRef.current != null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setDebouncedState(state)
      timerRef.current = null
    }, debounceMs)

    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [state, debounceMs, debouncedState, debounceFields])

  const setFilter = useCallback((keyOrPatch, value) => {
    if (keyOrPatch && typeof keyOrPatch === "object" && !Array.isArray(keyOrPatch)) {
      setStateInternal((prev) => ({...prev, ...keyOrPatch}))
      return
    }
    if (typeof keyOrPatch === "function") {
      setStateInternal((prev) => ({...prev, ...keyOrPatch(prev)}))
      return
    }
    setStateInternal((prev) => ({...prev, [keyOrPatch]: value}))
  }, [])

  const toggle = useCallback((key, value) => {
    setStateInternal((prev) => {
      const current = prev[key]
      if (current instanceof Set) {
        const next = new Set(current)
        if (next.has(value)) next.delete(value)
        else next.add(value)
        return {...prev, [key]: next}
      }
      const list = Array.isArray(current) ? current : []
      const idx = list.indexOf(value)
      const next = idx >= 0
        ? [...list.slice(0, idx), ...list.slice(idx + 1)]
        : [...list, value]
      return {...prev, [key]: next}
    })
  }, [])

  const clear = useCallback(() => {
    setStateInternal(initialState)
  }, [initialState])

  const setState = useCallback((nextOrPatch) => {
    if (typeof nextOrPatch === "function") {
      setStateInternal(nextOrPatch)
      return
    }
    setStateInternal((prev) => ({...prev, ...nextOrPatch}))
  }, [])

  return useMemo(() => ({
    state,
    debouncedState,
    setFilter,
    toggle,
    clear,
    setState,
  }), [state, debouncedState, setFilter, toggle, clear, setState])
}

export {useMapPopup} from "./popup.js"

export function useArrowTable(frame) {
  const [state, setState] = useState({frame: null, table: null, error: null})

  useEffect(() => {
    if (!frame || !isArrowFrame(frame)) {
      setState({frame: null, table: null, error: null})
      return undefined
    }

    let cancelled = false
    decodeArrowFrame(frame)
      .then(({table}) => {
        if (cancelled) return
        setState({frame, table, error: null})
      })
      .catch((error) => {
        if (cancelled) return
        setState({frame, table: null, error})
      })

    return () => {
      cancelled = true
    }
  }, [frame])

  return state.frame === frame ? state.table : null
}

export function useDashboardTheme() {
  const {api} = useDashboardContext()
  const [theme, setTheme] = useState(() => currentTheme(api))

  useEffect(() => {
    setTheme(currentTheme(api))
    return api?.onThemeChange?.((nextTheme) => setTheme(nextTheme || currentTheme(api)))
  }, [api])

  return theme
}

export function useDashboardSrql() {
  const {api} = useDashboardContext()
  return useMemo(() => createSrqlClient(api), [api])
}

export function useDashboardQueryState(options = {}) {
  const srql = useDashboardSrql()
  const optionsRef = useRef(options)
  optionsRef.current = options

  const controllerRef = useRef(null)
  if (controllerRef.current === null) {
    controllerRef.current = createDashboardQueryState({
      ...options,
      srqlClient: options.srqlClient ?? srql,
    })
  }

  const [snapshot, setSnapshot] = useState(() => controllerRef.current.getSnapshot())

  useEffect(() => {
    const controller = controllerRef.current
    setSnapshot(controller.getSnapshot())
    const unsubscribe = controller.subscribe((next) => setSnapshot(next))
    return () => {
      unsubscribe()
      controller.destroy()
      controllerRef.current = null
    }
  }, [])

  const apply = useCallback((patch, opts) => controllerRef.current?.apply(patch, opts), [])
  const reset = useCallback((opts) => controllerRef.current?.reset(opts), [])
  const flush = useCallback(() => controllerRef.current?.flush(), [])
  const hydrate = useCallback((input) => controllerRef.current?.hydrate(input), [])

  return useMemo(() => ({
    state: snapshot.state,
    query: snapshot.query,
    frameQueries: snapshot.frameQueries,
    dirty: snapshot.dirty,
    apply,
    reset,
    flush,
    hydrate,
  }), [snapshot, apply, reset, flush, hydrate])
}

export function useDashboardSettings() {
  const {host} = useDashboardContext()
  return host?.settings || host?.instance?.settings || {}
}

export function useDashboardMapbox() {
  const {host, api} = useDashboardContext()
  return useMemo(() => {
    if (typeof api?.mapbox === "function") return api.mapbox() || {}
    return host?.mapbox || {}
  }, [host, api])
}

export function useDashboardLibraries() {
  return useDashboardContext().api?.libraries || {}
}

export function useDashboardCapability(capability) {
  const {api} = useDashboardContext()
  return typeof api?.capabilityAllowed === "function" ? api.capabilityAllowed(capability) : false
}

export function useDashboardNavigation() {
  const {api} = useDashboardContext()

  return useMemo(() => ({
    open(target) {
      if (typeof api?.navigate === "function") {
        api.navigate(target)
      } else if (typeof target === "string" && target.trim()) {
        window.location.assign(target)
      }
    },
    toDevice(deviceUid) {
      const uid = String(deviceUid || "").trim()
      if (!uid) return

      if (typeof api?.navigate === "function") {
        api.navigate({type: "device", uid})
      } else {
        window.location.assign(`/devices/${encodeURIComponent(uid)}`)
      }
    },
    toDashboard(routeSlug) {
      const slug = String(routeSlug || "").trim()
      if (!slug) return

      if (typeof api?.navigate === "function") {
        api.navigate({type: "dashboard", route_slug: slug})
      } else {
        window.location.assign(`/dashboards/${encodeURIComponent(slug)}`)
      }
    },
  }), [api])
}

export function useDashboardPreferences() {
  const {api} = useDashboardContext()
  const settings = useDashboardSettings()

  return useMemo(() => ({
    all() {
      if (typeof api?.preferences?.all === "function") return api.preferences.all()
      return settings.preferences && typeof settings.preferences === "object" ? {...settings.preferences} : {}
    },
    get(key, fallback = undefined) {
      if (typeof api?.preferences?.get === "function") return api.preferences.get(key, fallback)
      const preferences = settings.preferences && typeof settings.preferences === "object" ? settings.preferences : {}
      const normalized = String(key || "")
      return Object.prototype.hasOwnProperty.call(preferences, normalized) ? preferences[normalized] : fallback
    },
    set(key, value) {
      if (typeof api?.preferences?.set === "function") return api.preferences.set(key, value)
      throw new Error("dashboard preferences write API is unavailable")
    },
  }), [api, settings])
}

export function useDashboardSavedQueries() {
  const {api} = useDashboardContext()
  const settings = useDashboardSettings()

  return useMemo(() => ({
    list() {
      if (typeof api?.savedQueries?.list === "function") return api.savedQueries.list()
      const savedQueries = settings.saved_queries || settings.savedQueries
      return Array.isArray(savedQueries) ? savedQueries.map((query) => ({...query})) : []
    },
    current(frameId) {
      if (typeof api?.savedQueries?.current === "function") return api.savedQueries.current(frameId)
      return createSrqlClient(api).query(frameId)
    },
    apply(query, frameQueries = {}) {
      if (typeof api?.savedQueries?.apply === "function") return api.savedQueries.apply(query, frameQueries)
      return createSrqlClient(api).update(query, frameQueries)
    },
  }), [api, settings])
}

export function useDashboardPopup() {
  const {api} = useDashboardContext()

  return useMemo(() => ({
    open(content, options = {}) {
      if (typeof api?.popup?.open === "function") return api.popup.open(content, options)
      throw new Error("dashboard popup API is unavailable")
    },
    close() {
      return api?.popup?.close?.()
    },
  }), [api])
}

export function useDashboardDetails() {
  const {api} = useDashboardContext()

  return useMemo(() => ({
    open(target) {
      if (typeof api?.details?.open === "function") return api.details.open(target)
      throw new Error("dashboard details API is unavailable")
    },
  }), [api])
}

export function useDashboardController(createController, options = {}) {
  const {host, api, lifecycle} = useDashboardContext()
  const rootRef = useRef(null)
  const mountedRef = useRef(null)
  const [error, setError] = useState(null)
  const clearRoot = options.clearRoot !== false
  const onError = options.onError
  const dependencies = Array.isArray(options.dependencies) ? options.dependencies : []

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    let cancelled = false
    setError(null)
    if (clearRoot) root.innerHTML = ""

    Promise.resolve(createController(root, host, api))
      .then((mounted) => {
        if (cancelled) {
          destroyMounted(mounted)
          return
        }

        mountedRef.current = mounted || null
        lifecycle?.ready?.(mountedRef.current)
      })
      .catch((nextError) => {
        if (cancelled) return

        setError(nextError)
        mountedRef.current = {destroy() {}}
        lifecycle?.ready?.(mountedRef.current)
        lifecycle?.error?.(nextError)
        onError?.(nextError)
      })

    return () => {
      cancelled = true
      destroyMounted(mountedRef.current)
      mountedRef.current = null
    }
  }, [host, api, lifecycle, createController, clearRoot, onError, ...dependencies])

  return useMemo(() => ({ref: rootRef, error}), [error])
}

export function mountReactDashboard(Component, options = {}) {
  return async function mountDashboard(root, host, api) {
    const reactRoot = createRoot(root)
    let mountedDashboard = null
    let readyResolved = false
    let resolveReady
    const ready = new Promise((resolve) => {
      resolveReady = resolve
    })
    const lifecycle = {
      ready(mounted) {
        if (readyResolved) {
          if (mounted && mounted !== mountedDashboard) destroyMounted(mounted)
          return
        }

        readyResolved = true
        mountedDashboard = mounted || null
        resolveReady()
      },
    }

    reactRoot.render(
      React.createElement(
        DashboardProvider,
        {host, api, lifecycle},
        React.createElement(Component, {host, api}),
      ),
    )

    if (options.waitForReady) await ready

    return {
      destroy() {
        destroyMounted(mountedDashboard)
        mountedDashboard = null
        reactRoot.unmount()
      },
    }
  }
}

function useDashboardContext() {
  const context = useContext(DashboardContext)
  if (!context) throw new Error("ServiceRadar dashboard hooks must be used inside DashboardProvider")
  return context
}

function safeFrames(api) {
  return Array.isArray(api?.frames?.()) ? [...api.frames()] : []
}

function currentTheme(api) {
  return api?.theme?.() || (api?.isDarkMode?.() ? "dark" : "light")
}

function someFieldsDiffer(a, b, fields) {
  for (const field of fields) {
    if (a?.[field] !== b?.[field]) return true
  }
  return false
}

function destroyMounted(mounted) {
  if (!mounted) return
  if (typeof mounted === "function") {
    mounted()
  } else if (typeof mounted.destroy === "function") {
    mounted.destroy()
  }
}

const projectionCache = new WeakMap()
const decodedRowsCache = new WeakMap()

function useDecodedFrameRows(frame, options) {
  const decode = options?.decode || "auto"
  const shape = options?.shape || null
  const fallback = options?.fallback || []

  const initialRows = useMemo(() => {
    if (!frame) return fallback
    if (decode === "arrow") return decodedRowsCache.get(frame) || fallback
    if (decode === "json" || !isArrowFrame(frame)) return projectRows(frame, frameRows(frame), shape)
    return decodedRowsCache.get(frame) || fallback
  }, [frame, decode, shape, fallback])

  const [rows, setRows] = useState(initialRows)

  useEffect(() => {
    if (!frame) {
      setRows(fallback)
      return undefined
    }

    if (decode === "json" || (decode === "auto" && !isArrowFrame(frame))) {
      setRows(projectRows(frame, frameRows(frame), shape))
      return undefined
    }

    if (!isArrowFrame(frame)) {
      setRows(projectRows(frame, frameRows(frame), shape))
      return undefined
    }

    const cachedDecoded = decodedRowsCache.get(frame)
    if (Array.isArray(cachedDecoded)) {
      setRows(projectRows(frame, cachedDecoded, shape))
      return undefined
    }

    let cancelled = false
    decodeArrowFrame(frame)
      .then(({rows: decoded}) => {
        if (cancelled) return
        decodedRowsCache.set(frame, decoded)
        setRows(projectRows(frame, decoded, shape))
      })
      .catch(() => {
        if (cancelled) return
        setRows(fallback)
      })

    return () => {
      cancelled = true
    }
  }, [frame, decode, shape, fallback])

  return rows
}

function projectRows(frame, rows, shape) {
  if (!shape) return rows || []

  let perFrame = projectionCache.get(frame)
  if (!perFrame) {
    perFrame = new Map()
    projectionCache.set(frame, perFrame)
  }

  const cached = perFrame.get(shape)
  if (cached) return cached

  const projected = rows.map((row) => projectRow(row, shape))
  perFrame.set(shape, projected)
  return projected
}

function projectRow(row, shape) {
  if (!row || typeof row !== "object") return {}

  const out = {}
  for (const key of Object.keys(shape)) {
    const selector = shape[key]
    if (typeof selector === "function") {
      out[key] = selector(row)
    } else if (typeof selector === "string") {
      out[key] = row[selector]
    } else {
      out[key] = row[key]
    }
  }

  return out
}
