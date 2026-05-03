import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import path from "node:path"
import {fileURLToPath} from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const distDir = path.join(rootDir, "dist")
const rendererPath = path.join(distDir, "renderer.js")
const renderer = readFileSync(rendererPath)
const sha256 = createHash("sha256").update(renderer).digest("hex")

mkdirSync(distDir, {recursive: true})
copyFileSync(path.join(rootDir, "sample-frames.json"), path.join(distDir, "sample-frames.json"))
copyFileSync(path.join(rootDir, "sample-settings.json"), path.join(distDir, "sample-settings.json"))

writeFileSync(
  path.join(distDir, "manifest.json"),
  `${JSON.stringify({
    id: "com.serviceradar.examples.react-dashboard",
    name: "React Dashboard Template",
    version: "0.1.0",
    vendor: "ServiceRadar",
    description: "Minimal React/Vite dashboard-browser-module-v1 package template.",
    renderer: {
      kind: "browser_module",
      interface_version: "dashboard-browser-module-v1",
      artifact: "renderer.js",
      sha256,
      trust: "trusted",
      exports: ["default", "mountDashboard"],
    },
    data_frames: [
      {
        id: "sites",
        query: "in:wifi_sites limit:500",
        encoding: "json_rows",
      },
    ],
    capabilities: ["srql.execute", "navigation.open"],
    settings_schema: {
      type: "object",
      additionalProperties: true,
      properties: {
        title: {type: "string"},
        mapbox: {type: "object"},
      },
    },
  }, null, 2)}\n`,
)
