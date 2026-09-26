import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import {renderToStaticMarkup} from "react-dom/server"

import {isLodCluster, screenLod, useScreenLod} from "../src/map.js"

// Synthetic points on a jittered grid; the coordinates mean nothing.
function syntheticRows(count, {origin = [10, -5], spanDeg = 8} = {}) {
  const side = Math.ceil(Math.sqrt(count))
  const rows = []
  for (let i = 0; i < count; i += 1) {
    const col = i % side
    const row = Math.floor(i / side)
    rows.push({
      id: `pt-${i}`,
      lng: origin[0] + (col / side) * spanDeg + ((i * 7) % 5) * 0.01,
      lat: origin[1] + (row / side) * spanDeg + ((i * 3) % 5) * 0.01,
      weight: (i % 4) + 1,
    })
  }
  return rows
}

const BASE = Object.freeze({
  getPosition: (row) => [row.lng, row.lat],
  getId: (row) => row.id,
  radiusPx: 40,
  enterZoom: 6,
  exitZoom: 4,
})

function step(rows, zoom, previous, extra = {}) {
  return screenLod(rows, {...BASE, ...extra, view: {center: [0, 0], zoom}, previous})
}

test("screenLod switches bands with hysteresis between exitZoom and enterZoom", () => {
  const rows = syntheticRows(400)

  const far = step(rows, 3, null)
  assert.equal(far.band, "far")

  const near = step(rows, 6, far)
  assert.equal(near.band, "near", "crossing enterZoom draws rows")
  assert.equal(near.data, rows, "near band hands back the input rows")
  assert.equal(near.hidden, 0)

  const midpointDown = step(rows, 5, near)
  assert.equal(midpointDown.band, "near", "dropping to the midpoint keeps rows")

  const out = step(rows, 4, midpointDown)
  assert.equal(out.band, "far", "crossing exitZoom draws clusters")

  const midpointUp = step(rows, 5, out)
  assert.equal(midpointUp.band, "far", "rising to the midpoint keeps clusters")
})

test("screenLod keeps far-band ids and data identity while the camera pans and zooms inside the band", () => {
  const rows = syntheticRows(400)

  const first = screenLod(rows, {...BASE, view: {center: [12, -2], zoom: 3}})
  const panned = screenLod(rows, {...BASE, view: {center: [-40, 30], zoom: 3}, previous: first})
  const zoomed = screenLod(rows, {...BASE, view: {center: [14, 1], zoom: 3.8}, previous: panned})

  assert.equal(first.band, "far")
  assert.ok(first.data.length > 1 && first.data.length < rows.length, "clusters actually aggregate")
  assert.equal(panned.data, first.data)
  assert.equal(zoomed.data, first.data)

  // Identity is the world cell at exitZoom, so even a cold call under a
  // different camera names the same clusters.
  const cold = screenLod(rows, {...BASE, view: {center: [-100, 50], zoom: 2}})
  assert.notEqual(cold.data, first.data)
  assert.deepEqual(
    cold.data.map((cluster) => cluster.__lod_id),
    first.data.map((cluster) => cluster.__lod_id),
  )
})

test("screenLod reclusters when the input rows change", () => {
  const rows = syntheticRows(100)
  const first = step(rows, 3, null)
  const next = step(rows.slice(0, 50), 3, first)

  assert.notEqual(next.data, first.data)
  assert.equal(next.data.reduce((sum, cluster) => sum + cluster.__lod_count, 0), 50)
})

test("screenLod conserves every placed row across clusters", () => {
  const rows = syntheticRows(1000, {spanDeg: 20})
  const far = step(rows, 2, null)

  const total = far.data.reduce((sum, cluster) => sum + cluster.__lod_count, 0)
  assert.equal(total, rows.length)
  assert.equal(far.hidden, rows.length)
  assert.equal(far.unplaced, 0)

  const ids = far.data.flatMap((cluster) => cluster.__lod_ids)
  assert.equal(new Set(ids).size, rows.length)
  assert.deepEqual([...ids].sort(), rows.map((row) => row.id).sort())
  assert.ok(far.data.every((cluster) => cluster.__lod_ids.length === cluster.__lod_count))
})

test("screenLod reports rows without a finite position instead of dropping them silently", () => {
  const rows = [
    ...syntheticRows(20),
    {id: "no-fix", lng: null, lat: Number.NaN},
    {id: "null-fix", lng: null, lat: null},
    {id: "undefined-fix", lng: undefined, lat: undefined},
    {id: "empty-fix", lng: "", lat: ""},
    {id: "bool-fix", lng: false, lat: true},
  ]
  const far = step(rows, 3, null)

  const total = far.data.reduce((sum, cluster) => sum + cluster.__lod_count, 0)
  assert.equal(total, 20)
  assert.equal(far.unplaced, 5)
  assert.equal(total + far.unplaced, rows.length)
})

test("positionOf a cluster is its member mean, and flying there at enterZoom opens the rows", () => {
  const rows = syntheticRows(300)
  const byId = new Map(rows.map((row) => [row.id, row]))
  const far = step(rows, 3, null)

  const cluster = far.data.find((entry) => entry.__lod_count > 1)
  assert.ok(cluster, "fixture must produce a multi-member cluster")
  assert.ok(far.isCluster(cluster))

  const members = cluster.__lod_ids.map((id) => byId.get(id))
  const mean = [
    members.reduce((sum, row) => sum + row.lng, 0) / members.length,
    members.reduce((sum, row) => sum + row.lat, 0) / members.length,
  ]
  const [lng, lat] = far.positionOf(cluster)
  assert.ok(Math.abs(lng - mean[0]) < 1e-9)
  assert.ok(Math.abs(lat - mean[1]) < 1e-9)

  const plain = rows[0]
  assert.deepEqual(far.positionOf(plain), [plain.lng, plain.lat])
  assert.equal(far.isCluster(plain), false)

  const landed = screenLod(rows, {...BASE, view: {center: [lng, lat], zoom: far.enterZoom}, previous: far})
  assert.equal(landed.band, "near")
  assert.ok(landed.data.includes(members[0]), "the reopened member is pickable as its own row")
})

test("aggregate adds fields to a cluster without spreading a member or overriding reserved fields", () => {
  const rows = syntheticRows(200)
  const far = step(rows, 3, null, {
    aggregate: (members) => ({
      weight: members.reduce((sum, row) => sum + row.weight, 0),
      __lod_count: -1,
    }),
  })

  const weights = far.data.reduce((sum, cluster) => sum + cluster.weight, 0)
  assert.equal(weights, rows.reduce((sum, row) => sum + row.weight, 0))
  assert.ok(far.data.every((cluster) => cluster.__lod_count > 0))
  assert.ok(far.data.every((cluster) => !("lng" in cluster) && !("id" in cluster)))
})

test("screenLod rejects an inverted or missing hysteresis pair", () => {
  const rows = syntheticRows(4)
  assert.throws(() => screenLod(rows, {...BASE, enterZoom: 4, exitZoom: 4, view: {zoom: 3}}), /exitZoom/)
  assert.throws(() => screenLod(rows, {...BASE, enterZoom: undefined, view: {zoom: 3}}), /enterZoom/)
})

test("useScreenLod clusters useFrameRows-shaped rows from useDeckMap().viewState", () => {
  const rows = syntheticRows(400)
  const seen = []

  function Probe({viewState}) {
    const lod = useScreenLod(rows, {
      viewState,
      getPosition: (row) => [row.lng, row.lat],
      enterZoom: 6,
      exitZoom: 4,
      radiusPx: 40,
      aggregate: (members) => ({weight: members.reduce((sum, row) => sum + row.weight, 0)}),
    })
    seen.push(lod)
    return React.createElement("span", null, `${lod.band}:${lod.data.length}`)
  }

  const farHtml = renderToStaticMarkup(React.createElement(Probe, {viewState: {center: [0, 0], zoom: 3, bearing: 0, pitch: 0}}))
  const nearHtml = renderToStaticMarkup(React.createElement(Probe, {viewState: {center: [0, 0], zoom: 7, bearing: 0, pitch: 0}}))

  const [far, near] = seen
  assert.match(farHtml, /^<span>far:\d+<\/span>$/)
  assert.ok(far.data.every(isLodCluster))
  assert.equal(far.data.reduce((sum, cluster) => sum + cluster.__lod_count, 0), rows.length)
  assert.equal(far.hidden, rows.length)
  assert.deepEqual(far.positionOf(far.data[0]), far.data[0].__lod_position)

  assert.equal(nearHtml, `<span>near:${rows.length}</span>`)
  assert.equal(near.data, rows)
})
