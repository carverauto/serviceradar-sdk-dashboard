import type {RefObject} from "react"

export interface DeckMapViewState {
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

export interface UseDeckMapOptions {
  initialViewState?: Partial<DeckMapViewState>
  style?: string
  viewportThrottleMs?: number
  onViewStateChange?(next: DeckMapViewState): void
  mapOptions?: Record<string, unknown>
  interleaved?: boolean
}

export interface DeckMapHandle<Container extends Element = HTMLDivElement> {
  containerRef: RefObject<Container | null>
  ready: boolean
  viewState: DeckMapViewState
  readonly map: unknown
  readonly overlay: unknown
  flyTo(target: Partial<DeckMapViewState> & {options?: Record<string, unknown>}): void
}

export interface DeckLayerEvents {
  onClick?(info: unknown, event: unknown): void
  onHover?(info: unknown, event: unknown): void
  onDragStart?(info: unknown, event: unknown): void
  onDrag?(info: unknown, event: unknown): void
  onDragEnd?(info: unknown, event: unknown): void
  [key: string]: ((...args: unknown[]) => void) | undefined
}

export interface DeckLayerSpec<DataItem = unknown> {
  id: string
  kind: string
  data: DataItem[] | unknown
  accessors?: Record<string, unknown>
  visualProps?: Record<string, unknown>
  events?: DeckLayerEvents
}

export type DeckLayerMap = Record<string, Omit<DeckLayerSpec, "id">>

export function useDeckMap<Container extends Element = HTMLDivElement>(
  options?: UseDeckMapOptions,
): DeckMapHandle<Container>

export function useDeckLayers(
  handle: DeckMapHandle | undefined,
  spec: DeckLayerSpec[] | DeckLayerMap | null | undefined,
): unknown[]

export function scatter<DataItem = unknown>(
  id: string,
  spec: Omit<DeckLayerSpec<DataItem>, "id" | "kind">,
): DeckLayerSpec<DataItem>
export function text<DataItem = unknown>(
  id: string,
  spec: Omit<DeckLayerSpec<DataItem>, "id" | "kind">,
): DeckLayerSpec<DataItem>
export function icon<DataItem = unknown>(
  id: string,
  spec: Omit<DeckLayerSpec<DataItem>, "id" | "kind">,
): DeckLayerSpec<DataItem>
export function line<DataItem = unknown>(
  id: string,
  spec: Omit<DeckLayerSpec<DataItem>, "id" | "kind">,
): DeckLayerSpec<DataItem>
