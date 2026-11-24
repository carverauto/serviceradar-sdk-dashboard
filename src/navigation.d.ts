export type DashboardNavigationValidRule =
  | Iterable<string>
  | ((value: string) => boolean)

export type DashboardNavigationValidValues<State extends Record<string, string> = Record<string, string>> = {
  [Key in keyof State]?: DashboardNavigationValidRule
}

export interface DashboardNavigationWindow {
  location?: {
    hash?: string
    pathname?: string
    search?: string
  }
  history?: {
    state?: unknown
    pushState?(data: unknown, unused: string, url?: string | URL | null): void
    replaceState?(data: unknown, unused: string, url?: string | URL | null): void
    back?(): void
    forward?(): void
  }
  addEventListener?(type: string, listener: EventListenerOrEventListenerObject): void
  removeEventListener?(type: string, listener: EventListenerOrEventListenerObject): void
}

export interface CreateDashboardNavigationOptions<State extends Record<string, string> = Record<string, string>> {
  defaults?: State
  validValues?: DashboardNavigationValidValues<State>
  validate?(candidate: State, defaults: State): Partial<State> | State
  parse?(hash: string, defaults: State): Partial<State> | State
  format?(state: State, defaults: State): string
  hashPrefix?: string
  window?: DashboardNavigationWindow | null
}

export interface DashboardNavigationOptions {
  replace?: boolean
}

export type DashboardNavigationPatch<State extends Record<string, string> = Record<string, string>> =
  | Partial<State>
  | ((current: Readonly<State>) => Partial<State> | State)

export type DashboardNavigationListener<State extends Record<string, string> = Record<string, string>> = (
  state: Readonly<State>,
) => void

export interface DashboardNavigationController<State extends Record<string, string> = Record<string, string>> {
  navigate(patch: DashboardNavigationPatch<State>, options?: DashboardNavigationOptions): void
  back(): void
  forward(): void
  getState(): Readonly<State>
  subscribe(listener: DashboardNavigationListener<State>): () => void
  destroy(): void
}

export interface NavigationHashOptions<State extends Record<string, string> = Record<string, string>> {
  defaults?: State
  hashPrefix?: string
}

export function createDashboardNavigation<State extends Record<string, string> = Record<string, string>>(
  options?: CreateDashboardNavigationOptions<State>,
): DashboardNavigationController<State>

export function parseNavigationHash<State extends Record<string, string> = Record<string, string>>(
  rawHash: string,
  options?: NavigationHashOptions<State>,
): State

export function formatNavigationHash<State extends Record<string, string> = Record<string, string>>(
  state: Partial<State>,
  options?: NavigationHashOptions<State>,
): string
