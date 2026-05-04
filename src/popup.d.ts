import type {Root} from "react-dom/client"
import type {ReactNode} from "react"

export interface MapPopupOpenRequest {
  coordinates: [number, number]
  content: ReactNode
}

export interface UseMapPopupOptions {
  closeOnClick?: boolean
  closeButton?: boolean
  offset?: number | [number, number] | Record<string, [number, number]>
  className?: string
  anchor?: "center" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right"
  maxWidth?: string
  onClose?(): void
  createRoot?(container: Element | DocumentFragment): Root
}

export interface MapPopupHandle {
  open(request: MapPopupOpenRequest): void
  close(): void
  readonly popup: unknown | null
  readonly isOpen: boolean
}

export interface CreateReactMapPopupControllerOptions {
  map: unknown
  mapboxgl: {Popup: new (options: Record<string, unknown>) => unknown}
  createRoot(container: Element | DocumentFragment): Root
  options?: UseMapPopupOptions
}

export interface ReactMapPopupController extends MapPopupHandle {}

export function createReactMapPopupController(
  args: CreateReactMapPopupControllerOptions,
): ReactMapPopupController

export function useMapPopup(map: unknown, options?: UseMapPopupOptions): MapPopupHandle
