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

const WORLD_TILE_PX = 512
const MAX_MERCATOR_LAT = 85.051129
const DEFAULT_LOD_RADIUS_PX = 40
const lodResultKeys = new WeakMap()

export function isLodCluster(row) {
  return Boolean(row) && row.__lod === "far"
}

// Screen-space level of detail for a point layer. Far band: one cluster record
// per world-pixel cell at exitZoom, so identity does not move with the camera.
// Near band: the input rows, untouched. Pass the previous result back as
// `options.previous` to get hysteresis and a stable far-band `data` reference.
export function screenLod(rows, options = {}) {
  const input = Array.isArray(rows) ? rows : []
  const config = normalizeLodOptions(options)
  const previous = options.previous && lodResultKeys.has(options.previous) ? options.previous : null
  const band = nextLodBand(previous?.band, viewZoom(options.view), config)
  const positionOf = (row) => lodPositionOf(row, config.getPosition)

  let data = input
  let hidden = 0
  let unplaced = 0

  if (band === "far") {
    const reusable = previous?.band === "far" && sameLodKey(lodResultKeys.get(previous), input, config)
    const clustered = reusable
      ? {data: previous.data, hidden: previous.hidden, unplaced: previous.unplaced}
      : clusterByWorldCell(input, config)
    data = clustered.data
    hidden = clustered.hidden
    unplaced = clustered.unplaced
  }

  const result = {
    band,
    data,
    hidden,
    unplaced,
    enterZoom: config.enterZoom,
    exitZoom: config.exitZoom,
    isCluster: isLodCluster,
    positionOf,
  }
  lodResultKeys.set(result, {rows: input, exitZoom: config.exitZoom, radiusPx: config.radiusPx})
  return result
}

export function useScreenLod(rows, options = {}) {
  if (typeof options.getPosition !== "function") {
    throw new Error("useScreenLod: getPosition(row) => [lng, lat] is required")
  }

  const previousRef = useRef(null)
  const callbacksRef = useRef(options)
  callbacksRef.current = options

  const zoom = viewZoom(options.viewState ?? options.view)
  const {enterZoom, exitZoom} = options
  const radiusPx = options.radiusPx ?? DEFAULT_LOD_RADIUS_PX

  // getPosition, getId and aggregate are read through a ref: authors routinely
  // pass inline functions, and reclustering on their identity would hand
  // useDeckLayers a new `data` array on every render. positionOf is stable for
  // the same reason, so it can sit in a memoized accessors object.
  const callbacks = useMemo(() => {
    const getPosition = (row) => callbacksRef.current.getPosition(row)
    return {
      getPosition,
      getId: (row) => (callbacksRef.current.getId || defaultLodId)(row),
      aggregate: (members) => callbacksRef.current.aggregate?.(members),
      positionOf: (row) => lodPositionOf(row, getPosition),
    }
  }, [])

  const result = useMemo(() => {
    const next = screenLod(rows, {
      view: {zoom},
      enterZoom,
      exitZoom,
      radiusPx,
      getPosition: callbacks.getPosition,
      getId: callbacks.getId,
      aggregate: callbacks.aggregate,
      previous: previousRef.current,
    })
    previousRef.current = next
    return next
  }, [rows, zoom, enterZoom, exitZoom, radiusPx, callbacks])

  return useMemo(() => ({
    band: result.band,
    data: result.data,
    hidden: result.hidden,
    unplaced: result.unplaced,
    enterZoom: result.enterZoom,
    exitZoom: result.exitZoom,
    isCluster: isLodCluster,
    positionOf: callbacks.positionOf,
  }), [result.band, result.data, result.hidden, result.unplaced, result.enterZoom, result.exitZoom, callbacks])
}

function normalizeLodOptions(options) {
  const enterZoom = Number(options.enterZoom)
  const exitZoom = Number(options.exitZoom)
  if (!Number.isFinite(enterZoom) || !Number.isFinite(exitZoom)) {
    throw new Error("screenLod: enterZoom and exitZoom must be finite numbers")
  }
  if (!(exitZoom < enterZoom)) {
    throw new Error(`screenLod: exitZoom (${exitZoom}) must be less than enterZoom (${enterZoom})`)
  }
  if (typeof options.getPosition !== "function") {
    throw new Error("screenLod: getPosition(row) => [lng, lat] is required")
  }

  const radiusPx = options.radiusPx == null ? DEFAULT_LOD_RADIUS_PX : Number(options.radiusPx)
  if (!Number.isFinite(radiusPx) || radiusPx <= 0) {
    throw new Error("screenLod: radiusPx must be a positive number")
  }

  return {
    enterZoom,
    exitZoom,
    radiusPx,
    getPosition: options.getPosition,
    getId: typeof options.getId === "function" ? options.getId : defaultLodId,
    aggregate: typeof options.aggregate === "function" ? options.aggregate : null,
  }
}

function defaultLodId(row) {
  return row?.id
}

function viewZoom(view) {
  const zoom = Number(view?.zoom)
  return Number.isFinite(zoom) ? zoom : null
}

function nextLodBand(previousBand, zoom, {enterZoom, exitZoom}) {
  if (zoom == null) return previousBand || "near"
  if (previousBand === "near") return zoom <= exitZoom ? "far" : "near"
  if (previousBand === "far") return zoom >= enterZoom ? "near" : "far"
  return zoom >= enterZoom ? "near" : "far"
}

function sameLodKey(key, rows, config) {
  return Boolean(key)
    && key.rows === rows
    && key.exitZoom === config.exitZoom
    && key.radiusPx === config.radiusPx
}

function clusterByWorldCell(rows, {exitZoom, radiusPx, getPosition, getId, aggregate}) {
  const worldPx = WORLD_TILE_PX * 2 ** exitZoom
  const cells = new Map()
  let unplaced = 0

  for (const row of rows) {
    const lngLat = readLngLat(getPosition(row))
    if (!lngLat) {
      unplaced += 1
      continue
    }

    const [x, y] = worldPixel(lngLat, worldPx)
    const key = `${Math.floor(x / radiusPx)}:${Math.floor(y / radiusPx)}`
    let cell = cells.get(key)
    if (!cell) {
      cell = {key, members: [], lngSum: 0, latSum: 0}
      cells.set(key, cell)
    }
    cell.members.push(row)
    cell.lngSum += lngLat[0]
    cell.latSum += lngLat[1]
  }

  const data = []
  for (const cell of cells.values()) {
    const count = cell.members.length
    const extra = aggregate ? aggregate(cell.members) : null
    data.push({
      ...(extra && typeof extra === "object" ? extra : {}),
      __lod: "far",
      __lod_id: `lod:${exitZoom}:${radiusPx}:${cell.key}`,
      __lod_count: count,
      __lod_ids: cell.members.map((member) => getId(member)),
      __lod_position: [cell.lngSum / count, cell.latSum / count],
    })
  }

  return {data, hidden: rows.length - unplaced, unplaced}
}

function lodPositionOf(row, getPosition) {
  if (isLodCluster(row)) return row.__lod_position
  return getPosition(row)
}

function readLngLat(position) {
  if (!position) return null
  const lng = readCoordinate(position[0])
  const lat = readCoordinate(position[1])
  if (lng === null || lat === null) return null
  return [lng, lat]
}

function readCoordinate(value) {
  if (typeof value === "string" && value.trim() === "") return null
  if (typeof value !== "number" && typeof value !== "string") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function worldPixel([lng, lat], worldPx) {
  const clampedLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat))
  const sinLat = Math.sin((clampedLat * Math.PI) / 180)
  const x = ((lng + 180) / 360) * worldPx
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldPx
  return [x, y]
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
