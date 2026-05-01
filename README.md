# ServiceRadar Dashboard SDK

This SDK contains helpers for browser dashboard packages that target
ServiceRadar's dashboard package host interfaces.

## Trusted Browser Modules

For fully custom dashboards, use `dashboard-browser-module-v1`. ServiceRadar
loads an approved same-origin ES module and passes it bounded SRQL frames,
settings, theme, Mapbox settings, and shared map/deck constructors. The package
owns DOM, deck.gl layers, clustering, popups, and interactions.

Trusted browser modules export:

```js
export async function mountDashboard(root, host, api) {
  return { destroy() {} }
}
```

Their manifest renderer must declare:

```json
{
  "kind": "browser_module",
  "interface_version": "dashboard-browser-module-v1",
  "artifact": "renderer.js",
  "sha256": "...",
  "trust": "trusted",
  "entrypoint": "mountDashboard"
}
```

This is an admin-approved extension model, not untrusted script execution.

Large dashboard frames can request `encoding: "arrow_ipc"` in the manifest.
When ServiceRadar can satisfy the frame as Arrow IPC, trusted modules receive a
base64 payload and can decode it through the host API:

```js
const table = await api.arrow.table("sites")
```

If the active SRQL backend cannot emit Arrow for that query, ServiceRadar falls
back to `json_rows` with the same frame id so packages can stay compatible.

WASM dashboard renderers use the same frame contract through raw data-provider
imports:

- `serviceradar.frame_encoding(index)` returns `1` for Arrow IPC frames.
- `serviceradar.frame_bytes_len(index)` returns the raw payload length.
- `serviceradar.frame_bytes_write(index, ptr, len)` copies the raw payload into
  renderer memory.

Go renderers can call `srdashboard.DataFrameEncoding(index)` and
`srdashboard.DataFrameBytes(index)`. This is the path intended for large custom
topology or map engines that want Arrow IPC instead of row JSON.

```go
if srdashboard.DataFrameEncoding(0) == srdashboard.FrameEncodingArrowIPC {
  payload := srdashboard.DataFrameBytes(0)
  if srdashboard.LooksLikeArrowIPC(payload) {
    // Hand payload to the renderer's Arrow/table pipeline.
  }
}
```

If a WASM renderer needs to recompute its render model when live frames arrive,
export one of these optional callbacks:

```go
//export sr_dashboard_frames_updated
func framesUpdated() {
  // Read fresh frame bytes and emit a new render model if needed.
}
```

`sr_dashboard_update` is accepted as a compatibility alias.

## WASM Render Models

Dashboard packages still export the stable functions required by web-ng:

- `alloc_bytes`
- `free_bytes`
- `sr_dashboard_init_json`

The SDK owns the host ABI glue. Customer renderers use
`srdashboard.EmitRenderModelJSON` to emit constrained ServiceRadar render
models; ServiceRadar owns the deck.gl, Mapbox, popup, and event wiring.

## Local Harness

The SDK repo also owns the local dashboard development harness:

```bash
cd tools/dashboard-wasm-harness/examples/network-map
./build.sh

cd ../..
python3 -m http.server 4177
```

Then open:

```text
http://localhost:4177/?manifest=./examples/network-map/dist/manifest.json&wasm=./examples/network-map/dist/dashboard.wasm&frames=./examples/network-map/dist/sample-frames.json&settings=./examples/network-map/dist/sample-settings.json
```
