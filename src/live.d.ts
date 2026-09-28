export declare const ACTIONS_INVOKE_CAPABILITY: "actions.invoke"
export declare const EVENTS_SUBSCRIBE_CAPABILITY: "events.subscribe"

export type DashboardActionState =
  | "pending"
  | "dispatching"
  | "running"
  | "polling"
  | "result_fetching"
  | "succeeded"
  | "failed"
  | "expired"
  | "canceled"
  | "suppressed"
  | "unknown"

export interface DashboardAction {
  id: string
  label: string
  description?: string | null
  provider_type?: string
  provider_name?: string | null
  scope: "device" | "interface"
  input_schema: Record<string, unknown>
  safety_classification?: string
  requires_confirmation: boolean
  timeout_seconds?: number
  plugin_id?: string | null
}

export interface DashboardActionTarget {
  deviceUid: string
  interfaceUid?: string
}

export interface DashboardActionRequest {
  actionId: string
  scope?: "device" | "interface"
  targets: DashboardActionTarget[]
  input?: Record<string, unknown>
}

export interface DashboardActionProgress {
  invocation_id: string
  state: DashboardActionState
  result_summary?: Record<string, unknown>
  error_message?: string | null
  completed_at?: string | null
}

export type DashboardActionConfirmationState = "pending" | "confirmed" | "declined" | "expired" | "rejected"

/**
 * State of an invoke the host is holding for its own confirmation dialog. The
 * host, not the dashboard, renders that dialog and dispatches only after the
 * operator confirms there.
 */
export interface DashboardActionConfirmation {
  confirmation_id: string
  state: DashboardActionConfirmationState
  action_id?: string | null
  /** Set on `pending`: how long the host waits for the operator. */
  expires_in_ms?: number
  /** Set on `expired` and `rejected`. */
  reason?: string | null
}

export interface DashboardActionInvokeOptions {
  onProgress?: (progress: DashboardActionProgress) => void
  onConfirmation?: (confirmation: DashboardActionConfirmation) => void
}

export interface DashboardActionListOptions {
  scope?: "device" | "interface"
  pluginId?: string
  providerType?: string
}

export interface DashboardActionsApi {
  allowed(): boolean
  list(options?: DashboardActionListOptions): Promise<DashboardAction[]>
  /**
   * Resolves with the terminal progress. For an action with
   * `requires_confirmation` it resolves only after the operator confirms in the
   * host dialog, and rejects (code `confirmation_declined`,
   * `confirmation_expired` or `confirmation_rejected`) if they do not.
   */
  invoke(request: DashboardActionRequest, options?: DashboardActionInvokeOptions): Promise<DashboardActionProgress>
}

export type DashboardApiErrorCode =
  | "capability_denied"
  | "permission_denied"
  | "not_connected"
  | "invalid_request"
  | "rejected"
  | "timeout"
  | "confirmation_declined"
  | "confirmation_expired"
  | "confirmation_rejected"

export declare class DashboardCapabilityError extends Error {
  constructor(capability: string, message?: string)
  readonly name: "DashboardCapabilityError"
  readonly code: "capability_denied"
  readonly capability: string
}

export type ActionConfirmationRefusal = "declined" | "expired" | "rejected"

/** The action required confirmation and was not confirmed; nothing was dispatched. */
export declare class ActionConfirmationDeclinedError extends Error {
  constructor(options?: {
    reason?: ActionConfirmationRefusal
    actionId?: string | null
    confirmationId?: string | null
    message?: string
  })
  readonly name: "ActionConfirmationDeclinedError"
  readonly code: `confirmation_${ActionConfirmationRefusal}`
  readonly reason: ActionConfirmationRefusal
  readonly actionId: string | null
  readonly confirmationId: string | null
}

export declare function actionRequiresConfirmation(action: Pick<DashboardAction, "requires_confirmation"> | null | undefined): boolean

/** A persisted OCSF event as delivered to subscribers. */
export interface DashboardEvent {
  id: string
  time: string | null
  class_uid?: number
  category_uid?: number
  type_uid?: number
  activity_id?: number
  activity_name?: string | null
  severity_id?: number
  severity?: string | null
  message?: string | null
  status_id?: number | null
  status?: string | null
  status_code?: string | null
  log_name?: string | null
  log_provider?: string | null
  device: {uid?: string; hostname?: string; name?: string; ip?: string; mac?: string}
  metadata: Record<string, unknown>
}

/** Every key is optional; all given keys must match. */
export interface DashboardEventFilter {
  log_provider?: string | string[]
  log_name?: string | string[]
  class_uid?: number | number[]
  device_uid?: string | string[]
  min_severity_id?: number
  /** Up to eight scalar fields compared as strings. */
  metadata?: Record<string, string | number | boolean>
}

export interface DashboardEventsApi {
  allowed(): boolean
  subscribe(
    filter: DashboardEventFilter,
    onEvents: (events: DashboardEvent[]) => void,
    options?: {onError?: (error: Error & {code?: string}) => void},
  ): () => void
}

export declare function isTerminalActionState(state: string | null | undefined): boolean

type LiveHostApi = {capabilityAllowed?(capability: string): boolean}

export declare function createActionRunner(options: {
  api: (LiveHostApi & {actions?: DashboardActionsApi}) | null | undefined
  onChange?: (invocations: Record<string, DashboardActionProgress>) => void
  onConfirmationChange?: (confirmations: Record<string, DashboardActionConfirmation>) => void
}): {
  invocations(): Record<string, DashboardActionProgress>
  confirmations(): Record<string, DashboardActionConfirmation>
  /** Rejects with DashboardCapabilityError when `actions.invoke` is not declared. */
  list(options?: DashboardActionListOptions): Promise<DashboardAction[]>
  /**
   * Rejects with DashboardCapabilityError when `actions.invoke` is not declared,
   * and with ActionConfirmationDeclinedError when a required confirmation is
   * declined, expires or is refused.
   */
  invoke(request: DashboardActionRequest, options?: DashboardActionInvokeOptions): Promise<DashboardActionProgress>
}

export declare function subscribeDashboardEvents(options: {
  api: (LiveHostApi & {events?: DashboardEventsApi}) | null | undefined
  filter?: DashboardEventFilter
  onEvents: (events: DashboardEvent[]) => void
  onError?: (error: Error & {code?: string}) => void
}): (() => void) | null

export declare function useDashboardActionsAvailable(): boolean
export declare function useDashboardEventsAvailable(): boolean

export declare function useDashboardActions(options?: {
  scope?: "device" | "interface"
  pluginId?: string
  enabled?: boolean
}): {
  allowed: boolean
  actions: DashboardAction[]
  loading: boolean
  /** A DashboardCapabilityError when the manifest lacks `actions.invoke`. */
  error: (Error & {code?: string}) | null
  invocations: Record<string, DashboardActionProgress>
  confirmations: Record<string, DashboardActionConfirmation>
  /** The most recent invoke waiting on the host's confirmation dialog. */
  pendingConfirmation: DashboardActionConfirmation | null
  /** The most recent confirmation that was declined, expired or refused. */
  declinedConfirmation: DashboardActionConfirmation | null
  invoke: DashboardActionsApi["invoke"]
  reload(): void
}

export declare function useDashboardEvents(
  filter: DashboardEventFilter | null | undefined,
  onEvents: (events: DashboardEvent[]) => void,
  options?: {enabled?: boolean},
): {allowed: boolean; error: (Error & {code?: string}) | null}

export declare function useFrameRefresh(): () => Promise<{refreshed: boolean; reason?: string}>
