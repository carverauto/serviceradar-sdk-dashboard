#!/usr/bin/env node
import {createHash} from "node:crypto"
import {createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from "node:fs"
import {copyFile, readFile} from "node:fs/promises"
import {createServer} from "node:http"
import {extname, isAbsolute, join, relative, resolve, sep} from "node:path"
import {fileURLToPath, pathToFileURL} from "node:url"
import {spawn} from "node:child_process"

const SDK_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const HARNESS_DIR = join(SDK_ROOT, "tools", "dashboard-wasm-harness")
const DEFAULT_OUT_DIR = "dist"
const DEFAULT_RENDERER_ARTIFACT = "renderer.js"
const DEFAULT_RENDERER_ENTRY = "src/main.jsx"
const DEFAULT_HOST = "127.0.0.1"
const DEFAULT_PORT = 4177

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})

async function main() {
  const [command = "help", ...args] = process.argv.slice(2)
  const options = parseArgs(args)

  switch (command) {
    case "build":
      await buildCommand(options)
      break
    case "manifest":
      await manifestCommand(options)
      break
    case "dev":
      await devCommand(options)
      break
    case "import":
      await importCommand(options)
      break
    case "help":
    case "--help":
    case "-h":
      printHelp()
      break
    default:
      throw new Error(`unknown command: ${command}\n\nRun serviceradar-dashboard help for usage.`)
  }
}

async function buildCommand(options) {
  const projectDir = resolve(options.cwd || process.cwd())
  const config = options.configObject || await loadConfig(projectDir, options.config)

  if (config.build?.command) {
    await runCommand(config.build.command, projectDir)
  } else {
    await buildRenderer(projectDir, config, options)
  }

  await manifestCommand({...options, cwd: projectDir, configObject: config})
  await writeSamples(projectDir, config, options)
}

async function manifestCommand(options) {
  const projectDir = resolve(options.cwd || process.cwd())
  const config = options.configObject || await loadConfig(projectDir, options.config)
  const outDir = outputDir(projectDir, config, options)
  const artifact = rendererArtifact(config, options)
  const rendererPath = resolve(outDir, artifact)

  if (!existsSync(rendererPath)) {
    throw new Error(`renderer artifact does not exist: ${rendererPath}`)
  }

  const digest = await sha256File(rendererPath)
  const manifest = normalizeManifest(config, {artifact, digest})
  const manifestPath = resolve(outDir, options.manifest || "manifest.json")
  mkdirSync(outDir, {recursive: true})
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  console.log(`Wrote ${relativePath(projectDir, manifestPath)}`)
}

async function devCommand(options) {
  const projectDir = resolve(options.cwd || process.cwd())
  const config = await loadConfig(projectDir, options.config)

  if (options.build !== false) {
    await buildCommand({...options, cwd: projectDir, configObject: config})
  }

  const outDir = outputDir(projectDir, config, options)
  const artifact = rendererArtifact(config, options)
  const host = options.host || DEFAULT_HOST
  const port = Number(options.port || DEFAULT_PORT)
  const manifestUrl = `/project/${relativeUrl(projectDir, resolve(outDir, "manifest.json"))}`
  const rendererUrl = `/project/${relativeUrl(projectDir, resolve(outDir, artifact))}`
  const framesPath = resolve(outDir, sampleTarget(config.samples?.frames, "sample-frames.json"))
  const settingsPath = resolve(outDir, sampleTarget(config.samples?.settings, "sample-settings.json"))
  const framesUrl = existsSync(framesPath) ? `/project/${relativeUrl(projectDir, framesPath)}` : ""
  const settingsUrl = existsSync(settingsPath) ? `/project/${relativeUrl(projectDir, settingsPath)}` : ""
  const query = new URLSearchParams({manifest: manifestUrl, wasm: rendererUrl})
  if (framesUrl) query.set("frames", framesUrl)
  if (settingsUrl) query.set("settings", settingsUrl)

  const server = createServer((request, response) => {
    serveDevRequest({request, response, projectDir})
  })

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen)
    server.listen(port, host, resolveListen)
  })

  const url = `http://${host}:${port}/?${query.toString()}`
  console.log(`ServiceRadar dashboard harness: ${url}`)
  console.log("Press Ctrl+C to stop.")
}

async function importCommand(options) {
  const projectDir = resolve(options.cwd || process.cwd())
  const config = await loadConfig(projectDir, options.config)
  const outDir = outputDir(projectDir, config, options)
  const artifact = rendererArtifact(config, options)
  const manifestPath = resolve(outDir, options.manifest || "manifest.json")
  const rendererPath = resolve(outDir, artifact)

  if (!existsSync(manifestPath)) throw new Error(`manifest does not exist: ${manifestPath}`)
  if (!existsSync(rendererPath)) throw new Error(`renderer artifact does not exist: ${rendererPath}`)

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const digest = await sha256File(rendererPath)
  if (manifest.renderer?.sha256 !== digest) {
    throw new Error(`manifest renderer digest ${manifest.renderer?.sha256 || "<missing>"} does not match ${digest}`)
  }

  const command = options.exec || process.env.SERVICERADAR_DASHBOARD_IMPORT_COMMAND
  if (!command) {
    console.log(`Verified ${relativePath(projectDir, manifestPath)} and ${relativePath(projectDir, rendererPath)}`)
    console.log("Set SERVICERADAR_DASHBOARD_IMPORT_COMMAND or pass --exec to run a local ServiceRadar import command.")
    return
  }

  await runCommand(command, projectDir, {
    SERVICERADAR_DASHBOARD_MANIFEST: manifestPath,
    SERVICERADAR_DASHBOARD_RENDERER: rendererPath,
    SERVICERADAR_DASHBOARD_ID: manifest.id || "",
    SERVICERADAR_DASHBOARD_VERSION: manifest.version || "",
  })
}

async function buildRenderer(projectDir, config, options) {
  const {build} = await import("vite")
  const react = (await import("@vitejs/plugin-react")).default
  const outDir = outputDir(projectDir, config, options)
  const artifact = rendererArtifact(config, options)
  const entry = resolve(projectDir, config.renderer?.entry || config.entry || DEFAULT_RENDERER_ENTRY)

  if (!existsSync(entry)) throw new Error(`renderer entry does not exist: ${entry}`)

  await build({
    root: projectDir,
    configFile: false,
    plugins: [react()],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      ...(config.vite?.define || {}),
    },
    resolve: {
      alias: {
        react: join(projectDir, "node_modules/react"),
        "react-dom/client": join(projectDir, "node_modules/react-dom/client"),
        ...(config.vite?.resolve?.alias || {}),
      },
      ...(config.vite?.resolve || {}),
    },
    build: {
      outDir,
      emptyOutDir: false,
      sourcemap: Boolean(config.renderer?.sourcemap || config.build?.sourcemap),
      minify: config.renderer?.minify ?? config.build?.minify ?? false,
      lib: {
        entry,
        formats: ["es"],
        fileName: () => artifact,
      },
      rollupOptions: {
        output: {
          entryFileNames: artifact,
          chunkFileNames: basenameWithoutExt(artifact) + "-[hash].js",
          assetFileNames: basenameWithoutExt(artifact) + "-[hash][extname]",
        },
        ...(config.vite?.build?.rollupOptions || {}),
      },
      ...(config.vite?.build || {}),
    },
  })
}

async function writeSamples(projectDir, config, options) {
  const outDir = outputDir(projectDir, config, options)
  const context = {
    projectDir,
    outDir,
    env: process.env,
    copyFile: (from, to) => copyFile(resolve(projectDir, from), resolve(outDir, to)),
    writeJson: (to, value) => writeFileSync(resolve(outDir, to), `${JSON.stringify(value, null, 2)}\n`),
  }

  if (typeof config.afterBuild === "function") {
    await config.afterBuild(context)
    return
  }

  await copySample(projectDir, outDir, config.samples?.frames, "sample-frames.json")
  await copySample(projectDir, outDir, config.samples?.settings, "sample-settings.json")
}

async function copySample(projectDir, outDir, spec, defaultTarget) {
  if (!spec) return
  const source = typeof spec === "string" ? spec : spec.source
  const target = sampleTarget(spec, defaultTarget)
  if (!source || !existsSync(resolve(projectDir, source))) return
  await copyFile(resolve(projectDir, source), resolve(outDir, target))
  console.log(`Wrote ${relativePath(projectDir, resolve(outDir, target))}`)
}

function normalizeManifest(config, {artifact, digest}) {
  const source = config.manifest || config
  const manifest = cloneJson(source)
  delete manifest.outDir
  delete manifest.entry
  delete manifest.renderer?.entry
  delete manifest.renderer?.sourcemap
  delete manifest.renderer?.minify
  delete manifest.samples
  delete manifest.afterBuild
  delete manifest.build
  delete manifest.vite
  delete manifest.manifest

  manifest.schema_version ??= 1
  manifest.renderer = {
    kind: "browser_module",
    interface_version: "dashboard-browser-module-v1",
    artifact,
    trust: "trusted",
    entrypoint: "mountDashboard",
    ...(manifest.renderer || {}),
    sha256: digest,
  }
  manifest.renderer.artifact = manifest.renderer.artifact || artifact

  for (const field of ["id", "name", "version", "renderer"]) {
    if (!manifest[field]) throw new Error(`dashboard manifest is missing required field: ${field}`)
  }
  if (!manifest.renderer.artifact) throw new Error("dashboard manifest renderer.artifact is required")

  return manifest
}

async function loadConfig(projectDir, explicitPath) {
  const configPath = resolveConfigPath(projectDir, explicitPath)
  if (!configPath) {
    const packageJsonPath = resolve(projectDir, "package.json")
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"))
      if (pkg.serviceradarDashboard) return pkg.serviceradarDashboard
    }
    throw new Error("missing dashboard config; create dashboard.config.mjs or package.json#serviceradarDashboard")
  }

  if (extname(configPath) === ".json") {
    return JSON.parse(readFileSync(configPath, "utf8"))
  }

  const module = await import(pathToFileURL(configPath).href)
  return module.default || module.config || module.dashboard || {}
}

function resolveConfigPath(projectDir, explicitPath) {
  if (explicitPath) {
    const candidate = resolve(projectDir, explicitPath)
    if (!existsSync(candidate)) throw new Error(`dashboard config does not exist: ${candidate}`)
    return candidate
  }

  for (const name of ["dashboard.config.mjs", "dashboard.config.js", "dashboard.config.json"]) {
    const candidate = resolve(projectDir, name)
    if (existsSync(candidate)) return candidate
  }

  return null
}

function outputDir(projectDir, config, options) {
  return resolve(projectDir, options.outDir || config.outDir || config.renderer?.outDir || DEFAULT_OUT_DIR)
}

function rendererArtifact(config, options) {
  return options.artifact || config.renderer?.artifact || config.manifest?.renderer?.artifact || DEFAULT_RENDERER_ARTIFACT
}

function sampleTarget(spec, defaultTarget) {
  if (!spec || typeof spec === "string") return defaultTarget
  return spec.target || defaultTarget
}

async function sha256File(path) {
  const hash = createHash("sha256")
  await new Promise((resolveHash, rejectHash) => {
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", rejectHash)
      .on("end", resolveHash)
  })
  return hash.digest("hex")
}

function serveDevRequest({request, response, projectDir}) {
  const url = new URL(request.url || "/", "http://localhost")
  let filePath

  if (url.pathname === "/" || url.pathname === "/index.html") {
    filePath = join(HARNESS_DIR, "index.html")
  } else if (url.pathname === "/harness.js") {
    filePath = join(HARNESS_DIR, "harness.js")
  } else if (url.pathname.startsWith("/project/")) {
    filePath = resolve(projectDir, url.pathname.slice("/project/".length))
    if (!isPathInside(projectDir, filePath)) {
      response.writeHead(403)
      response.end("forbidden")
      return
    }
  } else {
    response.writeHead(404)
    response.end("not found")
    return
  }

  serveFile(response, filePath).catch((error) => {
    response.writeHead(error?.code === "ENOENT" ? 404 : 500)
    response.end(error?.message || "error")
  })
}

async function serveFile(response, filePath) {
  if (!statSync(filePath).isFile()) {
    response.writeHead(404)
    response.end("not found")
    return
  }
  const body = await readFile(filePath)
  response.writeHead(200, {"content-type": contentType(filePath)})
  response.end(body)
}

function contentType(path) {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8"
    case ".js": return "text/javascript; charset=utf-8"
    case ".json": return "application/json; charset=utf-8"
    case ".css": return "text/css; charset=utf-8"
    default: return "application/octet-stream"
  }
}

function isPathInside(parent, child) {
  const rel = relative(parent, child)
  return rel && !rel.startsWith("..") && !isAbsolute(rel)
}

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith("--")) continue
    const key = arg.slice(2)
    if (key === "no-build") {
      options.build = false
    } else {
      options[toCamel(key)] = args[index + 1]
      index += 1
    }
  }
  return options
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

async function runCommand(command, cwd, extraEnv = {}) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, {
      cwd,
      env: {...process.env, ...extraEnv},
      shell: true,
      stdio: "inherit",
    })
    child.on("error", rejectRun)
    child.on("exit", (code) => {
      if (code === 0) resolveRun()
      else rejectRun(new Error(`command failed with exit code ${code}: ${command}`))
    })
  })
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

function basenameWithoutExt(file) {
  return file.replace(/\.[^.]+$/, "")
}

function relativeUrl(projectDir, path) {
  return relative(projectDir, path).split(sep).join("/")
}

function relativePath(projectDir, path) {
  return relative(projectDir, path) || "."
}

function printHelp() {
  console.log(`ServiceRadar dashboard package CLI

Usage:
  serviceradar-dashboard build [--config dashboard.config.mjs] [--out-dir dist]
  serviceradar-dashboard manifest [--config dashboard.config.mjs] [--out-dir dist]
  serviceradar-dashboard dev [--config dashboard.config.mjs] [--port 4177] [--no-build]
  serviceradar-dashboard import [--config dashboard.config.mjs] [--exec "command"]

Commands:
  build     Build renderer.js with SDK Vite defaults, write manifest, and copy samples.
  manifest  Compute renderer SHA256 and write dist/manifest.json.
  dev       Serve the SDK browser harness against the current package.
  import    Verify manifest/artifact and optionally run a local import command.
`)
}
