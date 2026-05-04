import assert from "node:assert/strict"
import test from "node:test"

import {createIndexedRows} from "../src/filtering.js"

const sites = [
  {site_code: "DEN", region: "AMERICAS", ap_families: ["2xx", "3xx"], wlc_models: ["7030"]},
  {site_code: "ORD", region: "AMERICAS", ap_families: ["3xx", "5xx"], wlc_models: ["7220"]},
  {site_code: "FRA", region: "EMEA", ap_families: ["2xx"], wlc_models: ["7030"]},
  {site_code: "HND", region: "APAC", ap_families: ["5xx"], wlc_models: ["5520"]},
  {site_code: "LHR", region: "EMEA", ap_families: ["3xx"], wlc_models: ["7220", "7030"]},
]

test("indexes are built lazily and exposed for inspection", () => {
  const indexed = createIndexedRows(sites, {
    indexBy: {region: "region", ap_family: (row) => row.ap_families},
  })

  assert.equal(indexed.size, 5)
  assert.deepEqual(indexed.values("region"), ["AMERICAS", "APAC", "EMEA"])
  assert.deepEqual(Array.from(indexed.indexes.region.get("AMERICAS")), [0, 1])
  assert.deepEqual(Array.from(indexed.indexes.ap_family.get("3xx")), [0, 1, 4])
})

test("applyFilters intersects multiple indexes via Set intersection", () => {
  const indexed = createIndexedRows(sites, {
    indexBy: {
      region: "region",
      ap_family: (row) => row.ap_families,
      wlc: (row) => row.wlc_models,
    },
  })

  const result = indexed.applyFilters({
    region: ["AMERICAS"],
    ap_family: ["3xx"],
  })

  assert.deepEqual(result.map((r) => r.site_code), ["DEN", "ORD"])

  const drilled = indexed.applyFilters({
    region: ["AMERICAS"],
    wlc: ["7220"],
  })
  assert.deepEqual(drilled.map((r) => r.site_code), ["ORD"])
})

test("applyFilters returns the original array reference when no filters are active", () => {
  const indexed = createIndexedRows(sites, {indexBy: {region: "region"}})
  assert.equal(indexed.applyFilters({}), indexed.rows)
  assert.equal(indexed.applyFilters({region: []}), indexed.rows)
  assert.equal(indexed.applyFilters({region: null}), indexed.rows)
})

test("applyFilters short-circuits when an intersection becomes empty", () => {
  const indexed = createIndexedRows(sites, {
    indexBy: {region: "region", wlc: (row) => row.wlc_models},
  })

  const result = indexed.applyFilters({region: ["APAC"], wlc: ["7220"]})
  assert.deepEqual(result, [])
})

test("search uses precomputed haystack and is restricted by other filters", () => {
  const indexed = createIndexedRows(sites, {
    indexBy: {region: "region"},
    searchText: ["site_code"],
  })

  assert.deepEqual(indexed.applyFilters({search: "rd"}).map((r) => r.site_code), ["ORD"])
  assert.deepEqual(indexed.applyFilters({region: ["EMEA"], search: "fra"}).map((r) => r.site_code), ["FRA"])
})

test("search without searchText configuration returns no rows", () => {
  const indexed = createIndexedRows(sites, {indexBy: {region: "region"}})
  assert.deepEqual(indexed.applyFilters({search: "den"}), [])
})

test("counts reports cardinality of each index value", () => {
  const indexed = createIndexedRows(sites, {
    indexBy: {region: "region", ap_family: (row) => row.ap_families},
  })

  assert.deepEqual(Array.from(indexed.counts("region")), [
    ["AMERICAS", 2],
    ["EMEA", 2],
    ["APAC", 1],
  ])
  assert.equal(indexed.counts("ap_family").get("3xx"), 3)
})

test("missing or null fields do not pollute indexes or haystacks", () => {
  const data = [
    {site_code: "AAA", region: "AMERICAS", tags: null},
    {site_code: "BBB", tags: ["alpha"]},
    {site_code: "CCC", region: "EMEA", tags: undefined},
  ]
  const indexed = createIndexedRows(data, {
    indexBy: {region: "region", tags: "tags"},
    searchText: ["site_code", "region"],
  })

  assert.deepEqual(indexed.values("region"), ["AMERICAS", "EMEA"])
  assert.deepEqual(indexed.values("tags"), ["alpha"])
  assert.deepEqual(indexed.applyFilters({search: "bbb"}).map((r) => r.site_code), ["BBB"])
})
