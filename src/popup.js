import React, {useCallback, useEffect, useMemo, useRef} from "react"
import {createRoot as defaultCreateRoot} from "react-dom/client"

import {DashboardProvider, useDashboardApi, useDashboardHost, useDashboardLibraries} from "./react.js"

export function createReactMapPopupController({map, mapboxgl, createRoot, options = {}}) {
  let popup = null
  let root = null
  let onCloseListener = null

  const settings = {
    closeOnClick: options.closeOnClick !== false,
    closeButton: options.closeButton !== false,
    offset: options.offset,
    className: options.className,
    anchor: options.anchor,
    maxWidth: options.maxWidth,
    wrapContent: options.wrapContent,
  }

  function disposeRoot() {
    if (!root) return
    try { root.unmount() } catch (_) { /* swallow unmount races */ }
    root = null
  }

  function disposePopup() {
    if (!popup) return
    if (onCloseListener) {
      try { popup.off?.("close", onCloseListener) } catch (_) { /* noop */ }
      onCloseListener = null
    }
    try { popup.remove() } catch (_) { /* swallow remove races */ }
    popup = null
  }

  function close() {
    disposeRoot()
    disposePopup()
  }

  function open(request) {
    if (!map || !mapboxgl?.Popup) return
    const coordinates = Array.isArray(request?.coordinates) ? request.coordinates : null
    const content = request?.content

    if (!popup) {
      popup = new mapboxgl.Popup({
        closeOnClick: settings.closeOnClick,
        closeButton: settings.closeButton,
        offset: settings.offset,
        className: settings.className,
        anchor: settings.anchor,
        maxWidth: settings.maxWidth,
      })

      onCloseListener = () => {
        disposeRoot()
        if (popup) {
          try { popup.off?.("close", onCloseListener) } catch (_) { /* noop */ }
          onCloseListener = null
          popup = null
        }
        options.onClose?.()
      }
      popup.on?.("close", onCloseListener)

      const node = createDomNode()
      if (typeof popup.setDOMContent === "function") {
        popup.setDOMContent(node)
      }
      if (coordinates && typeof popup.setLngLat === "function") {
        popup.setLngLat(coordinates)
      }
      if (typeof popup.addTo === "function") {
        popup.addTo(map)
      }
      root = createRoot(node)
    } else if (coordinates && typeof popup.setLngLat === "function") {
      const current = typeof popup.getLngLat === "function" ? popup.getLngLat() : null
      if (!current || current.lng !== coordinates[0] || current.lat !== coordinates[1]) {
        popup.setLngLat(coordinates)
      }
    }

    if (root) root.render(wrapContent(content, settings))
  }

  function isOpen() {
    return popup !== null
  }

  return {open, close, isOpen, get popup() { return popup }}
}

export function useMapPopup(map, options = {}) {
  const libraries = useDashboardLibraries()
  const host = useDashboardHost()
  const api = useDashboardApi()
  const optionsRef = useRef(options)
  optionsRef.current = options
  const controllerRef = useRef(null)
  const warnedRef = useRef(false)

  const ensureController = useCallback(() => {
    if (controllerRef.current) return controllerRef.current
    if (!map) return null
    const mapboxgl = libraries?.mapboxgl
    if (!mapboxgl?.Popup) {
      if (!warnedRef.current) {
        warnedRef.current = true
        console.warn("[serviceradar-sdk] useMapPopup requires libraries.mapboxgl.Popup; popup is a no-op")
      }
      return null
    }
    controllerRef.current = createReactMapPopupController({
      map,
      mapboxgl,
      createRoot: optionsRef.current.createRoot || defaultCreateRoot,
      options: {
        ...optionsRef.current,
        wrapContent: (content) => React.createElement(
          DashboardProvider,
          {host, api},
          typeof optionsRef.current.wrapContent === "function"
            ? optionsRef.current.wrapContent(content)
            : content,
        ),
      },
    })
    return controllerRef.current
  }, [map, libraries, host, api])

  const open = useCallback((request) => {
    const controller = ensureController()
    controller?.open(request)
  }, [ensureController])

  const close = useCallback(() => {
    controllerRef.current?.close()
  }, [])

  useEffect(() => {
    return () => {
      controllerRef.current?.close()
      controllerRef.current = null
    }
  }, [map])

  return useMemo(() => ({
    open,
    close,
    get popup() { return controllerRef.current?.popup ?? null },
    get isOpen() { return Boolean(controllerRef.current?.isOpen()) },
  }), [open, close])
}

function createDomNode() {
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    return document.createElement("div")
  }
  // Sentinel for environments without DOM (e.g. unit tests with mocked Popup); the real
  // Popup integration only runs in the browser, but createRoot consumers may inject a stub.
  return {nodeType: 1, children: [], appendChild() {}}
}

function wrapContent(content, settings) {
  return typeof settings.wrapContent === "function" ? settings.wrapContent(content) : content
}
