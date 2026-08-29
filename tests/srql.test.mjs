import assert from "node:assert/strict"
import test from "node:test"

import {buildSrqlQuery, createSrqlClient, escapeSrqlValue, srqlList} from "../src/srql.js"

test("buildSrqlQuery builds deterministic renderer-owned filter queries", () => {
  assert.equal(
    buildSrqlQuery({
      entity: "wifi_sites",
      searchField: "site_name",
      search: "Denver International",
      include: {
        site_code: ["DEN", "SITE01"],
      },
      exclude: {
        ap_family: ["2xx", "3xx"],
        region: ["AM-East"],
      },
      where: ["down_count:>0"],
      limit: 500,
    }),
    "in:wifi_sites site_name:%Denver\\ International% site_code:(DEN,IAH) !ap_family:(2xx,3xx) !region:(AM-East) down_count:>0 limit:500",
  )
})

test("escapeSrqlValue collapses whitespace for SRQL token values", () => {
  assert.equal(escapeSrqlValue("  AM   East  "), "AM\\ East")
})

test("srqlList omits empty values", () => {
  assert.equal(srqlList(["DEN", "", null, "SITE01"]), "(DEN,IAH)")
})

test("createSrqlClient wraps host srql API and frame query updates", () => {
  const calls = []
  const hostApi = {
    srql: {
      query(frameId) {
        return frameId === "devices" ? "in:wifi_devices limit:1000" : "in:wifi_sites limit:500"
      },
      update(query, frameQueries) {
        calls.push({query, frameQueries})
      },
    },
  }
  const client = createSrqlClient(hostApi)

  assert.equal(client.query(), "in:wifi_sites limit:500")
  assert.equal(client.query("devices"), "in:wifi_devices limit:1000")

  client.update("in:wifi_sites site_code:(DEN) limit:500", {
    devices: "in:wifi_devices site_code:(DEN) limit:1000",
  })

  assert.deepEqual(calls, [
    {
      query: "in:wifi_sites site_code:(DEN) limit:500",
      frameQueries: {devices: "in:wifi_devices site_code:(DEN) limit:1000"},
    },
  ])
})

test("createSrqlClient bridges distinct legacy setSrqlQuery hosts", () => {
  const calls = []
  const hostApi = {
    srql: {
      update(query, frameQueries) {
        calls.push({method: "srql.update", query, frameQueries})
      },
    },
    setSrqlQuery(query, frameQueries) {
      calls.push({method: "setSrqlQuery", query, frameQueries})
    },
  }
  const client = createSrqlClient(hostApi)

  client.update("in:wifi_sites site_code:(DEN) limit:500", {
    devices: "in:wifi_aps site_code:(DEN) limit:20000",
  })

  assert.deepEqual(calls, [
    {
      method: "srql.update",
      query: "in:wifi_sites site_code:(DEN) limit:500",
      frameQueries: {devices: "in:wifi_aps site_code:(DEN) limit:20000"},
    },
    {
      method: "setSrqlQuery",
      query: "in:wifi_sites site_code:(DEN) limit:500",
      frameQueries: {devices: "in:wifi_aps site_code:(DEN) limit:20000"},
    },
  ])
})

test("createSrqlClient does not duplicate when setSrqlQuery aliases srql.update", () => {
  const calls = []
  const update = (query, frameQueries) => calls.push({query, frameQueries})
  const client = createSrqlClient({
    srql: {update},
    setSrqlQuery: update,
  })

  client.update("in:wifi_sites limit:500")

  assert.equal(calls.length, 1)
})

test("createSrqlClient forwards page to the host without rewriting the query", () => {
  const calls = []
  const client = createSrqlClient({
    srql: {
      query: () => "in:composite_results sort:device_uid:asc limit:200",
      page(frameId, cursor) {
        calls.push({frameId, cursor})
      },
    },
  })

  client.page("results", "next-token")

  assert.deepEqual(calls, [{frameId: "results", cursor: "next-token"}])
})

test("createSrqlClient.page is a no-op when the host has not deployed paging", () => {
  const client = createSrqlClient({
    srql: {
      query: () => "in:composite_results limit:200",
      update() {
        throw new Error("update must not run")
      },
    },
  })

  client.page("results", "next-token")
})

test("createSrqlClient.page throws on a missing cursor instead of falling through to update", () => {
  const client = createSrqlClient({
    srql: {
      query: () => "in:composite_results limit:200",
      update() {
        throw new Error("update must not run")
      },
      page() {
        throw new Error("host page must not run without a cursor")
      },
    },
  })

  assert.throws(() => client.page("results", ""), /dashboard frame page requires frame id and cursor/)
  assert.throws(() => client.page("results"), /dashboard frame page requires frame id and cursor/)
  assert.throws(() => client.page("", "next-token"), /dashboard frame page requires frame id and cursor/)
})

test("buildSrqlQuery does not put a cursor into the query string", () => {
  assert.equal(
    buildSrqlQuery({
      entity: "composite_results",
      limit: 200,
      cursor: "should-not-appear",
    }),
    "in:composite_results limit:200",
  )
})
