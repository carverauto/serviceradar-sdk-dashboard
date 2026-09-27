import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import {renderToStaticMarkup} from "react-dom/server"

import {DashboardProvider} from "../src/react.js"
import {bitmap, createPlanView, fitPlanBounds, path, polygon, usePlanView} from "../src/map.js"

function fakeLibraries() {
  const decks = []

  class FakeDeck {
    constructor(props) {
      this.props = props
      this.finalized = false
      decks.push(this)
    }
    setProps(next) {
      this.props = {...this.props, ...next}
    }
    getViewports() {
      return [{project: ([x, y]) => [x * 2, y * 2]}]
    }
    finalize() {
      this.finalized = true
    }
  }

  class FakeOrthographicView {
    constructor(opts) {
      this.opts = opts
    }
  }

  return {libraries: {Deck: FakeDeck, OrthographicView: FakeOrthographicView}, decks}
}

const container = {clientWidth: 400, clientHeight: 200}

test("fitPlanBounds centres the bounds and zooms to the tighter axis", () => {
  const view = fitPlanBounds([[0, 0], [100, 100]], {width: 400, height: 200, padding: 0})
  assert.deepEqual(view.target, [50, 50, 0])
  // 200 px / 100 units on the tighter (vertical) axis => scale 2 => zoom 1.
  assert.equal(view.zoom, 1)
})

test("createPlanView builds an orthographic deck with a themed background and no basemap", () => {
  const {libraries, decks} = fakeLibraries()
  const plan = createPlanView({libraries, container, theme: "dark", options: {bounds: [[0, 0], [100, 100]], padding: 0}})

  assert.equal(decks.length, 1)
  const [deck] = decks
  assert.equal(deck.props.parent, container)
  assert.equal(deck.props.views.opts.flipY, true)
  assert.equal(deck.props.style.background, "#0f172a")
  assert.deepEqual(deck.props.layers, [])
  assert.deepEqual(plan.viewState, {target: [50, 50, 0], zoom: 1})

  plan.setTheme("light")
  assert.equal(deck.props.style.background, "#f8fafc")
  assert.deepEqual(plan.project([3, 4]), [6, 8])

  plan.destroy()
  assert.equal(deck.finalized, true)
})

test("createPlanView reports pan and zoom through onViewStateChange", () => {
  const {libraries, decks} = fakeLibraries()
  const seen = []
  createPlanView({libraries, container, onViewStateChange: (view) => seen.push(view)})

  decks[0].props.onViewStateChange({viewState: {target: [1, 2, 0], zoom: 3}})
  assert.deepEqual(seen, [{target: [1, 2, 0], zoom: 3}])
})

test("createPlanView names the missing host libraries", () => {
  assert.throws(
    () => createPlanView({libraries: {}, container}),
    /missing host libraries \(Deck, OrthographicView\)/,
  )
})

test("usePlanView renders its container without needing a Mapbox token", () => {
  const {libraries} = fakeLibraries()
  const api = {libraries, theme: () => "light", mapbox: () => ({enabled: false})}

  function Probe() {
    const handle = usePlanView({bounds: [[0, 0], [10, 10]]})
    return React.createElement("div", {ref: handle.containerRef, "data-ready": String(handle.ready)})
  }

  const html = renderToStaticMarkup(React.createElement(DashboardProvider, {api}, React.createElement(Probe)))
  assert.match(html, /data-ready="false"/)
})

test("polygon, path and bitmap factories stamp the right deck.gl kinds", () => {
  assert.equal(polygon("rooms", {data: []}).kind, "PolygonLayer")
  assert.equal(path("belts", {data: []}).kind, "PathLayer")
  assert.equal(bitmap("floorplan", {image: "plan.png"}).kind, "BitmapLayer")
})
