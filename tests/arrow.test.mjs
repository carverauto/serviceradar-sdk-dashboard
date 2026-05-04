import assert from "node:assert/strict"
import test from "node:test"

import {decodeArrowFrame, setArrowDecoder} from "../src/arrow.js"

test("setArrowDecoder accepts a custom decoder used by decodeArrowFrame", async () => {
  let received = null
  setArrowDecoder((bytes, frame) => {
    received = {bytes, frameId: frame?.id}
    return {table: {numRows: 2}, rows: [{site: "DEN"}, {site: "ORD"}]}
  })

  const frame = {
    id: "sites",
    encoding: "arrow_ipc",
    payload: Uint8Array.from([0xff, 0xfe, 0xfd]),
  }

  const result = await decodeArrowFrame(frame)
  assert.deepEqual(result.rows, [{site: "DEN"}, {site: "ORD"}])
  assert.equal(received.frameId, "sites")
  assert.equal(received.bytes.byteLength, 3)

  setArrowDecoder(null)
})

test("decodeArrowFrame rejects non-arrow frames", async () => {
  setArrowDecoder(null)
  await assert.rejects(
    () => decodeArrowFrame({id: "sites", encoding: "json_rows", results: []}),
    /not arrow_ipc/,
  )
})

test("decodeArrowFrame returns empty rows for an empty payload", async () => {
  setArrowDecoder(() => {
    throw new Error("decoder should not run on empty payload")
  })

  const result = await decodeArrowFrame({id: "aps", encoding: "arrow_ipc", payload: new Uint8Array()})
  assert.deepEqual(result, {table: null, rows: []})

  setArrowDecoder(null)
})
