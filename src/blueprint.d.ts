import type {ComponentType, CSSProperties, ReactElement, ReactNode} from "react"
import type {
  DashboardApi,
  DashboardHost,
  DashboardMountFunction,
  DashboardTheme,
  MountReactDashboardOptions,
} from "./react.js"

export const BLUEPRINT_ROOT_CLASS: "sr-dashboard-blueprint"
export const BLUEPRINT_PORTAL_CLASS: "sr-dashboard-blueprint-portals"
export const BLUEPRINT_DARK_CLASS: "bp6-dark"
export const BLUEPRINT_STYLE_ATTRIBUTE: "data-sr-blueprint-sdk"
export const BLUEPRINT_PORTAL_ATTRIBUTE: "data-sr-blueprint-portals"
export const BLUEPRINT_MOUNT_ATTRIBUTE: "data-sr-blueprint-mount"

export const BLUEPRINT_CORE_SCOPED_CSS: string
export const BLUEPRINT_SELECT_SCOPED_CSS: string
export const BLUEPRINT_SCOPED_CSS: string
export const BLUEPRINT_THEME_BRIDGE_CSS: string

export function scopeBlueprintCss(rawCss: string, scopeSelector?: string): string
export function buildBlueprintThemeBridgeCss(scopeSelector?: string): string

export interface BlueprintDashboardProviderProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  portalClassName?: string
  theme?: DashboardTheme
  host?: DashboardHost
  api?: DashboardApi
}

export interface MountBlueprintDashboardOptions extends MountReactDashboardOptions {
  className?: string
  style?: CSSProperties
  portalClassName?: string
}

export function BlueprintDashboardProvider(props: BlueprintDashboardProviderProps): ReactElement

export function useBlueprintPortalContainer(): HTMLElement | null

export function mountBlueprintDashboard(
  Component: ComponentType<{host: DashboardHost; api: DashboardApi}>,
  options?: MountBlueprintDashboardOptions,
): DashboardMountFunction
