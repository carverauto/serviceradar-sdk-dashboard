import {useCallback, useEffect, useMemo, useRef, useState} from "react"

import {useDashboardApi} from "./react.js"

// Live behaviour for dashboards: plugin actions (`actions.invoke`), live OCSF
// events (`events.subscribe`) and on-demand frame refresh. The host owns the
// channel, authorization and audit; these helpers turn host calls into state a
// component can render.

export const ACTIONS_INVOKE_CAPABILITY = "actions.invoke"
export const EVENTS_SUBSCRIBE_CAPABILITY = "events.subscribe"

const TERMINAL_STATES = new Set(["succeeded", "failed", "expired", "canceled", "suppressed", "unknown"])

// Host error codes for an invoke the host held for confirmation and did not
// dispatch, mapped to ActionConfirmationDeclinedError#reason.
const CONFIRMATION_REFUSALS = {
  confirmation_declined: "declined",
  confirmation_expired: "expired",
  confirmation_rejected: "rejected",
}

export function isTerminalActionState(state) {
  return TERMINAL_STATES.has(String(state || ""))
}

// Raised when the dashboard manifest does not declare the capability an API
// needs, or the host exposes no such API at all.
export class DashboardCapabilityError extends Error {
  constructor(capability, message = `dashboard capability is not approved: ${capability}`) {
    super(message)
    this.name = "DashboardCapabilityError"
    this.code = "capability_denied"
    this.capability = capability
  }
}

// Raised when an action that requires confirmation was not confirmed in the
// host's confirmation dialog: the operator declined it (`reason: "declined"`),
// it timed out (`"expired"`), or the host refused the confirmation
// (`"rejected"`). The action was not dispatched.
export class ActionConfirmationDeclinedError extends Error {
  constructor({reason = "declined", actionId = null, confirmationId = null, message} = {}) {
    super(message || `action confirmation ${reason}`)
    this.name = "ActionConfirmationDeclinedError"
    this.code = `confirmation_${reason}`
    this.reason = reason
    this.actionId = actionId
    this.confirmationId = confirmationId
  }
}

export function actionRequiresConfirmation(action) {
  return action?.requires_confirmation === true
}

function apiAllowed(section) {
  return Boolean(section && (typeof section.allowed !== "function" || section.allowed()))
}

// The manifest check. A host without `capabilityAllowed` is trusted to gate the
// API itself (older hosts); a host that has it and says no is final.
function capabilityDeclared(api, capability) {
  return typeof api?.capabilityAllowed !== "function" || api.capabilityAllowed(capability) === true
}

function capabilityError(api, sectionName, method, capability) {
  if (!capabilityDeclared(api, capability)) return new DashboardCapabilityError(capability)
  const section = api?.[sectionName]
  if (!section || typeof section[method] !== "function") {
    return new DashboardCapabilityError(capability, `host has no ${sectionName} API`)
  }
  return null
}

function confirmationRefusal(error, fallback) {
  const reason = CONFIRMATION_REFUSALS[error?.code]
  if (!reason) return error
  return new ActionConfirmationDeclinedError({
    reason,
    actionId: error.actionId ?? fallback.actionId ?? null,
    confirmationId: error.confirmationId ?? fallback.confirmationId ?? null,
    message: error.message,
  })
}

// Framework-free runner behind useDashboardActions. `onChange` receives the
// full `{[invocationId]: progress}` map after every progress step;
// `onConfirmationChange` receives the `{[confirmationId]: confirmation}` map
// whenever a held invoke's confirmation state moves.
//
// The SDK never draws a confirmation dialog. For an action that requires
// confirmation the host holds the invoke, shows its own dialog outside the
// renderer, and dispatches only after the operator confirms there; the promise
// resolves after that, or rejects with ActionConfirmationDeclinedError.
export function createActionRunner({api, onChange = () => {}, onConfirmationChange = () => {}}) {
  let invocations = {}
  let confirmations = {}

  const record = (progress) => {
    const id = String(progress?.invocation_id || "")
    if (!id) return
    invocations = {...invocations, [id]: {...progress}}
    onChange(invocations)
  }

  const recordConfirmation = (update) => {
    const id = String(update?.confirmation_id || "")
    if (!id) return
    confirmations = {...confirmations, [id]: {...(confirmations[id] || {}), ...update}}
    onConfirmationChange(confirmations)
  }

  return {
    invocations: () => invocations,
    confirmations: () => confirmations,
    list(options = {}) {
      const error = capabilityError(api, "actions", "list", ACTIONS_INVOKE_CAPABILITY)
      if (error) return Promise.reject(error)
      return Promise.resolve(api.actions.list(options)).then((list) => (Array.isArray(list) ? list : []))
    },
    invoke(request, {onProgress, onConfirmation} = {}) {
      const error = capabilityError(api, "actions", "invoke", ACTIONS_INVOKE_CAPABILITY)
      if (error) return Promise.reject(error)

      let lastConfirmationId = null
      const actionId = request?.actionId ?? request?.action_id ?? null

      return Promise.resolve()
        .then(() =>
          api.actions.invoke(request, {
            onProgress: (progress) => {
              record(progress)
              onProgress?.(progress)
            },
            onConfirmation: (update) => {
              lastConfirmationId = update?.confirmation_id ?? lastConfirmationId
              recordConfirmation(update)
              onConfirmation?.(update)
            },
          }),
        )
        .catch((reason) => {
          throw confirmationRefusal(reason, {actionId, confirmationId: lastConfirmationId})
        })
    },
  }
}

// Framework-free subscription behind useDashboardEvents. Returns an
// unsubscribe function, or null when the host has no events API.
export function subscribeDashboardEvents({api, filter = {}, onEvents, onError = () => {}}) {
  const error = capabilityError(api, "events", "subscribe", EVENTS_SUBSCRIBE_CAPABILITY)
  if (error) {
    onError(error)
    return null
  }

  try {
    return api.events.subscribe(filter, onEvents, {onError})
  } catch (error) {
    onError(error)
    return null
  }
}

export function useDashboardActionsAvailable() {
  const api = useDashboardApi()
  return capabilityDeclared(api, ACTIONS_INVOKE_CAPABILITY) && apiAllowed(api?.actions)
}

export function useDashboardEventsAvailable() {
  const api = useDashboardApi()
  return capabilityDeclared(api, EVENTS_SUBSCRIBE_CAPABILITY) && apiAllowed(api?.events)
}

function latestConfirmation(confirmations, predicate) {
  const matching = Object.values(confirmations).filter(predicate)
  return matching.length > 0 ? matching[matching.length - 1] : null
}

// Lists the viewer's launchable actions for `scope` (optionally one plugin) and
// runs them. `invocations` maps invocation id to its latest progress;
// `confirmations` maps confirmation id to the state of an invoke the host is
// holding for its own confirmation dialog.
export function useDashboardActions({scope = "device", pluginId, enabled = true} = {}) {
  const api = useDashboardApi()
  const declared = capabilityDeclared(api, ACTIONS_INVOKE_CAPABILITY)
  const allowed = declared && apiAllowed(api?.actions)
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [invocations, setInvocations] = useState({})
  const [confirmations, setConfirmations] = useState({})
  const [reloadToken, setReloadToken] = useState(0)
  const runner = useMemo(
    () => createActionRunner({api, onChange: setInvocations, onConfirmationChange: setConfirmations}),
    [api],
  )

  useEffect(() => {
    setActions([])
    setError(null)

    if (enabled && !declared) {
      setLoading(false)
      setError(new DashboardCapabilityError(ACTIONS_INVOKE_CAPABILITY))
      return undefined
    }

    if (!enabled || !allowed) {
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    runner
      .list({scope, pluginId})
      .then((list) => {
        if (!cancelled) {
          setActions(list)
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
  }, [api, runner, allowed, declared, enabled, scope, pluginId, reloadToken])

  const invoke = useCallback((request, options) => runner.invoke(request, options), [runner])
  const reload = useCallback(() => setReloadToken((token) => token + 1), [])
  const pendingConfirmation = latestConfirmation(confirmations, (entry) => entry.state === "pending")
  const declinedConfirmation = latestConfirmation(confirmations, (entry) =>
    ["declined", "expired", "rejected"].includes(entry.state),
  )

  return {
    allowed,
    actions,
    loading,
    error,
    invocations,
    confirmations,
    pendingConfirmation,
    declinedConfirmation,
    invoke,
    reload,
  }
}

// Calls `onEvents(events)` for live OCSF events matching `filter`. The filter
// is compared by value, so an inline object literal does not resubscribe on
// every render. A null or undefined filter means "not ready" and does not
// subscribe; pass `{}` to receive every event.
export function useDashboardEvents(filter, onEvents, {enabled = true} = {}) {
  const api = useDashboardApi()
  const declared = capabilityDeclared(api, EVENTS_SUBSCRIBE_CAPABILITY)
  const allowed = declared && apiAllowed(api?.events)
  const [error, setError] = useState(null)
  const callbackRef = useRef(onEvents)
  callbackRef.current = onEvents
  const filterKey = JSON.stringify(filter ?? null)

  useEffect(() => {
    if (enabled && !declared) {
      setError(new DashboardCapabilityError(EVENTS_SUBSCRIBE_CAPABILITY))
      return undefined
    }

    if (!enabled || !allowed || filterKey === "null") return undefined

    setError(null)
    const unsubscribe = subscribeDashboardEvents({
      api,
      filter: JSON.parse(filterKey),
      onEvents: (events) => callbackRef.current?.(events),
      onError: setError,
    })

    return () => unsubscribe?.()
  }, [api, allowed, declared, enabled, filterKey])

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
