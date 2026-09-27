import {useCallback, useEffect, useMemo, useRef, useState} from "react"

import {useDashboardApi} from "./react.js"

// Live behaviour for dashboards: plugin actions (`actions.invoke`), live OCSF
// events (`events.subscribe`) and on-demand frame refresh. The host owns the
// channel, authorization and audit; these helpers turn host calls into state a
// component can render.

export const ACTIONS_INVOKE_CAPABILITY = "actions.invoke"
export const EVENTS_SUBSCRIBE_CAPABILITY = "events.subscribe"

const TERMINAL_STATES = new Set(["succeeded", "failed", "expired", "canceled", "suppressed", "unknown"])

export function isTerminalActionState(state) {
  return TERMINAL_STATES.has(String(state || ""))
}

function apiAllowed(section) {
  return Boolean(section && (typeof section.allowed !== "function" || section.allowed()))
}

// Framework-free runner behind useDashboardActions. `onChange` receives the
// full `{[invocationId]: progress}` map after every progress step.
export function createActionRunner({api, onChange = () => {}}) {
  let invocations = {}

  const record = (progress) => {
    const id = String(progress?.invocation_id || "")
    if (!id) return
    invocations = {...invocations, [id]: {...progress}}
    onChange(invocations)
  }

  return {
    invocations: () => invocations,
    invoke(request, {onProgress} = {}) {
      const actionsApi = api?.actions
      if (!actionsApi || typeof actionsApi.invoke !== "function") {
        const error = new Error("host has no actions API")
        error.code = "capability_denied"
        return Promise.reject(error)
      }

      return actionsApi.invoke(request, {
        onProgress: (progress) => {
          record(progress)
          onProgress?.(progress)
        },
      })
    },
  }
}

// Framework-free subscription behind useDashboardEvents. Returns an
// unsubscribe function, or null when the host has no events API.
export function subscribeDashboardEvents({api, filter = {}, onEvents, onError = () => {}}) {
  const eventsApi = api?.events
  if (!eventsApi || typeof eventsApi.subscribe !== "function") {
    const error = new Error("host has no events API")
    error.code = "capability_denied"
    onError(error)
    return null
  }

  try {
    return eventsApi.subscribe(filter, onEvents, {onError})
  } catch (error) {
    onError(error)
    return null
  }
}

export function useDashboardActionsAvailable() {
  return apiAllowed(useDashboardApi()?.actions)
}

export function useDashboardEventsAvailable() {
  return apiAllowed(useDashboardApi()?.events)
}

// Lists the viewer's launchable actions for `scope` (optionally one plugin) and
// runs them. `invocations` maps invocation id to its latest progress.
export function useDashboardActions({scope = "device", pluginId, enabled = true} = {}) {
  const api = useDashboardApi()
  const allowed = apiAllowed(api?.actions)
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [invocations, setInvocations] = useState({})
  const [reloadToken, setReloadToken] = useState(0)
  const runner = useMemo(() => createActionRunner({api, onChange: setInvocations}), [api])

  useEffect(() => {
    setActions([])
    setError(null)

    if (!enabled || !allowed) {
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    api.actions
      .list({scope, pluginId})
      .then((list) => {
        if (!cancelled) {
          setActions(Array.isArray(list) ? list : [])
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [api, allowed, enabled, scope, pluginId, reloadToken])

  const invoke = useCallback((request, options) => runner.invoke(request, options), [runner])
  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  return {allowed, actions, loading, error, invocations, invoke, reload}
}

// Calls `onEvents(events)` for live OCSF events matching `filter`. The filter
// is compared by value, so an inline object literal does not resubscribe on
// every render.
export function useDashboardEvents(filter, onEvents, {enabled = true} = {}) {
  const api = useDashboardApi()
  const allowed = apiAllowed(api?.events)
  const [error, setError] = useState(null)
  const callbackRef = useRef(onEvents)
  callbackRef.current = onEvents
  const filterKey = JSON.stringify(filter || {})

  useEffect(() => {
    if (!enabled || !allowed) return undefined

    setError(null)
    const unsubscribe = subscribeDashboardEvents({
      api,
      filter: JSON.parse(filterKey),
      onEvents: (events) => callbackRef.current?.(events),
      onError: setError,
    })

    return () => unsubscribe?.()
  }, [api, allowed, enabled, filterKey])

  return {allowed, error}
}

// Returns a function that asks the host to re-run the dashboard's frames now.
// It resolves `{refreshed: false, reason}` when a refresh is already running.
export function useFrameRefresh() {
  const api = useDashboardApi()
  return useCallback(() => {
    if (typeof api?.refreshFrames !== "function") return Promise.resolve({refreshed: false, reason: "unsupported"})
    return api.refreshFrames()
  }, [api])
}
