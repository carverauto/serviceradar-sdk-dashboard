import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import {renderToStaticMarkup} from "react-dom/server"

import {
  CAMERA_STATES,
  CameraGrid,
  CameraTile,
  cameraGridColumns,
  cameraKey,
  createCameraStreamController,
  useCameraAvailable,
} from "../src/camera.js"
import {DashboardProvider} from "../src/react.js"

const camera = {camera_source_id: "cam-1", stream_profile_id: "main", label: "Gate 4"}

function fakeCameraApi({openError} = {}) {
  const handles = []
  return {
    handles,
    maxSessions: 9,
    allowed: () => !openError,
    open(request) {
      if (openError) {
        const error = new Error(openError)
        error.code = openError
        throw error
      }

      const listeners = new Set()
      const handle = {
        request,
        attached: [],
        closed: false,
        relaySessionId: "relay-1",
        emit(event) {
          for (const listener of listeners) listener(event)
        },
        attach(element) {
          this.attached.push(element)
          return this
        },
        onState(listener) {
          listeners.add(listener)
          listener({state: "requesting"})
          return () => listeners.delete(listener)
        },
        close() {
          this.closed = true
        },
      }
      handles.push(handle)
      return handle
    },
  }
}

test("controller opens a host handle, attaches it and follows host states", () => {
  const cameraApi = fakeCameraApi()
  const snapshots = []
  const controller = createCameraStreamController({
    api: {camera: cameraApi},
    camera,
    onChange: (snapshot) => snapshots.push(snapshot),
  })

  const element = {id: "tile"}
  controller.attach(element)
  controller.open()

  const [handle] = cameraApi.handles
  assert.deepEqual(handle.request, {camera_source_id: "cam-1", stream_profile_id: "main", label: "Gate 4"})
  assert.deepEqual(handle.attached, [element])

  handle.emit({state: "playing", relay_session_id: "relay-1"})
  assert.equal(controller.snapshot.state, CAMERA_STATES.PLAYING)
  assert.equal(controller.snapshot.relaySessionId, "relay-1")
  assert.deepEqual(snapshots.map((snapshot) => snapshot.state), ["requesting", "playing"])

  controller.close()
  assert.equal(handle.closed, true)
  assert.equal(controller.snapshot.state, CAMERA_STATES.CLOSED)
  assert.equal(snapshots.at(-1).state, CAMERA_STATES.CLOSED)
  assert.deepEqual(snapshots.map((snapshot) => snapshot.state), ["requesting", "playing", "closed"])
})

test("controller attaches a late element to an open handle", () => {
  const cameraApi = fakeCameraApi()
  const controller = createCameraStreamController({api: {camera: cameraApi}, camera})

  controller.open()
  controller.attach({id: "late"})

  assert.deepEqual(cameraApi.handles[0].attached, [{id: "late"}])
})

test("controller maps host errors to tile states", () => {
  for (const [code, state] of [
    ["permission_denied", CAMERA_STATES.UNAUTHORIZED],
    ["session_limit", CAMERA_STATES.LIMITED],
    ["capability_denied", CAMERA_STATES.UNAVAILABLE],
    ["something_else", CAMERA_STATES.FAILED],
  ]) {
    const controller = createCameraStreamController({api: {camera: fakeCameraApi({openError: code})}, camera})
    controller.open()
    assert.equal(controller.snapshot.state, state, code)
    assert.equal(controller.snapshot.error.code, code)
  }
})

test("controller reports an unavailable host without a camera API", () => {
  const controller = createCameraStreamController({api: {}, camera})
  controller.open()

  assert.equal(controller.snapshot.state, CAMERA_STATES.UNAVAILABLE)
})

test("grid lays out a near-square grid capped at nine tiles", () => {
  assert.equal(cameraGridColumns(1), 1)
  assert.equal(cameraGridColumns(4), 2)
  assert.equal(cameraGridColumns(5), 3)
  assert.equal(cameraGridColumns(9), 3)

  const cameras = Array.from({length: 12}, (_, index) => ({camera_source_id: `cam-${index}`, stream_profile_id: "main"}))
  const markup = renderToStaticMarkup(
    React.createElement(
      DashboardProvider,
      {host: {}, api: {camera: fakeCameraApi()}},
      React.createElement(CameraGrid, {cameras, maxTiles: 20, selectedKey: cameraKey(cameras[1])})
    )
  )

  assert.match(markup, /data-camera-grid-count="9"/)
  assert.equal((markup.match(/data-camera-source-id=/g) || []).length, 9)
  assert.match(markup, /repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(markup, /outline:2px solid/)
})

test("tile renders its label and status before the stream plays", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      DashboardProvider,
      {host: {}, api: {camera: fakeCameraApi()}},
      React.createElement(CameraTile, {camera}, (stream) => React.createElement("span", null, `hud:${stream.state}`))
    )
  )

  assert.match(markup, /data-camera-state="idle"/)
  assert.match(markup, /Gate 4/)
  assert.match(markup, /Camera idle/)
  assert.match(markup, /hud:idle/)
})

test("useCameraAvailable follows the host's allowed() answer", () => {
  function Probe() {
    return React.createElement("span", null, String(useCameraAvailable()))
  }

  const render = (api) => renderToStaticMarkup(React.createElement(DashboardProvider, {host: {}, api}, React.createElement(Probe)))

  assert.equal(render({camera: fakeCameraApi()}), "<span>true</span>")
  assert.equal(render({camera: fakeCameraApi({openError: "permission_denied"})}), "<span>false</span>")
  assert.equal(render({}), "<span>false</span>")
})
