export function createIndexedRows(rows, options = {}) {
  const sourceRows = Array.isArray(rows) ? rows : []
  const indexByConfig = options.indexBy && typeof options.indexBy === "object" ? options.indexBy : {}
  const searchFields = Array.isArray(options.searchText) ? options.searchText.filter(Boolean) : []

  const indexes = {}
  for (const key of Object.keys(indexByConfig)) {
    indexes[key] = buildIndex(sourceRows, indexByConfig[key])
  }

  const haystacks = searchFields.length > 0
    ? sourceRows.map((row) => buildHaystack(row, searchFields))
    : null

  function applyFilters(filters) {
    const active = filters && typeof filters === "object" ? filters : {}
    let candidate = null

    for (const key of Object.keys(active)) {
      if (key === "search") continue
      const valueSet = normalizeFilterValues(active[key])
      if (valueSet.size === 0) continue

      const index = indexes[key]
      if (!index) continue

      const union = new Set()
      for (const value of valueSet) {
        const bucket = index.get(value)
        if (bucket) for (const rowIndex of bucket) union.add(rowIndex)
      }

      candidate = candidate === null ? union : intersect(candidate, union)
      if (candidate.size === 0) return []
    }

    const search = active.search != null ? String(active.search).trim().toLowerCase() : ""
    if (search) {
      if (!haystacks) return []
      const matched = new Set()
      const iterator = candidate === null
        ? rangeIterator(sourceRows.length)
        : candidate

      for (const rowIndex of iterator) {
        const haystack = haystacks[rowIndex]
        if (haystack && haystack.includes(search)) matched.add(rowIndex)
      }
      candidate = matched
    }

    if (candidate === null) return sourceRows

    const result = new Array(candidate.size)
    let cursor = 0
    for (const rowIndex of candidate) {
      result[cursor] = sourceRows[rowIndex]
      cursor += 1
    }

    return result
  }

  function values(key) {
    const index = indexes[key]
    if (!index) return []
    return Array.from(index.keys()).sort()
  }

  function counts(key) {
    const index = indexes[key]
    if (!index) return new Map()
    const out = new Map()
    for (const [value, bucket] of index) out.set(value, bucket.size)
    return out
  }

  return {
    rows: sourceRows,
    indexes,
    applyFilters,
    values,
    counts,
    size: sourceRows.length,
  }
}

export function indexedRowDigest(options) {
  const indexBy = options?.indexBy && typeof options.indexBy === "object" ? Object.keys(options.indexBy).sort() : []
  const searchText = Array.isArray(options?.searchText) ? options.searchText.slice().sort() : []
  return JSON.stringify([indexBy, searchText])
}

function buildIndex(rows, selector) {
  const map = new Map()

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const values = extractValues(rows[rowIndex], selector)
    for (const value of values) {
      const key = String(value)
      let bucket = map.get(key)
      if (!bucket) {
        bucket = new Set()
        map.set(key, bucket)
      }
      bucket.add(rowIndex)
    }
  }

  return map
}

function extractValues(row, selector) {
  if (row == null) return []

  const raw = typeof selector === "function" ? selector(row) : row[selector]
  if (raw == null) return []

  if (Array.isArray(raw)) return raw.filter((value) => value != null)
  if (raw instanceof Set) return Array.from(raw)
  if (raw instanceof Map) return Array.from(raw.keys())

  return [raw]
}

function buildHaystack(row, fields) {
  if (!row) return ""
  const parts = new Array(fields.length)

  for (let index = 0; index < fields.length; index += 1) {
    const value = row[fields[index]]
    parts[index] = value == null ? "" : String(value)
  }

  return parts.join(" ").toLowerCase()
}

function normalizeFilterValues(value) {
  if (value == null) return new Set()
  if (value instanceof Set) return new Set(Array.from(value, String))
  if (Array.isArray(value)) return new Set(value.filter((entry) => entry != null).map(String))
  return new Set([String(value)])
}

function intersect(a, b) {
  let small = a
  let large = b
  if (small.size > large.size) {
    small = b
    large = a
  }

  const result = new Set()
  for (const value of small) {
    if (large.has(value)) result.add(value)
  }
  return result
}

function* rangeIterator(length) {
  for (let index = 0; index < length; index += 1) yield index
}
