import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import {renderToStaticMarkup} from "react-dom/server"

import {DashboardProvider} from "../src/react.js"
import {bitmap, createPlanView, fitPlanBounds, path, polygon, usePlanView} from "../src/map.js"

function fakeLibraries({canvas = null, initialized = true} = {}) {
  const decks = []

  class FakeDeck {
    constructor(props) {
      this.props = props
      this.canvas = canvas
      this.finalized = false
      this.isInitialized = initialized
      if (canvas && props.style) Object.assign(canvas.style, props.style)
      decks.push(this)
    }
    setProps(next) {
      this.props = {...this.props, ...next}
    }
    getCanvas() {
      return this.canvas
    }
    getViewports() {
      if (!this.isInitialized) throw new Error("view manager is not ready")
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
  const canvas = {style: {}}
  const {libraries, decks} = fakeLibraries({canvas})
  const plan = createPlanView({libraries, container, theme: "dark", options: {bounds: [[0, 0], [100, 100]], padding: 0}})

  assert.equal(decks.length, 1)
  const [deck] = decks
  assert.equal(deck.props.parent, container)
  assert.equal(deck.props.views.opts.flipY, true)
  assert.equal(deck.props.style.background, "#0f172a")
  assert.equal(canvas.style.background, "#0f172a")
  assert.deepEqual(deck.props.layers, [])
  assert.deepEqual(deck.props.viewState, {target: [50, 50, 0], zoom: 1})
  assert.equal("initialViewState" in deck.props, false)
  assert.deepEqual(plan.viewState, {target: [50, 50, 0], zoom: 1})

  plan.setTheme("light")
  assert.equal(deck.props.style.background, "#f8fafc")
  assert.equal(canvas.style.background, "#f8fafc")
  assert.deepEqual(plan.project([3, 4]), [6, 8])

  plan.destroy()
  assert.equal(deck.finalized, true)
})

test("setTheme paints the container when the deck canvas is not ready", () => {
  const {libraries} = fakeLibraries()
  const host = {clientWidth: 400, clientHeight: 200, style: {background: ""}}
  const plan = createPlanView({libraries, container: host, theme: "light"})

  plan.setTheme("dark")
  assert.equal(host.style.background, "#0f172a")
  plan.destroy()
})

test("project returns null before deck finishes initialization", () => {
  const {libraries, decks} = fakeLibraries({initialized: false})
  const plan = createPlanView({libraries, container})

  assert.equal(plan.project([3, 4]), null)
  decks[0].isInitialized = true
  assert.deepEqual(plan.project([3, 4]), [6, 8])
})

test("plan click and tooltip call the callbacks currently on options", () => {
  const {libraries, decks} = fakeLibraries()
  const seen = []
  const options = {
    onClick: () => seen.push("a"),
    getTooltip: () => "a",
  }
  createPlanView({libraries, container, options})

  options.onClick = (info) => seen.push(info.object)
  options.getTooltip = () => "b"
  decks[0].props.onClick({object: "b"}, null)

  assert.deepEqual(seen, ["b"])
  assert.equal(decks[0].props.getTooltip({}), "b")
})

test("createPlanView keeps deck controlled after pan and fitBounds", () => {
  const {libraries, decks} = fakeLibraries()
  const seen = []
  const plan = createPlanView({
    libraries,
    container,
    options: {bounds: [[0, 0], [100, 100]], padding: 0},
    onViewStateChange: (view) => seen.push(view),
  })

  decks[0].props.onViewStateChange({viewState: {target: [1, 2, 0], zoom: 3}})
  assert.deepEqual(decks[0].props.viewState, {target: [1, 2, 0], zoom: 3})
  assert.deepEqual(plan.viewState, {target: [1, 2, 0], zoom: 3})

  const fitted = plan.fitBounds([[0, 0], [100, 100]], 0)
  assert.deepEqual(fitted, {target: [50, 50, 0], zoom: 1})
  assert.deepEqual(decks[0].props.viewState, {target: [50, 50, 0], zoom: 1})
  assert.deepEqual(seen, [{target: [1, 2, 0], zoom: 3}, {target: [50, 50, 0], zoom: 1}])
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
