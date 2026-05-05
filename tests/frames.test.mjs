import assert from "node:assert/strict"
import test from "node:test"

import {frameBytes, frameDigest, frameRows, framesEqual, isArrowFrame, looksLikeArrowIPC, requireArrowFrameBytes} from "../src/frames.js"

test("frameRows returns JSON rows from either results or rows", () => {
  assert.deepEqual(frameRows({results: [{site_code: "DEN"}]}), [{site_code: "DEN"}])
  assert.deepEqual(frameRows({rows: [{site_code: "IAH"}]}), [{site_code: "IAH"}])
  assert.deepEqual(frameRows({}), [])
})

test("frameBytes reads ArrayBuffer, typed array, and base64 payloads", () => {
  assert.deepEqual(Array.from(frameBytes({payload: Uint8Array.from([1, 2, 3])})), [1, 2, 3])
  assert.deepEqual(Array.from(frameBytes({payload: Uint8Array.from([4, 5, 6]).buffer})), [4, 5, 6])
  assert.deepEqual(Array.from(frameBytes({payload: "BwgJ", payload_encoding: "base64"})), [7, 8, 9])
  assert.deepEqual(Array.from(frameBytes({payload_base64: "Cg=="})), [10])
})

test("requireArrowFrameBytes validates Arrow IPC frame encoding", () => {
  const frame = {
    id: "sites",
    encoding: "arrow_ipc",
    payload_base64: Buffer.from("ARROW1payload").toString("base64"),
  }

  assert.equal(isArrowFrame(frame), true)
  assert.equal(Buffer.from(requireArrowFrameBytes(frame)).toString(), "ARROW1payload")
  assert.throws(() => requireArrowFrameBytes({id: "sites", encoding: "json_rows", results: []}), /not arrow_ipc/)
})

test("looksLikeArrowIPC accepts Arrow IPC file magic at either end", () => {
  assert.equal(looksLikeArrowIPC(Uint8Array.from(Buffer.from("ARROW1payload"))), true)
  assert.equal(looksLikeArrowIPC(Uint8Array.from(Buffer.from("payloadARROW1"))), true)
  assert.equal(looksLikeArrowIPC(Uint8Array.from(Buffer.from("{\"results\":[]}"))), false)
})

test("frameDigest combines identity-bearing fields without scanning rows", () => {
  const a = {
    id: "sites",
    encoding: "json_rows",
    row_count: 500,
    refreshed_at: "2026-05-03T12:00:00Z",
    status: "ok",
    query: "in:wifi_sites limit:500",
    results: [{site: "DEN"}],
  }
  const b = {
    id: "sites",
    encoding: "json_rows",
    row_count: 500,
    refreshed_at: "2026-05-03T12:00:00Z",
    status: "ok",
    query: "in:wifi_sites limit:500",
    results: [{site: "ORD"}],
  }
  const c = {...a, refreshed_at: "2026-05-03T12:30:00Z"}

  assert.equal(frameDigest(a), frameDigest(b))
  assert.notEqual(frameDigest(a), frameDigest(c))
})

test("frameDigest factors in payload size for arrow frames", () => {
  const small = {id: "aps", encoding: "arrow_ipc", payload: new Uint8Array(64)}
  const large = {id: "aps", encoding: "arrow_ipc", payload: new Uint8Array(128)}

  assert.notEqual(frameDigest(small), frameDigest(large))
})

test("framesEqual treats arrays of digest-equal frames as equal", () => {
  const original = [
    {id: "sites", encoding: "json_rows", row_count: 1, refreshed_at: "t", results: [{a: 1}]},
    {id: "aps", encoding: "json_rows", row_count: 1, refreshed_at: "t", results: [{b: 2}]},
  ]
  const repushed = original.map((frame) => ({...frame, results: frame.results.map((row) => ({...row}))}))

  assert.ok(framesEqual(original, repushed))
  assert.equal(framesEqual(original, [{id: "sites"}]), false)
  assert.equal(framesEqual(original, [original[0], {...original[1], refreshed_at: "later"}]), false)
})
