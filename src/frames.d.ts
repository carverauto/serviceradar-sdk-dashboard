export type DashboardFrameEncoding = "json_rows" | "arrow_ipc" | string

export interface DashboardFrame<Row = Record<string, unknown>> {
  id?: string
  encoding?: DashboardFrameEncoding
  results?: Row[]
  rows?: Row[]
  payload?: ArrayBuffer | Uint8Array | ArrayBufferView | string
  payload_encoding?: "base64" | string
  payload_base64?: string
  [key: string]: unknown
}

export function frameRows<Row = Record<string, unknown>>(frame?: DashboardFrame<Row>): Row[]
export function isArrowFrame(frame?: DashboardFrame): boolean
export function frameBytes(frame?: DashboardFrame): Uint8Array
export function requireArrowFrameBytes(frame?: DashboardFrame): Uint8Array
export function looksLikeArrowIPC(payload: ArrayBuffer | Uint8Array | ArrayBufferView): boolean
