import {frameBytes, isArrowFrame} from "./frames.js"

let registeredDecoder = null
let arrowModulePromise = null

export function setArrowDecoder(decoder) {
  registeredDecoder = typeof decoder === "function" ? decoder : null
  arrowModulePromise = null
}

export async function loadArrowDecoder() {
  if (registeredDecoder) return registeredDecoder
  if (!arrowModulePromise) arrowModulePromise = importApacheArrow()
  return arrowModulePromise
}

export async function decodeArrowFrame(frame) {
  if (!isArrowFrame(frame)) {
    throw new Error(`dashboard frame ${frame?.id || "unknown"} is ${frame?.encoding || "unencoded"}, not arrow_ipc`)
  }

  const bytes = frameBytes(frame)
  if (!bytes || bytes.byteLength === 0) return {table: null, rows: []}

  const decoder = await loadArrowDecoder()
  return decoder(bytes, frame)
}

async function importApacheArrow() {
  // The string-variable form keeps bundlers (Rollup/Vite/webpack) from statically
  // resolving "apache-arrow" — the package becomes a true runtime-only optional dep.
  const moduleName = "apache-arrow"
  let arrow
  try {
    arrow = await dynamicImport(moduleName)
  } catch (cause) {
    const error = new Error(
      "ServiceRadar dashboard SDK could not load apache-arrow. " +
      "Install apache-arrow as a dependency of your dashboard package, " +
      "or call setArrowDecoder() to provide a custom decoder.",
    )
    error.cause = cause
    throw error
  }

  return (bytes) => {
    const table = arrow.tableFromIPC(bytes)
    return {table, rows: arrowTableToRows(table)}
  }
}

const dynamicImport = (name) => import(/* @vite-ignore */ /* webpackIgnore: true */ name)

function arrowTableToRows(table) {
  if (!table || typeof table.numRows !== "number") return []

  const numRows = table.numRows
  const rows = new Array(numRows)
  const schema = table.schema?.fields || []
  const fieldNames = schema.map((field) => field?.name).filter(Boolean)

  for (let index = 0; index < numRows; index += 1) {
    const proxy = table.get ? table.get(index) : null
    if (!proxy) {
      rows[index] = {}
      continue
    }

    if (typeof proxy.toJSON === "function") {
      rows[index] = proxy.toJSON()
      continue
    }

    const row = {}
    for (const name of fieldNames) row[name] = proxy[name]
    rows[index] = row
  }

  return rows
}
