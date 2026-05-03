import type {ComponentType, ReactElement, ReactNode} from "react"
import type {SrqlClient} from "./srql.js"

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
  [key: string]: unknown
}

export interface DashboardProviderProps {
  host: DashboardHost
  api: DashboardApi
  children?: ReactNode
}

export interface MountedDashboard {
  destroy(): void
}

export type DashboardMountFunction = (
  root: Element,
  host: DashboardHost,
  api: DashboardApi,
) => Promise<MountedDashboard>

export function DashboardProvider(props: DashboardProviderProps): ReactElement
export function useDashboardHost(): DashboardHost
export function useDashboardApi<Row = Record<string, unknown>>(): DashboardApi<Row>
export function useDashboardFrames<Row = Record<string, unknown>>(): DashboardFrame<Row>[]
export function useDashboardFrame<Row = Record<string, unknown>>(frameId: string): DashboardFrame<Row> | undefined
export function useDashboardTheme(): DashboardTheme
export function useDashboardSrql(): SrqlClient
export function useDashboardSettings(): Record<string, unknown>
export function useDashboardMapbox(): Record<string, unknown>
export function useDashboardLibraries(): DashboardLibraries
export function useDashboardCapability(capability: string): boolean
export function useDashboardNavigation(): {
  open(target: DashboardNavigationTarget): void
  toDevice(deviceUid: string): void
  toDashboard(routeSlug: string): void
}
export function mountReactDashboard(Component: ComponentType<{host: DashboardHost; api: DashboardApi}>): DashboardMountFunction
