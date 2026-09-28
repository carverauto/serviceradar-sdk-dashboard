import type {RefObject} from "react"

export interface DeckMapViewState {
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

export interface UseDeckMapOptions {
  initialViewState?: Partial<DeckMapViewState>
  style?: string | Record<string, unknown>
  viewportThrottleMs?: number
  onViewStateChange?(next: DeckMapViewState): void
  mapOptions?: Record<string, unknown>
  interleaved?: boolean
}

export type UseMapboxMapOptions = Omit<UseDeckMapOptions, "interleaved">

export interface MapboxMapHandle<Container extends Element = HTMLDivElement> {
  containerRef: RefObject<Container | null>
  ready: boolean
  viewState: DeckMapViewState
  readonly map: unknown
  flyTo(target: Partial<DeckMapViewState> & {options?: Record<string, unknown>}): void
}

export interface DeckMapHandle<Container extends Element = HTMLDivElement> extends MapboxMapHandle<Container> {
  readonly overlay: unknown
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

export function useMapboxMap<Container extends Element = HTMLDivElement>(
  options?: UseMapboxMapOptions,
): MapboxMapHandle<Container>

export function useDeckMap<Container extends Element = HTMLDivElement>(
  options?: UseDeckMapOptions,
): DeckMapHandle<Container>

export function useDeckLayers(
  handle: DeckMapHandle | PlanViewHandle | undefined,
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
export function polygon<DataItem = unknown>(
  id: string,
  spec: Omit<DeckLayerSpec<DataItem>, "id" | "kind">,
): DeckLayerSpec<DataItem>
export function path<DataItem = unknown>(
  id: string,
  spec: Omit<DeckLayerSpec<DataItem>, "id" | "kind">,
): DeckLayerSpec<DataItem>
export function bitmap<DataItem = unknown>(
  id: string,
  spec: Omit<DeckLayerSpec<DataItem>, "id" | "kind">,
): DeckLayerSpec<DataItem>

/** A point in plan coordinates (for example metres or pixels of a floorplan image). */
export type PlanPoint = [number, number]
export type PlanBounds = [PlanPoint, PlanPoint]

export interface PlanViewState {
  target: [number, number, number]
  zoom: number
}

export interface PlanViewOptions {
  /** Starting view; ignored when `bounds` is given and the container has a size. */
  initialViewState?: Partial<PlanViewState>
  /** Fit these plan-coordinate bounds on first render. */
  bounds?: PlanBounds
  /** Pixels of padding when fitting bounds. Default 16. */
  padding?: number
  /** Y grows downward (image-style) unless false. Default true. */
  flipY?: boolean
  /** deck.gl controller setting; pan/zoom enabled by default. */
  controller?: boolean | Record<string, unknown>
  getTooltip?: (info: unknown) => unknown
  onClick?: (info: unknown, event: unknown) => void
}

export interface PlanViewHandle<Container extends Element = HTMLDivElement> {
  containerRef: RefObject<Container>
  ready: boolean
  viewState: PlanViewState
  /** The Deck instance; `useDeckLayers` sets its layers. */
  readonly overlay: unknown | null
  fitBounds(bounds: PlanBounds, padding?: number): PlanViewState | undefined
  /** Screen pixel position of a plan coordinate, for anchoring popups. */
  project(point: PlanPoint): [number, number] | null
}

export interface PlanViewController {
  readonly deck: unknown
  readonly viewState: PlanViewState
  setTheme(theme: "light" | "dark" | string): void
  fitBounds(bounds: PlanBounds, padding?: number): PlanViewState
  project(point: PlanPoint): [number, number] | null
  destroy(): void
}

export function fitPlanBounds(
  bounds: PlanBounds,
  size: {width: number; height: number; padding?: number},
): PlanViewState

export function createPlanView(input: {
  libraries: Record<string, unknown>
  container: Element & {clientWidth: number; clientHeight: number}
  theme?: string
  options?: PlanViewOptions
  onViewStateChange?: (viewState: PlanViewState) => void
}): PlanViewController

/** A deck.gl canvas in plain 2D coordinates, with no basemap or Mapbox token. */
export function usePlanView<Container extends Element = HTMLDivElement>(
  options?: PlanViewOptions,
): PlanViewHandle<Container>

export type ScreenLodBand = "far" | "near"

export type LngLat = [number, number]

export interface ScreenLodCluster {
  __lod: "far"
  /** Stable id: the world-pixel cell at exitZoom. */
  __lod_id: string
  __lod_count: number
  __lod_ids: unknown[]
  /** Mean position of the members. */
  __lod_position: LngLat
}

export type ScreenLodClusterRow<Extra extends object = {}> = Extra & ScreenLodCluster

export interface ScreenLodOptions<Row, Extra extends object = {}> {
  /** Anything with a numeric `zoom`: a useDeckMap viewState or a deck viewport. */
  view?: {zoom: number} | null
  getPosition(row: Row): LngLat | null | undefined
  /** Defaults to `row.id`. */
  getId?(row: Row): unknown
  /** Cell size, in world pixels at exitZoom. Defaults to 40. */
  radiusPx?: number
  /** Zoom at or above which the input rows are drawn. */
  enterZoom: number
  /** Zoom at or below which clusters are drawn. Must be less than enterZoom. */
  exitZoom: number
  /** Extra fields for a cluster record, computed from its members. */
  aggregate?(members: Row[]): Extra | null | undefined
  /** The previous result: supplies hysteresis and a stable far-band `data`. */
  previous?: ScreenLodResult<Row, Extra> | null
}

export interface UseScreenLodOptions<Row, Extra extends object = {}>
  extends Omit<ScreenLodOptions<Row, Extra>, "view" | "previous"> {
  /** `useDeckMap().viewState`. */
  viewState?: {zoom: number} | null
}

export interface ScreenLodResult<Row, Extra extends object = {}> {
  band: ScreenLodBand
  /** Cluster records in the far band, the input rows in the near band. */
  data: Row[] | ScreenLodClusterRow<Extra>[]
  /** Input rows represented by clusters (0 in the near band). */
  hidden: number
  /** Far-band rows left out of every cluster because getPosition was not finite. */
  unplaced: number
  enterZoom: number
  exitZoom: number
  isCluster(row: unknown): row is ScreenLodClusterRow<Extra>
  /** Member mean for a cluster, getPosition for a row. */
  positionOf(row: Row | ScreenLodClusterRow<Extra>): LngLat | null | undefined
}

export function isLodCluster(row: unknown): row is ScreenLodCluster

export function screenLod<Row, Extra extends object = {}>(
  rows: readonly Row[] | null | undefined,
  options: ScreenLodOptions<Row, Extra>,
): ScreenLodResult<Row, Extra>

export function useScreenLod<Row, Extra extends object = {}>(
  rows: readonly Row[] | null | undefined,
  options: UseScreenLodOptions<Row, Extra>,
): ScreenLodResult<Row, Extra>
