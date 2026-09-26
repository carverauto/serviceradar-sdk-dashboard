import type {CSSProperties, ReactElement, ReactNode, RefCallback} from "react"

import type {DashboardApi} from "./react.js"

export const CAMERA_STREAM_VIEW_CAPABILITY: "camera.stream.view"
export const DEFAULT_MAX_CAMERA_TILES: 9

export type CameraState =
  | "idle"
  | "requesting"
  | "connecting"
  | "activating"
  | "playing"
  | "suspended"
  | "unauthorized"
  | "limited"
  | "unavailable"
  | "failed"
  | "closed"

export const CAMERA_STATES: Readonly<{
  IDLE: "idle"
  REQUESTING: "requesting"
  CONNECTING: "connecting"
  ACTIVATING: "activating"
  PLAYING: "playing"
  SUSPENDED: "suspended"
  UNAUTHORIZED: "unauthorized"
  LIMITED: "limited"
  UNAVAILABLE: "unavailable"
  FAILED: "failed"
  CLOSED: "closed"
}>

/** A camera source and stream profile, as listed by the camera-source frame. */
export interface CameraRef {
  camera_source_id: string
  stream_profile_id: string
  label?: string
  [key: string]: unknown
}

export type CameraApiErrorCode = "capability_denied" | "permission_denied" | "session_limit" | "invalid_request"

export interface CameraStateEvent {
  state: string
  reason?: string
  message?: string
  relay_session_id?: string | null
}

/** The handle `api.camera.open` returns; the host owns the relay session behind it. */
export interface DashboardCameraHandle {
  readonly camera_source_id: string
  readonly stream_profile_id: string
  readonly state: string | null
  readonly relaySessionId: string | null
  attach(element: Element): DashboardCameraHandle
  onState(listener: (event: CameraStateEvent) => void): () => void
  suspend(): void
  resume(): void
  close(): void
}

/** Host camera API, present when the package declares `camera.stream.view`. */
export interface DashboardCameraApi {
  readonly maxSessions: number
  allowed(): boolean
  open(request: {camera_source_id: string; stream_profile_id: string; label?: string}): DashboardCameraHandle
  activeCount(): number
}

export interface CameraStreamSnapshot {
  state: CameraState | string
  error: {code: CameraApiErrorCode | string; message: string} | null
  relaySessionId: string | null
}

export interface CameraStreamController {
  readonly snapshot: CameraStreamSnapshot
  attach(element: Element | null): void
  open(): void
  close(): void
}

export function createCameraStreamController(options: {
  api: DashboardApi & {camera?: DashboardCameraApi}
  camera: CameraRef
  onChange?(snapshot: CameraStreamSnapshot): void
}): CameraStreamController

export function cameraStateLabel(state: string): string
export function cameraKey(camera: CameraRef): string
export function cameraGridColumns(count: number): number

/** True when the host offers the camera API and the viewer may use it. */
export function useCameraAvailable(): boolean

export interface CameraStream extends CameraStreamSnapshot {
  /** Attach to the element the stream should render into. */
  ref: RefCallback<Element>
  close(): void
}

export function useCameraStream(camera: CameraRef | null | undefined, options?: {enabled?: boolean}): CameraStream

export interface CameraTileProps {
  camera: CameraRef
  enabled?: boolean
  className?: string
  style?: CSSProperties
  selected?: boolean
  onSelect?(camera: CameraRef): void
  onStateChange?(state: CameraState | string, stream: CameraStream): void
  children?: ReactNode | ((stream: CameraStream) => ReactNode)
}

export function CameraTile(props: CameraTileProps): ReactElement

export interface CameraGridProps {
  cameras: CameraRef[]
  columns?: number
  /** Capped at the host's session limit (nine). */
  maxTiles?: number
  gap?: string
  enabled?: boolean
  className?: string
  style?: CSSProperties
  tileStyle?: CSSProperties
  /** `cameraKey()` of the selected tile. */
  selectedKey?: string | null
  onSelect?(camera: CameraRef): void
  renderOverlay?(camera: CameraRef, stream: CameraStream): ReactNode
}

export function CameraGrid(props: CameraGridProps): ReactElement
