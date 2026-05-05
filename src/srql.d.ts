export type SrqlFilterValue = string | number | boolean | null | undefined

export interface BuildSrqlQueryOptions {
  entity?: string
  search?: string
  searchField?: string
  include?: Record<string, Iterable<SrqlFilterValue>>
  exclude?: Record<string, Iterable<SrqlFilterValue>>
  where?: Iterable<string>
  limit?: number
}

export interface SrqlClient {
  query(frameId?: string): string
  update(query: string, frameQueries?: Record<string, string>): void
  updateQuery(query: string, frameQueries?: Record<string, string>): void
  setQuery(query: string, frameQueries?: Record<string, string>): void
  escapeValue(value: unknown): string
  list(values: Iterable<SrqlFilterValue>): string
  build(options?: BuildSrqlQueryOptions): string
}

export function escapeSrqlValue(value: unknown): string
export function srqlList(values: Iterable<SrqlFilterValue>): string
export function buildSrqlQuery(options?: BuildSrqlQueryOptions): string
export function createSrqlClient(api?: unknown): SrqlClient
