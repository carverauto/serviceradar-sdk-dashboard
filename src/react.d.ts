import type {ComponentType, ReactElement, ReactNode, RefObject} from "react"
import type {SrqlClient} from "./srql.js"
import type {
  CreateDashboardQueryStateOptions,
  DashboardQueryStateApplyOptions,
  DashboardQueryStatePatch,
  DashboardQueryStateResetOptions,
  DashboardQueryStateSnapshot,
} from "./query-state.js"
import type {IndexedRows, IndexedRowsOptions} from "./filtering.js"

export type DashboardTheme = "dark" | "light" | string

export type DashboardFrameEncoding = "json_rows" | "arrow_ipc" | string

export interface DashboardFrame<Row = Record<string, unknown>> {
  id: string
  query?: string
  encoding?: DashboardFrameEncoding
  status?: string
  results?: Row[]
  rows?: Row[]
  row_count?: number
  refreshed_at?: string
  generated_at?: string
  payload?: ArrayBuffer | Uint8Array | string
  payload_encoding?: "base64" | string
  payload_base64?: string
  error?: string
  errors?: unknown[]
  [key: string]: unknown
}

export interface DashboardPackageInfo {
  id?: string
  dashboard_id?: string
  name?: string
  version?: string
  renderer?: Record<string, unknown>
  frames?: DashboardFrame[]
  [key: string]: unknown
}

export interface DashboardInstanceInfo {
  id?: string
  name?: string
  route_slug?: string
  placement?: string
  settings?: Record<string, unknown>
  [key: string]: unknown
}

export interface DashboardHost {
  version?: string
  package?: DashboardPackageInfo
  instance?: DashboardInstanceInfo
  settings?: Record<string, unknown>
  mapbox?: Record<string, unknown>
  data_provider?: Record<string, unknown>
  [key: string]: unknown
}

export type DashboardNavigationTarget =
  | string
  | {type: "device"; uid?: string; device_uid?: string}
  | {type: "dashboard"; route_slug?: string; routeSlug?: string}
  | {type: "path"; path?: string}
  | {type: string; [key: string]: unknown}

export interface DashboardFrameUpdate<Row = Record<string, unknown>> {
  frames: DashboardFrame<Row>[]
  payload?: unknown
}

export interface DashboardArrowApi {
  frameBytes(idOrFrame: string | DashboardFrame): Uint8Array
  table(idOrFrame: string | DashboardFrame): Promise<unknown>
}

export interface DashboardLibraries {
  mapboxgl?: unknown
  MapboxOverlay?: unknown
  ArcLayer?: unknown
  LineLayer?: unknown
  ScatterplotLayer?: unknown
  TextLayer?: unknown
  [key: string]: unknown
}

export interface DashboardPreferenceApi {
  all(): Record<string, unknown>
  get<T = unknown>(key: string, fallback?: T): T
  set(key: string, value: unknown): Record<string, unknown>
}

export interface DashboardSavedQuery {
  id?: string
  name?: string
  query: string
  frameQueries?: Record<string, string>
  [key: string]: unknown
}

export interface DashboardSavedQueryApi {
  list(): DashboardSavedQuery[]
  current(frameId?: string): string
  apply(query: string, frameQueries?: Record<string, string>): void
}

export interface DashboardPopupHandle {
  close(): void
}

export interface DashboardPopupApi {
  open(content: unknown, options?: {title?: string; x?: number; y?: number; [key: string]: unknown}): DashboardPopupHandle
  close(): void
}

export interface DashboardDetailsApi {
  open(target: string | Record<string, unknown>): void
}

export interface DashboardApi<Row = Record<string, unknown>> {
  version?: string
  capabilityAllowed?(capability: string): boolean
  requireCapability?(capability: string): void
  theme?(): DashboardTheme
  isDarkMode?(): boolean
  frames?(): DashboardFrame<Row>[]
  frame?(id: string): DashboardFrame<Row> | undefined
  srql?: SrqlClient | (SrqlClient & (() => {query: string}))
  setSrqlQuery?(query: string, frameQueries?: Record<string, string>): void
  navigate?(target: DashboardNavigationTarget): void
  openDevice?(uid: string): void
  openDashboard?(routeSlug: string): void
  onFrameUpdate?(callback: (update: DashboardFrameUpdate<Row>) => void): () => void
  onThemeChange?(callback: (theme: DashboardTheme) => void): () => void
  arrow?: DashboardArrowApi
  mapbox?(): Record<string, unknown>
  libraries?: DashboardLibraries
  preferences?: DashboardPreferenceApi
  savedQueries?: DashboardSavedQueryApi
  popup?: DashboardPopupApi
  details?: DashboardDetailsApi
  [key: string]: unknown
}

export interface DashboardProviderProps {
  host: DashboardHost
  api: DashboardApi
  lifecycle?: DashboardLifecycle
  children?: ReactNode
}

export interface MountedDashboard {
  destroy(): void
}

export interface DashboardLifecycle {
  ready(mounted?: MountedDashboard | (() => void) | void): void
  error?(error: unknown): void
}

export interface MountReactDashboardOptions {
  waitForReady?: boolean
}

export interface DashboardControllerOptions {
  clearRoot?: boolean
  dependencies?: unknown[]
  onError?(error: unknown): void
}

export interface DashboardControllerState<Root extends Element = HTMLDivElement> {
  ref: RefObject<Root | null>
  error: unknown
}

export type DashboardControllerFactory = (
  root: Element,
  host: DashboardHost,
  api: DashboardApi,
) => MountedDashboard | (() => void) | void | Promise<MountedDashboard | (() => void) | void>

export type DashboardMountFunction = (
  root: Element,
  host: DashboardHost,
  api: DashboardApi,
) => Promise<MountedDashboard>

export function DashboardProvider(props: DashboardProviderProps): ReactElement
export function useDashboardHost(): DashboardHost
export function useDashboardApi<Row = Record<string, unknown>>(): DashboardApi<Row>
export function useDashboardReady(): (mounted?: MountedDashboard | (() => void) | void) => void
export function useDashboardFrames<Row = Record<string, unknown>>(): DashboardFrame<Row>[]
export function useDashboardFrame<Row = Record<string, unknown>>(frameId: string): DashboardFrame<Row> | undefined

export type DashboardFrameDecode = "auto" | "arrow" | "json"

export type DashboardRowShape<Projected = Record<string, unknown>, Row = Record<string, unknown>> = {
  [Field in keyof Projected]: keyof Row | ((row: Row) => Projected[Field])
}

export interface UseFrameRowsOptions<Projected = Record<string, unknown>, Row = Record<string, unknown>> {
  decode?: DashboardFrameDecode
  shape?: DashboardRowShape<Projected, Row>
  fallback?: Projected[]
}

export function useFrameRows<Projected = Record<string, unknown>, Row = Record<string, unknown>>(
  frameId: string,
  options?: UseFrameRowsOptions<Projected, Row>,
): Projected[]
export function useFrameRowsFromFrame<Projected = Record<string, unknown>, Row = Record<string, unknown>>(
  frame: DashboardFrame<Row> | undefined,
  options?: UseFrameRowsOptions<Projected, Row>,
): Projected[]
export function useArrowTable(frame: DashboardFrame | undefined): unknown

export type {MapPopupHandle, MapPopupOpenRequest, UseMapPopupOptions} from "./popup.js"
export {useMapPopup} from "./popup.js"

export function useIndexedRows<Row = Record<string, unknown>>(
  rows: Row[] | null | undefined,
  options?: IndexedRowsOptions<Row>,
): IndexedRows<Row>

export interface UseFilterStateOptions<State = Record<string, unknown>> {
  initialState?: State
  debounceMs?: number
  debounceFields?: Array<keyof State | string>
}

export interface UseFilterStateResult<State = Record<string, unknown>> {
  state: State
  debouncedState: State
  setFilter(key: string, value: unknown): void
  setFilter(patch: Partial<State> | ((prev: State) => Partial<State>)): void
  toggle(key: string, value: unknown): void
  clear(): void
  setState(next: Partial<State> | ((prev: State) => State)): void
}

export function useFilterState<State = Record<string, unknown>>(
  options?: UseFilterStateOptions<State>,
): UseFilterStateResult<State>
export function useDashboardTheme(): DashboardTheme
export function useDashboardSrql(): SrqlClient
export interface UseDashboardQueryStateResult<State = Record<string, unknown>, Hydrated = State>
  extends DashboardQueryStateSnapshot<State> {
  apply(patch: DashboardQueryStatePatch<State>, options?: DashboardQueryStateApplyOptions): void
  reset(options?: DashboardQueryStateResetOptions): void
  flush(): void
  hydrate(input: Hydrated): void
}
export function useDashboardQueryState<State = Record<string, unknown>, Hydrated = State>(
  options?: CreateDashboardQueryStateOptions<State, Hydrated>,
): UseDashboardQueryStateResult<State, Hydrated>
export function useDashboardSettings(): Record<string, unknown>
export function useDashboardMapbox(): Record<string, unknown>
export function useDashboardLibraries(): DashboardLibraries
export function useDashboardCapability(capability: string): boolean
export function useDashboardNavigation(): {
  open(target: DashboardNavigationTarget): void
  toDevice(deviceUid: string): void
  toDashboard(routeSlug: string): void
}
export function useDashboardPreferences(): DashboardPreferenceApi
export function useDashboardSavedQueries(): DashboardSavedQueryApi
export function useDashboardPopup(): DashboardPopupApi
export function useDashboardDetails(): DashboardDetailsApi
export function useDashboardController<Root extends Element = HTMLDivElement>(
  createController: DashboardControllerFactory,
  options?: DashboardControllerOptions,
): DashboardControllerState<Root>
export function mountReactDashboard(
  Component: ComponentType<{host: DashboardHost; api: DashboardApi}>,
  options?: MountReactDashboardOptions,
): DashboardMountFunction
