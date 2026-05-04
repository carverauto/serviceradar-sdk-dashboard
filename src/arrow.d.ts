import type {DashboardFrame} from "./frames.js"

export interface DashboardArrowDecodeResult<Row = Record<string, unknown>> {
  table: unknown
  rows: Row[]
}

export type DashboardArrowDecoder<Row = Record<string, unknown>> = (
  bytes: Uint8Array,
  frame?: DashboardFrame<Row>,
) => DashboardArrowDecodeResult<Row> | Promise<DashboardArrowDecodeResult<Row>>

export function setArrowDecoder(decoder: DashboardArrowDecoder | null): void
export function loadArrowDecoder(): Promise<DashboardArrowDecoder>
export function decodeArrowFrame<Row = Record<string, unknown>>(
  frame: DashboardFrame<Row>,
): Promise<DashboardArrowDecodeResult<Row>>
