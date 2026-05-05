export type IndexSelector<Row = Record<string, unknown>> =
  | keyof Row
  | string
  | ((row: Row) => unknown)

export interface IndexedRowsOptions<Row = Record<string, unknown>> {
  indexBy?: Record<string, IndexSelector<Row>>
  searchText?: Array<keyof Row | string>
}

export interface IndexedRowsFilter {
  search?: string
  [key: string]: unknown
}

export interface IndexedRows<Row = Record<string, unknown>> {
  rows: Row[]
  size: number
  indexes: Record<string, Map<string, Set<number>>>
  applyFilters(filters?: IndexedRowsFilter): Row[]
  values(key: string): string[]
  counts(key: string): Map<string, number>
}

export function createIndexedRows<Row = Record<string, unknown>>(
  rows: Row[] | null | undefined,
  options?: IndexedRowsOptions<Row>,
): IndexedRows<Row>

export function indexedRowDigest<Row = Record<string, unknown>>(
  options?: IndexedRowsOptions<Row> | null,
): string
