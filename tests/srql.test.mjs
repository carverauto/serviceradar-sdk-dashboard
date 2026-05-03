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
        site_code: ["DEN", "IAH"],
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
  assert.equal(srqlList(["DEN", "", null, "IAH"]), "(DEN,IAH)")
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
