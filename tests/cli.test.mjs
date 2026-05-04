import assert from "node:assert/strict"
import {execFile} from "node:child_process"
import {mkdtemp, readFile, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {promisify} from "node:util"
import test from "node:test"

const execFileAsync = promisify(execFile)
const cliPath = new URL("../bin/serviceradar-dashboard.js", import.meta.url)

test("manifest command writes renderer digest from dashboard config", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "sr-dashboard-cli-"))
  await writeFile(join(projectDir, "dashboard.config.json"), JSON.stringify({
    manifest: {
      id: "com.example.dashboard",
      name: "Example Dashboard",
      version: "1.2.3",
      vendor: "Example",
      renderer: {
        artifact: "renderer.js",
      },
      data_frames: [],
      capabilities: ["srql.execute"],
    },
  }))
  await execFileAsync("mkdir", ["-p", join(projectDir, "dist")])
  await writeFile(join(projectDir, "dist", "renderer.js"), "export function mountDashboard() {}\n")

  const {stdout} = await execFileAsync(process.execPath, [cliPath.pathname, "manifest"], {cwd: projectDir})
  const manifest = JSON.parse(await readFile(join(projectDir, "dist", "manifest.json"), "utf8"))

  assert.match(stdout, /Wrote dist\/manifest\.json/)
  assert.equal(manifest.id, "com.example.dashboard")
  assert.equal(manifest.renderer.kind, "browser_module")
  assert.equal(manifest.renderer.interface_version, "dashboard-browser-module-v1")
  assert.equal(manifest.renderer.entrypoint, "mountDashboard")
  assert.match(manifest.renderer.sha256, /^[a-f0-9]{64}$/)
})

test("help command documents SDK-owned package workflow", async () => {
  const {stdout} = await execFileAsync(process.execPath, [cliPath.pathname, "help"])

  assert.match(stdout, /serviceradar-dashboard build/)
  assert.match(stdout, /serviceradar-dashboard manifest/)
  assert.match(stdout, /serviceradar-dashboard dev/)
  assert.match(stdout, /serviceradar-dashboard import/)
})
