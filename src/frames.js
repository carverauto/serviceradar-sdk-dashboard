export function frameRows(frame) {
  if (Array.isArray(frame?.results)) return frame.results
  if (Array.isArray(frame?.rows)) return frame.rows
  return []
}

export function frameDigest(frame) {
  if (!frame) return ""

  const parts = [
    String(frame.id ?? ""),
    String(frame.encoding ?? ""),
    String(frame.row_count ?? frame.rowCount ?? ""),
    String(frame.refreshed_at ?? frame.refreshedAt ?? ""),
    String(frame.generated_at ?? frame.generatedAt ?? ""),
    String(frame.status ?? ""),
    String(frame.query ?? ""),
  ]

  const payload = frame.payload
  if (payload != null) {
    if (typeof payload === "string") {
      parts.push(`s:${payload.length}`)
    } else if (typeof payload.byteLength === "number") {
      parts.push(`b:${payload.byteLength}`)
    }
  } else if (typeof frame.payload_base64 === "string") {
    parts.push(`p64:${frame.payload_base64.length}`)
  }

  return parts.join("|")
}

export function framesEqual(a, b) {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue
    if (frameDigest(a[index]) !== frameDigest(b[index])) return false
  }

  return true
}

export function isArrowFrame(frame) {
  return String(frame?.encoding || "") === "arrow_ipc"
}

export function frameBytes(frame) {
  if (!frame) return new Uint8Array()

  const payload = frame.payload
  if (payload instanceof Uint8Array) return payload
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload)

  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
  }

  if (typeof payload === "string" && frame.payload_encoding === "base64") {
    return base64ToBytes(payload)
  }

  if (typeof frame.payload_base64 === "string") {
    return base64ToBytes(frame.payload_base64)
  }

  return new Uint8Array()
}

export function requireArrowFrameBytes(frame) {
  if (!isArrowFrame(frame)) {
    throw new Error(`dashboard frame ${frame?.id || "unknown"} is ${frame?.encoding || "unencoded"}, not arrow_ipc`)
  }

  return frameBytes(frame)
}

export function looksLikeArrowIPC(payload) {
  const bytes = payload instanceof Uint8Array || payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)
    ? frameBytes({payload})
    : new Uint8Array()

  if (bytes.byteLength < 6) return false

  return asciiEquals(bytes, 0, "ARROW1") || asciiEquals(bytes, bytes.byteLength - 6, "ARROW1")
}

function base64ToBytes(payload) {
  const text = String(payload || "")

  if (typeof atob === "function") {
    const decoded = atob(text)
    const bytes = new Uint8Array(decoded.length)

    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index)
    }

    return bytes
  }

  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(text, "base64"))
  }

  throw new Error("base64 decoding is unavailable in this runtime")
}

function asciiEquals(bytes, offset, text) {
  if (offset < 0 || offset + text.length > bytes.byteLength) return false

  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false
  }

  return true
}
