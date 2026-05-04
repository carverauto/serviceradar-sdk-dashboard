export function escapeSrqlValue(value) {
  return String(value ?? "").trim().replace(/\s+/g, "\\ ")
}

export function srqlList(values) {
  return `(${Array.from(values || []).map(escapeSrqlValue).filter(Boolean).join(",")})`
}

export function buildSrqlQuery(options = {}) {
  const entity = String(options.entity || "devices").trim() || "devices"
  const tokens = [`in:${entity}`]
  const search = String(options.search || "").trim()
  const searchField = String(options.searchField || "").trim()

  if (search && searchField) tokens.push(`${searchField}:%${escapeSrqlValue(search)}%`)
  appendFilters(tokens, options.include, "")
  appendFilters(tokens, options.exclude, "!")

  for (const clause of Array.from(options.where || [])) {
    const text = String(clause || "").trim()
    if (text) tokens.push(text)
  }

  const limit = Number(options.limit)
  if (Number.isInteger(limit) && limit > 0) tokens.push(`limit:${limit}`)

  return tokens.join(" ")
}

export function createSrqlClient(api) {
  const fallback = api?.srql || {}
  const query = typeof fallback.query === "function" ? fallback.query.bind(fallback) : () => ""
  const srqlUpdate = typeof fallback.update === "function" ? fallback.update.bind(fallback) : null
  const legacyUpdate = typeof api?.setSrqlQuery === "function" ? api.setSrqlQuery.bind(api) : null
  const update = (query, frameQueries = {}) => {
    if (srqlUpdate) srqlUpdate(query, frameQueries)
    if (legacyUpdate && fallback.update !== api?.setSrqlQuery) legacyUpdate(query, frameQueries)
  }

  return {
    query,
    update,
    updateQuery: update,
    setQuery: update,
    escapeValue: escapeSrqlValue,
    list: srqlList,
    build: buildSrqlQuery,
  }
}

function appendFilters(tokens, filters, prefix) {
  const keys = Object.keys(filters || {}).filter((key) => String(key || "").trim()).sort()

  for (const key of keys) {
    const values = Array.from(filters[key] || []).filter(Boolean)
    if (values.length > 0) tokens.push(`${prefix}${String(key).trim()}:${srqlList(values)}`)
  }
}
