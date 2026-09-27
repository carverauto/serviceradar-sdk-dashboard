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

export interface DashboardActionsApi {
  allowed(): boolean
  list(options?: {scope?: "device" | "interface"; pluginId?: string; providerType?: string}): Promise<DashboardAction[]>
  invoke(
    request: DashboardActionRequest,
    options?: {onProgress?: (progress: DashboardActionProgress) => void},
  ): Promise<DashboardActionProgress>
}

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

export declare function createActionRunner(options: {
  api: {actions?: DashboardActionsApi} | null | undefined
  onChange?: (invocations: Record<string, DashboardActionProgress>) => void
}): {
  invocations(): Record<string, DashboardActionProgress>
  invoke(
    request: DashboardActionRequest,
    options?: {onProgress?: (progress: DashboardActionProgress) => void},
  ): Promise<DashboardActionProgress>
}

export declare function subscribeDashboardEvents(options: {
  api: {events?: DashboardEventsApi} | null | undefined
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
  error: (Error & {code?: string}) | null
  invocations: Record<string, DashboardActionProgress>
  invoke: DashboardActionsApi["invoke"]
  reload(): void
}

export declare function useDashboardEvents(
  filter: DashboardEventFilter | null | undefined,
  onEvents: (events: DashboardEvent[]) => void,
  options?: {enabled?: boolean},
): {allowed: boolean; error: (Error & {code?: string}) | null}

export declare function useFrameRefresh(): () => Promise<{refreshed: boolean; reason?: string}>
