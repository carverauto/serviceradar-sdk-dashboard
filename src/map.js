import {useCallback, useEffect, useMemo, useRef, useState} from "react"

import {useDashboardLibraries, useDashboardMapbox, useDashboardTheme} from "./react.js"

const FALLBACK_STYLES = Object.freeze({
  dark: Object.freeze({
    version: 8,
    name: "ServiceRadar dark fallback",
    sources: {},
    layers: [
      {id: "background", type: "background", paint: {"background-color": "#0f172a"}},
    ],
  }),
  light: Object.freeze({
    version: 8,
    name: "ServiceRadar light fallback",
    sources: {},
    layers: [
      {id: "background", type: "background", paint: {"background-color": "#f8fafc"}},
    ],
  }),
})
const INERT_MAPBOX_TOKEN = "pk.eyJ1Ijoic2VydmljZXJhZGFyIiwiYSI6ImNsb2NhbCJ9.local"

export function useMapboxMap(options = {}) {
  const libraries = useDashboardLibraries()
  const mapbox = useDashboardMapbox()
  const theme = useDashboardTheme()
  const mapboxgl = libraries.mapboxgl
  const accessToken = normalizeMapboxToken(mapbox.access_token || mapbox.accessToken)
  const hasMapboxToken = looksLikeMapboxPublicToken(accessToken)

  const containerRef = useRef(null)
  const handleRef = useRef({map: null, viewState: null})
  const optionsRef = useRef(options)
  optionsRef.current = options
  const appliedStyleSignatureRef = useRef(null)

  const [ready, setReady] = useState(false)
  const [viewState, setViewState] = useState(() => normalizeViewState(options.initialViewState))

  const validate = useCallback(() => {
    const missing = [
      mapboxgl ? null : "mapboxgl",
    ].filter(Boolean)
    if (missing.length > 0) {
      throw new Error(`useMapboxMap: missing host libraries (${missing.join(", ")}). The host must inject mapboxgl.`)
    }
  }, [mapboxgl])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return undefined

    validate()

    const initialViewState = normalizeViewState(optionsRef.current.initialViewState)
    const initialStyle = pickStyle(optionsRef.current.style, mapbox, theme, {hasAccessToken: hasMapboxToken})
    const styleNeedsMapboxToken = styleRequiresMapboxToken(initialStyle)

    applyMapboxToken(mapboxgl, {accessToken, hasMapboxToken, styleNeedsMapboxToken})

    appliedStyleSignatureRef.current = styleSignature(initialStyle)

    const map = new mapboxgl.Map({
      container: node,
      style: initialStyle,
      center: initialViewState.center,
      zoom: initialViewState.zoom,
      bearing: initialViewState.bearing,
      pitch: initialViewState.pitch,
      ...optionsRef.current.mapOptions,
    })

    handleRef.current = {map, viewState: initialViewState}

    const handleLoad = () => setReady(true)
    map.on("load", handleLoad)

    const throttleMs = Math.max(0, Number(optionsRef.current.viewportThrottleMs) || 0)
    const dispatchView = () => {
      if (!handleRef.current.map) return
      const center = handleRef.current.map.getCenter()
      const next = {
        center: [center.lng, center.lat],
        zoom: handleRef.current.map.getZoom(),
        bearing: handleRef.current.map.getBearing(),
        pitch: handleRef.current.map.getPitch(),
      }
      handleRef.current.viewState = next
      setViewState(next)
      optionsRef.current.onViewStateChange?.(next)
    }

    const viewHandler = throttleMs > 0 ? throttle(dispatchView, throttleMs) : dispatchView
    map.on("moveend", viewHandler)
    map.on("zoomend", viewHandler)

    return () => {
      try {
        map.off("load", handleLoad)
        map.off("moveend", viewHandler)
        map.off("zoomend", viewHandler)
        viewHandler.cancel?.()
        map.remove()
      } catch (error) {
        // best-effort teardown
      }

      handleRef.current = {map: null, viewState: null}
      appliedStyleSignatureRef.current = null
      setReady(false)
    }
  }, [mapboxgl, validate])

  useEffect(() => {
    const handle = handleRef.current
    if (!handle.map || !ready) return undefined

    const desiredStyle = pickStyle(options.style, mapbox, theme, {hasAccessToken: hasMapboxToken})
    const styleNeedsMapboxToken = styleRequiresMapboxToken(desiredStyle)
    applyMapboxToken(mapboxgl, {accessToken, hasMapboxToken, styleNeedsMapboxToken})

    const desiredSignature = styleSignature(desiredStyle)
    if (appliedStyleSignatureRef.current === desiredSignature) return undefined

    handle.map.setStyle(desiredStyle, {diff: true})
    appliedStyleSignatureRef.current = desiredSignature
    return undefined
  }, [options.style, mapbox, theme, ready, hasMapboxToken, accessToken, mapboxgl])

  return useMemo(() => ({
    containerRef,
    ready,
    viewState,
    get map() {
      return handleRef.current.map
    },
    flyTo(target) {
      const handle = handleRef.current
      if (!handle.map || !target) return
      const next = normalizeViewState(target, handle.viewState || target)
      handle.map.flyTo({
        center: next.center,
        zoom: next.zoom,
        bearing: next.bearing,
        pitch: next.pitch,
        ...target.options,
      })
    },
  }), [ready, viewState])
}

export function useDeckMap(options = {}) {
  const libraries = useDashboardLibraries()
  const MapboxOverlay = libraries.MapboxOverlay
  const mapHandle = useMapboxMap(options)
  const map = mapHandle.map
  const interleaved = options.interleaved === true
  const overlayRef = useRef(null)
  const [overlayVersion, setOverlayVersion] = useState(0)

  useEffect(() => {
    if (!map) return undefined

    if (!MapboxOverlay) {
      throw new Error("useDeckMap: missing host libraries (MapboxOverlay). The host must inject @deck.gl/mapbox.")
    }

    const overlay = new MapboxOverlay({
      interleaved,
      layers: [],
    })
    map.addControl(overlay)
    overlayRef.current = overlay
    setOverlayVersion((version) => version + 1)

    return () => {
      try {
        map.removeControl?.(overlay)
      } catch (error) {
        // best-effort teardown
      }
      overlayRef.current = null
      setOverlayVersion((version) => version + 1)
    }
  }, [map, MapboxOverlay, interleaved])

  return useMemo(() => ({
    containerRef: mapHandle.containerRef,
    ready: mapHandle.ready && Boolean(overlayRef.current),
    viewState: mapHandle.viewState,
    get map() {
      return mapHandle.map
    },
    get overlay() {
      return overlayRef.current
    },
    flyTo: mapHandle.flyTo,
  }), [mapHandle, overlayVersion])
}

export function useDeckLayers(handle, spec) {
  const libraries = useDashboardLibraries()
  const cacheRef = useRef(new Map())
  const eventRefs = useRef(new Map())

  const layers = useMemo(() => {
    if (!spec) return []
    const entries = normalizeSpec(spec)
    const next = new Map()

    for (const entry of entries) {
      const id = entry.id
      const constructor = libraries[entry.kind]
      if (!constructor) {
        throw new Error(`useDeckLayers: missing host library ${entry.kind} for layer "${id}"`)
      }

      const cached = cacheRef.current.get(id)
      const reusable = cached
        && cached.kind === entry.kind
        && cached.data === entry.data
        && cached.accessors === entry.accessors
        && cached.visualProps === entry.visualProps
        && cached.constructorRef === constructor

      if (reusable) {
        next.set(id, cached)
        continue
      }

      const eventBag = stableEventBag(eventRefs, id, entry.events)

      const layer = new constructor({
        id,
        data: entry.data,
        ...flattenProps(entry.accessors),
        ...flattenProps(entry.visualProps),
        ...flattenProps(eventBag),
      })

      next.set(id, {
        kind: entry.kind,
        data: entry.data,
        accessors: entry.accessors,
        visualProps: entry.visualProps,
        constructorRef: constructor,
        layer,
      })
    }

    cacheRef.current = next
    return Array.from(next.values()).map((entry) => entry.layer)
  }, [spec, libraries])

  useEffect(() => {
    const overlay = handle?.overlay
    if (!overlay) return undefined
    overlay.setProps({layers})
    return undefined
  }, [handle, layers])

  useEffect(() => () => {
    cacheRef.current.clear()
    eventRefs.current.clear()
  }, [])

  return layers
}

export function scatter(id, layerSpec) {
  return {id, kind: "ScatterplotLayer", ...layerSpec}
}

export function text(id, layerSpec) {
  return {id, kind: "TextLayer", ...layerSpec}
}

export function icon(id, layerSpec) {
  return {id, kind: "IconLayer", ...layerSpec}
}

export function line(id, layerSpec) {
  return {id, kind: "LineLayer", ...layerSpec}
}

function normalizeSpec(spec) {
  if (Array.isArray(spec)) {
    return spec.filter((entry) => entry && entry.id && entry.kind)
  }

  if (spec && typeof spec === "object") {
    return Object.entries(spec)
      .filter(([id, value]) => id && value && value.kind)
      .map(([id, value]) => ({id, ...value}))
  }

  return []
}

function flattenProps(input) {
  if (!input || typeof input !== "object") return {}
  return input
}

function normalizeViewState(input, fallback) {
  const base = fallback || {center: [-95, 40], zoom: 3, bearing: 0, pitch: 0}
  if (!input) return {...base}

  const center = Array.isArray(input.center) && input.center.length === 2
    ? [Number(input.center[0]), Number(input.center[1])]
    : base.center

  return {
    center,
    zoom: Number.isFinite(input.zoom) ? input.zoom : base.zoom,
    bearing: Number.isFinite(input.bearing) ? input.bearing : base.bearing,
    pitch: Number.isFinite(input.pitch) ? input.pitch : base.pitch,
  }
}

function pickStyle(explicit, mapbox, theme, options = {}) {
  if (isStyleObject(explicit)) return cloneStyle(explicit)
  if (typeof explicit === "string" && explicit.trim()) return styleOrFallback(explicit, theme, options)
  if (isStyleObject(mapbox?.style)) return cloneStyle(mapbox.style)
  if (mapbox?.style && typeof mapbox.style === "string") return styleOrFallback(mapbox.style, theme, options)
  if (mapbox?.styles && typeof mapbox.styles === "object") {
    const themed = mapbox.styles[theme] || mapbox.styles.default
    if (isStyleObject(themed)) return cloneStyle(themed)
    if (typeof themed === "string" && themed.trim()) return styleOrFallback(themed, theme, options)
  }
  const themed = theme === "dark"
    ? mapbox?.style_dark || mapbox?.styleDark
    : mapbox?.style_light || mapbox?.styleLight
  if (isStyleObject(themed)) return cloneStyle(themed)
  if (typeof themed === "string" && themed.trim()) return styleOrFallback(themed, theme, options)

  return styleOrFallback(theme === "dark"
    ? "mapbox://styles/mapbox/dark-v11"
    : "mapbox://styles/mapbox/light-v11", theme, options)
}

function styleOrFallback(style, theme, options) {
  if (!options.hasAccessToken && /^mapbox:\/\//.test(String(style || ""))) {
    return cloneStyle(theme === "dark" ? FALLBACK_STYLES.dark : FALLBACK_STYLES.light)
  }
  return style
}

function normalizeMapboxToken(token) {
  return String(token || "").trim()
}

function looksLikeMapboxPublicToken(token) {
  return /^pk\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(normalizeMapboxToken(token))
}

function applyMapboxToken(mapboxgl, {accessToken, hasMapboxToken, styleNeedsMapboxToken}) {
  const nextToken = hasMapboxToken ? accessToken : INERT_MAPBOX_TOKEN
  if (mapboxgl.accessToken !== nextToken) {
    mapboxgl.accessToken = nextToken
  }
}

function styleRequiresMapboxToken(style) {
  if (typeof style === "string") return /^mapbox:\/\//.test(style)
  if (!isStyleObject(style)) return false
  return /(?:mapbox:\/\/|api\.mapbox\.com|tiles\.mapbox\.com)/.test(JSON.stringify(style))
}

function styleSignature(style) {
  if (typeof style === "string") return `url:${style}`
  if (isStyleObject(style)) return `json:${JSON.stringify(style)}`
  return String(style || "")
}

function isStyleObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
}

function cloneStyle(style) {
  return JSON.parse(JSON.stringify(style))
}

function throttle(fn, ms) {
  let timer = null
  let pendingArgs = null
  let lastArgs = null

  function throttled(...args) {
    lastArgs = args
    if (timer != null) {
      pendingArgs = args
      return
    }
    fn.apply(null, args)
    timer = setTimeout(() => {
      timer = null
      if (pendingArgs) {
        const next = pendingArgs
        pendingArgs = null
        fn.apply(null, next)
      }
    }, ms)
  }

  throttled.cancel = () => {
    if (timer != null) clearTimeout(timer)
    timer = null
    pendingArgs = null
    lastArgs = null
  }

  return throttled
}

function stableEventBag(refStore, id, events) {
  if (!events || typeof events !== "object") return {}

  let entry = refStore.current.get(id)
  if (!entry) {
    entry = {handlers: {}, wrappers: {}}
    refStore.current.set(id, entry)
  }

  const out = {}
  for (const key of Object.keys(events)) {
    entry.handlers[key] = events[key]
    if (!entry.wrappers[key]) {
      entry.wrappers[key] = (...args) => entry.handlers[key]?.(...args)
    }
    out[key] = entry.wrappers[key]
  }

  return out
}
