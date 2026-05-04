import assert from "node:assert/strict"
import test from "node:test"

import {createReactMapPopupController} from "../src/popup.js"

function makeFakeMapbox() {
  const popups = []

  class FakePopup {
    constructor(opts) {
      this.opts = opts
      this.added = false
      this.removed = false
      this.lngLat = null
      this.contentNode = null
      this.events = new Map()
      this.renderCalls = []
      popups.push(this)
    }
    setDOMContent(node) {
      this.contentNode = node
      return this
    }
    setLngLat(coords) {
      this.lngLat = coords
      return this
    }
    getLngLat() {
      if (!this.lngLat) return null
      const [lng, lat] = this.lngLat
      return {lng, lat}
    }
    addTo(map) {
      this.map = map
      this.added = true
      return this
    }
    on(event, handler) {
      let bucket = this.events.get(event)
      if (!bucket) {
        bucket = []
        this.events.set(event, bucket)
      }
      bucket.push(handler)
      return this
    }
    off(event, handler) {
      const bucket = this.events.get(event)
      if (!bucket) return this
      this.events.set(event, bucket.filter((entry) => entry !== handler))
      return this
    }
    fireClose() {
      const bucket = this.events.get("close") || []
      for (const handler of bucket.slice()) handler()
    }
    remove() {
      this.removed = true
      this.fireClose()
    }
  }

  return {mapboxgl: {Popup: FakePopup}, popups}
}

function makeFakeCreateRoot() {
  const roots = []

  return {
    roots,
    createRoot(container) {
      const root = {
        container,
        renders: [],
        unmounted: false,
        render(content) {
          this.renders.push(content)
        },
        unmount() {
          this.unmounted = true
        },
      }
      roots.push(root)
      return root
    },
  }
}

test("controller opens a popup, mounts a React root, and renders content", () => {
  const {mapboxgl, popups} = makeFakeMapbox()
  const {roots, createRoot} = makeFakeCreateRoot()

  const controller = createReactMapPopupController({
    map: {kind: "fake-map"},
    mapboxgl,
    createRoot,
    options: {className: "ual-site-popup"},
  })

  controller.open({coordinates: [-104, 39], content: "FIRST"})

  assert.equal(popups.length, 1)
  assert.equal(popups[0].opts.className, "ual-site-popup")
  assert.equal(popups[0].added, true)
  assert.deepEqual(popups[0].lngLat, [-104, 39])
  assert.equal(roots.length, 1)
  assert.deepEqual(roots[0].renders, ["FIRST"])
  assert.equal(controller.isOpen(), true)
})

test("subsequent open re-renders content without recreating the popup", () => {
  const {mapboxgl, popups} = makeFakeMapbox()
  const {roots, createRoot} = makeFakeCreateRoot()
  const controller = createReactMapPopupController({map: {}, mapboxgl, createRoot})

  controller.open({coordinates: [-104, 39], content: "A"})
  controller.open({coordinates: [-104, 39], content: "B"})
  controller.open({coordinates: [-104, 39], content: "C"})

  assert.equal(popups.length, 1, "popup is reused")
  assert.equal(roots.length, 1, "react root is reused")
  assert.deepEqual(roots[0].renders, ["A", "B", "C"])
})

test("subsequent open with new coordinates moves the popup but does not recreate it", () => {
  const {mapboxgl, popups} = makeFakeMapbox()
  const {createRoot} = makeFakeCreateRoot()
  const controller = createReactMapPopupController({map: {}, mapboxgl, createRoot})

  controller.open({coordinates: [-104, 39], content: "A"})
  controller.open({coordinates: [-87.9, 41.9], content: "A"})

  assert.equal(popups.length, 1)
  assert.deepEqual(popups[0].lngLat, [-87.9, 41.9])
})

test("close unmounts the React root and removes the popup", () => {
  const {mapboxgl, popups} = makeFakeMapbox()
  const {roots, createRoot} = makeFakeCreateRoot()
  const controller = createReactMapPopupController({map: {}, mapboxgl, createRoot})

  controller.open({coordinates: [-104, 39], content: "A"})
  controller.close()

  assert.equal(roots[0].unmounted, true, "react root must unmount before popup removal")
  assert.equal(popups[0].removed, true)
  assert.equal(controller.isOpen(), false)
})

test("popup native close event triggers onClose and unmounts the root", () => {
  const {mapboxgl, popups} = makeFakeMapbox()
  const {roots, createRoot} = makeFakeCreateRoot()
  const events = []

  const controller = createReactMapPopupController({
    map: {},
    mapboxgl,
    createRoot,
    options: {onClose: () => events.push("closed")},
  })

  controller.open({coordinates: [-104, 39], content: "A"})
  popups[0].fireClose()

  assert.equal(roots[0].unmounted, true)
  assert.deepEqual(events, ["closed"])
  assert.equal(controller.isOpen(), false)
})

test("reopen after close creates a fresh popup and root", () => {
  const {mapboxgl, popups} = makeFakeMapbox()
  const {roots, createRoot} = makeFakeCreateRoot()
  const controller = createReactMapPopupController({map: {}, mapboxgl, createRoot})

  controller.open({coordinates: [-104, 39], content: "A"})
  controller.close()
  controller.open({coordinates: [-87.9, 41.9], content: "B"})

  assert.equal(popups.length, 2)
  assert.equal(roots.length, 2)
  assert.deepEqual(roots[1].renders, ["B"])
  assert.deepEqual(popups[1].lngLat, [-87.9, 41.9])
})

test("missing mapboxgl.Popup is a no-op rather than throwing", () => {
  const {createRoot, roots} = makeFakeCreateRoot()
  const controller = createReactMapPopupController({map: {}, mapboxgl: {}, createRoot})

  controller.open({coordinates: [-104, 39], content: "A"})

  assert.equal(roots.length, 0)
  assert.equal(controller.isOpen(), false)
})

test("missing map is a no-op rather than throwing", () => {
  const {mapboxgl, popups} = makeFakeMapbox()
  const {createRoot} = makeFakeCreateRoot()
  const controller = createReactMapPopupController({map: null, mapboxgl, createRoot})

  controller.open({coordinates: [-104, 39], content: "A"})

  assert.equal(popups.length, 0)
})
