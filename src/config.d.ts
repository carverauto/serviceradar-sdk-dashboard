// Typed surface for `dashboard.config.mjs` / `dashboard.config.js`.
//
// Authors call `defineDashboardConfig({...})` so editors complete and
// validate the shape; the helper is identity-at-runtime, so existing
// plain-object configs continue to work unchanged.

import type {UserConfig as ViteUserConfig} from "vite"

export type DashboardEncoding = "json_rows" | "arrow_ipc" | string

export interface DashboardFrameField {
  name: string
  type?: string
  description?: string
}

export interface DashboardFrameCoordinates {
  longitude?: string
  latitude?: string
}

export interface DashboardFrameSpec {
  id: string
  query?: string
  encoding?: DashboardEncoding
  limit?: number
  required?: boolean
  fields?: Array<string | DashboardFrameField>
  coordinates?: DashboardFrameCoordinates
  description?: string
  [key: string]: unknown
}

export interface DashboardRendererManifestSpec {
  kind?: "browser_module" | "wasm" | string
  interface_version?: string
  artifact?: string
  trust?: "trusted" | "review" | string
  entrypoint?: string
  /**
   * The SHA256 digest is filled in by `serviceradar-dashboard build` /
   * `serviceradar-dashboard manifest`; declarations may omit it.
   */
  sha256?: string
  /**
   * Optional renderer encoding hint surfaced to the host. Customers can
   * use this to opt into Arrow IPC frames when the frame backend supports it.
   */
  encoding?: DashboardEncoding
  [key: string]: unknown
}

export interface DashboardManifestSpec {
  schema_version?: number
  id: string
  name: string
  version: string
  description?: string
  vendor?: string
  capabilities?: string[]
  data_frames?: DashboardFrameSpec[]
  renderer?: DashboardRendererManifestSpec
  settings_schema?: Record<string, unknown>
  /**
   * Free-form metadata the host preserves but does not interpret.
   */
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface DashboardSampleSpec {
  source: string
  target?: string
}

export type DashboardSampleSource = string | DashboardSampleSpec

export interface DashboardRendererSpec {
  /**
   * Renderer entry resolved relative to the project root. Defaults to
   * `src/main.jsx`.
   */
  entry?: string
  /**
   * Output directory for renderer + manifest. Defaults to `dist`.
   */
  outDir?: string
  /**
   * Renderer artifact filename. Defaults to `renderer.js`.
   */
  artifact?: string
  minify?: boolean
  sourcemap?: boolean
}

export interface DashboardSamplesSpec {
  frames?: DashboardSampleSource
  settings?: DashboardSampleSource
}

export interface DashboardBuildContext {
  projectDir: string
  outDir: string
  env: NodeJS.ProcessEnv
  copyFile(from: string, to: string): Promise<void>
  writeJson(to: string, value: unknown): void
}

export type DashboardAfterBuildHook = (context: DashboardBuildContext) => void | Promise<void>

export interface DashboardConfig {
  /**
   * The manifest content the SDK writes to `dist/manifest.json`. The CLI
   * stamps the renderer digest on top of this object.
   */
  manifest: DashboardManifestSpec

  /**
   * Renderer build options consumed by `serviceradar-dashboard build`.
   */
  renderer?: DashboardRendererSpec

  /**
   * Sample data that ships alongside the renderer for harness use.
   */
  samples?: DashboardSamplesSpec

  /**
   * Named sample-frames fixtures the dev harness side panel can swap between.
   * The keys are display labels; the values are project-relative JSON paths.
   */
  fixtures?: Record<string, string>

  /**
   * Optional Vite overrides merged into the SDK's default Vite config.
   */
  vite?: ViteUserConfig

  /**
   * If set, replaces the default Vite-driven build with an arbitrary shell
   * command. The command runs in the project directory.
   */
  build?: {
    command?: string
    sourcemap?: boolean
    minify?: boolean
  }

  /**
   * Hook invoked after the build completes. Use it to copy extra assets,
   * emit additional sample data, or run custom validation.
   */
  afterBuild?: DashboardAfterBuildHook

  /**
   * Backwards-compatible alias for `manifest.renderer.outDir`.
   */
  outDir?: string

  /**
   * Backwards-compatible alias for `renderer.entry`.
   */
  entry?: string
}

export const DASHBOARD_CONFIG_VERSION: 1

/**
 * Identity-at-runtime helper that lets editors apply `DashboardConfig`
 * type-checking to a `dashboard.config.mjs` / `dashboard.config.js` export.
 */
export function defineDashboardConfig(config: DashboardConfig): DashboardConfig
