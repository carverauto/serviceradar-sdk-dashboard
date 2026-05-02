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

export function useDashboardNavigation() {
  const {api} = useDashboardContext()

  return useMemo(() => ({
    toDevice(deviceUid) {
      const uid = String(deviceUid || "").trim()
      if (!uid) return

      if (typeof api?.navigate === "function") {
        api.navigate({type: "device", uid})
      } else {
        window.location.assign(`/devices/${encodeURIComponent(uid)}`)
      }
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
