import type {SrqlClient} from "./srql.js"

export interface DashboardQueryStateApplyOptions {
  debounceMs?: number
  immediate?: boolean
}

export interface DashboardQueryStateResetOptions extends DashboardQueryStateApplyOptions {}

export interface DashboardQueryStateApplyEvent<State> {
  state: State
  query: string
  frameQueries: Record<string, string>
}

export interface DashboardQueryStateTimers {
  set(callback: () => void, ms: number): unknown
  clear(handle: unknown): void
}

export interface CreateDashboardQueryStateOptions<State = Record<string, unknown>, Hydrated = State> {
  initialState?: State
  baseQuery?: string
  buildQuery?(state: State): string | null | undefined
  buildFrameQueries?(state: State): Record<string, string | null | undefined> | null | undefined
  serializeFilters?(state: State): unknown
  hydrateFilters?(input: Hydrated): State | null | undefined
  debounceMs?: number
  onBeforeApply?(event: DashboardQueryStateApplyEvent<State>): void
  onAfterApply?(event: DashboardQueryStateApplyEvent<State>): void
  srqlClient?: Pick<SrqlClient, "update"> | null
  apply?(query: string, frameQueries: Record<string, string>): void
  timers?: DashboardQueryStateTimers
}

export interface DashboardQueryStateSnapshot<State = Record<string, unknown>> {
  state: State
  query: string
  frameQueries: Record<string, string>
  dirty: boolean
}

export type DashboardQueryStateListener<State> = (snapshot: DashboardQueryStateSnapshot<State>) => void

export type DashboardQueryStatePatch<State> =
  | Partial<State>
  | State
  | ((current: State) => Partial<State> | State)

export interface DashboardQueryStateController<State = Record<string, unknown>, Hydrated = State> {
  apply(patch: DashboardQueryStatePatch<State>, options?: DashboardQueryStateApplyOptions): void
  reset(options?: DashboardQueryStateResetOptions): void
  flush(): void
  getState(): State
  getSnapshot(): DashboardQueryStateSnapshot<State>
  subscribe(listener: DashboardQueryStateListener<State>): () => void
  serialize(): unknown
  hydrate(input: Hydrated): void
  destroy(): void
}

export function createDashboardQueryState<State = Record<string, unknown>, Hydrated = State>(
  options?: CreateDashboardQueryStateOptions<State, Hydrated>,
): DashboardQueryStateController<State, Hydrated>

export function fingerprintQueryState(
  query: string,
  frameQueries?: Record<string, string | null | undefined> | null,
): string
