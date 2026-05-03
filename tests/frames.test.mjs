import assert from "node:assert/strict"
import test from "node:test"

import {frameBytes, frameRows, isArrowFrame, looksLikeArrowIPC, requireArrowFrameBytes} from "../src/frames.js"

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
