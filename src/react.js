import React, {createContext, useContext, useEffect, useMemo, useState} from "react"
import {createRoot} from "react-dom/client"
import {createSrqlClient} from "./srql.js"

const DashboardContext = createContext(null)

export function DashboardProvider({host, api, children}) {
  const value = useMemo(() => ({host, api}), [host, api])
  return React.createElement(DashboardContext.Provider, {value}, children)
}

export function useDashboardHost() {
  return useDashboardContext().host
}

export function useDashboardApi() {
  return useDashboardContext().api
}

export function useDashboardFrames() {
  const {api} = useDashboardContext()
  const [frames, setFrames] = useState(() => safeFrames(api))

  useEffect(() => {
    setFrames(safeFrames(api))
    return api?.onFrameUpdate?.(({frames: nextFrames}) => setFrames(Array.isArray(nextFrames) ? [...nextFrames] : safeFrames(api)))
  }, [api])

  return frames
}

export function useDashboardFrame(frameId) {
  const frames = useDashboardFrames()
  return frames.find((frame) => String(frame?.id) === String(frameId))
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

export function mountReactDashboard(Component) {
  return async function mountDashboard(root, host, api) {
    const reactRoot = createRoot(root)

    reactRoot.render(
      React.createElement(
        DashboardProvider,
        {host, api},
        React.createElement(Component, {host, api}),
      ),
    )

    return {
      destroy() {
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
