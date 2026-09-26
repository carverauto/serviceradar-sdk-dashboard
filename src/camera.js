import React, {useCallback, useEffect, useMemo, useRef, useState} from "react"

import {useDashboardApi} from "./react.js"

// Camera streams for dashboards that declare the `camera.stream.view`
// capability. The host owns relay sessions, signaling and playback surfaces;
// the SDK opens one host handle per tile, attaches it to a container element
// and turns host states and errors into tile state.

export const CAMERA_STREAM_VIEW_CAPABILITY = "camera.stream.view"
export const DEFAULT_MAX_CAMERA_TILES = 9

export const CAMERA_STATES = Object.freeze({
  IDLE: "idle",
  REQUESTING: "requesting",
  CONNECTING: "connecting",
  ACTIVATING: "activating",
  PLAYING: "playing",
  SUSPENDED: "suspended",
  UNAUTHORIZED: "unauthorized",
  LIMITED: "limited",
  UNAVAILABLE: "unavailable",
  FAILED: "failed",
  CLOSED: "closed",
})

const STATE_LABELS = {
  idle: "Camera idle",
  requesting: "Opening camera...",
  connecting: "Connecting...",
  activating: "Waiting for camera relay...",
  playing: "",
  suspended: "Paused",
  unauthorized: "Not authorized to view this camera",
  limited: "Too many open cameras",
  unavailable: "Camera viewing is unavailable",
  failed: "Camera unavailable",
  closed: "Closed",
}

export function cameraStateLabel(state) {
  return STATE_LABELS[state] ?? ""
}

function errorState(error) {
  switch (error?.code) {
    case "capability_denied":
      return CAMERA_STATES.UNAVAILABLE
    case "permission_denied":
      return CAMERA_STATES.UNAUTHORIZED
    case "session_limit":
      return CAMERA_STATES.LIMITED
    default:
      return CAMERA_STATES.FAILED
  }
}

export function cameraKey(camera) {
  return `${camera?.camera_source_id || ""}:${camera?.stream_profile_id || ""}`
}

// Framework-free controller behind useCameraStream. `onChange` receives
// {state, error, relaySessionId} whenever any of them changes.
export function createCameraStreamController({api, camera, onChange = () => {}}) {
  let handle = null
  let unsubscribe = null
  let element = null
  let snapshot = {state: CAMERA_STATES.IDLE, error: null, relaySessionId: null}

  const update = (next) => {
    snapshot = {...snapshot, ...next}
    onChange(snapshot)
  }

  const open = () => {
    if (handle) return

    const cameraApi = api?.camera
    if (!cameraApi || typeof cameraApi.open !== "function") {
      update({state: CAMERA_STATES.UNAVAILABLE, error: {code: "capability_denied", message: "host has no camera API"}})
      return
    }

    try {
      handle = cameraApi.open({
        camera_source_id: camera?.camera_source_id,
        stream_profile_id: camera?.stream_profile_id,
        label: camera?.label,
      })
    } catch (error) {
      update({state: errorState(error), error: {code: error?.code || "failed", message: error?.message || String(error)}})
      return
    }

    unsubscribe = handle.onState((event) => {
      update({
        state: event?.state || CAMERA_STATES.REQUESTING,
        error: event?.message ? {code: event.reason || event.state, message: event.message} : null,
        relaySessionId: event?.relay_session_id ?? handle?.relaySessionId ?? null,
      })
    })

    if (element) handle.attach(element)
  }

  return {
    get snapshot() {
      return snapshot
    },
    attach(nextElement) {
      element = nextElement || null
      if (element && handle) handle.attach(element)
    },
    open,
    close() {
      if (unsubscribe) unsubscribe()
      unsubscribe = null
      if (handle) handle.close()
      handle = null
      element = null
      snapshot = {state: CAMERA_STATES.CLOSED, error: null, relaySessionId: null}
      onChange(snapshot)
    },
  }
}

export function useCameraAvailable() {
  const api = useDashboardApi()
  const cameraApi = api?.camera
  return Boolean(cameraApi && (typeof cameraApi.allowed !== "function" || cameraApi.allowed()))
}

export function useCameraStream(camera, options = {}) {
  const api = useDashboardApi()
  const enabled = options.enabled !== false && Boolean(camera?.camera_source_id && camera?.stream_profile_id)
  const key = cameraKey(camera)
  const [snapshot, setSnapshot] = useState({state: CAMERA_STATES.IDLE, error: null, relaySessionId: null})
  const elementRef = useRef(null)
  const controllerRef = useRef(null)

  useEffect(() => {
    if (!enabled) {
      setSnapshot({state: CAMERA_STATES.IDLE, error: null, relaySessionId: null})
      return undefined
    }

    const controller = createCameraStreamController({api, camera, onChange: setSnapshot})
    controllerRef.current = controller
    controller.attach(elementRef.current)
    controller.open()

    return () => {
      controller.close()
      if (controllerRef.current === controller) controllerRef.current = null
    }
    // The key identifies the camera; the camera object itself may be recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key, enabled])

  const ref = useCallback((element) => {
    elementRef.current = element
    controllerRef.current?.attach(element)
  }, [])

  const close = useCallback(() => controllerRef.current?.close(), [])

  return {ref, ...snapshot, close}
}

const tileStyle = {
  position: "relative",
  overflow: "hidden",
  background: "#000",
  minHeight: 0,
}

const surfaceStyle = {position: "absolute", inset: 0}

const statusStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.5rem",
  color: "#e5e5e5",
  font: "12px/1.3 system-ui, sans-serif",
  textAlign: "center",
  pointerEvents: "none",
}

const labelStyle = {
  position: "absolute",
  left: "0.5rem",
  top: "0.4rem",
  color: "#fff",
  font: "600 12px/1.2 system-ui, sans-serif",
  textShadow: "0 1px 2px rgba(0,0,0,0.8)",
  pointerEvents: "none",
}

export function CameraTile({camera, enabled = true, className, style, onStateChange, selected = false, onSelect, children}) {
  const stream = useCameraStream(camera, {enabled})

  useEffect(() => {
    onStateChange?.(stream.state, stream)
    // Report state transitions only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.state])

  const status = cameraStateLabel(stream.state)
  const outline = selected ? {outline: "2px solid #38bdf8", outlineOffset: "-2px"} : null

  return React.createElement(
    "div",
    {
      className,
      style: {...tileStyle, ...outline, ...style},
      "data-camera-state": stream.state,
      "data-camera-source-id": camera?.camera_source_id,
      onClick: onSelect ? () => onSelect(camera) : undefined,
    },
    React.createElement("div", {ref: stream.ref, style: surfaceStyle}),
    status ? React.createElement("div", {style: statusStyle}, status) : null,
    camera?.label ? React.createElement("div", {style: labelStyle}, camera.label) : null,
    typeof children === "function" ? children(stream) : children || null
  )
}

export function cameraGridColumns(count) {
  if (count <= 1) return 1
  return Math.ceil(Math.sqrt(count))
}

export function CameraGrid({
  cameras = [],
  columns,
  maxTiles,
  gap = "4px",
  enabled = true,
  className,
  style,
  tileStyle: tileStyleOverride,
  selectedKey,
  onSelect,
  renderOverlay,
}) {
  const api = useDashboardApi()
  const limit = Math.max(0, Math.min(maxTiles ?? api?.camera?.maxSessions ?? DEFAULT_MAX_CAMERA_TILES, DEFAULT_MAX_CAMERA_TILES))
  const visible = useMemo(() => cameras.slice(0, limit), [cameras, limit])
  const columnCount = columns || cameraGridColumns(visible.length)

  return React.createElement(
    "div",
    {
      className,
      style: {
        display: "grid",
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        gridAutoRows: "1fr",
        gap,
        ...style,
      },
      "data-camera-grid-count": visible.length,
    },
    visible.map((camera) =>
      React.createElement(
        CameraTile,
        {
          key: cameraKey(camera),
          camera,
          enabled,
          style: {aspectRatio: "16 / 9", ...tileStyleOverride},
          selected: selectedKey != null && selectedKey === cameraKey(camera),
          onSelect,
        },
        renderOverlay ? (stream) => renderOverlay(camera, stream) : null
      )
    )
  )
}
