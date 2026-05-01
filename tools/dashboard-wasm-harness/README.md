# Dashboard WASM Harness

This is a local development harness for customer-owned ServiceRadar dashboard
packages. It loads a package manifest, renderer WASM, optional settings, and
sample SRQL frames without deploying the package into ServiceRadar.

It exercises the first browser dashboard ABI:

- Interface version: `dashboard-wasm-v1`
- Preferred entrypoint: `sr_dashboard_init_json(ptr, len)`
- Compatibility entrypoint: `sr_dashboard_render_json(ptr, len)`
- Required memory helpers: `memory`, `alloc_bytes(len)`, optional
  `free_bytes(ptr, len)`
- Render output: `serviceradar.emit_render_model(ptr, len)` or
  `env.sr_emit_render_model(ptr, len)`
- JSON data provider: `serviceradar.frame_json_len(index)` and
  `serviceradar.frame_json_write(index, ptr, len)`
- Raw data provider for Arrow IPC frames: `serviceradar.frame_bytes_len(index)`,
  `serviceradar.frame_bytes_write(index, ptr, len)`, and
  `serviceradar.frame_encoding(index)`

## Run

Serve this directory from any local static file server:

```bash
cd ~/src/serviceradar-sdk-dashboard/tools/dashboard-wasm-harness
python3 -m http.server 4177
```

Then open:

```text
http://localhost:4177/?manifest=./sample-manifest.json&wasm=./dashboard.wasm&frames=./sample-frames.json&settings=./sample-settings.json
```

`frames` should be a JSON array using the same shape web-ng passes to browser
dashboard packages:

```json
[
  {
    "id": "sites",
    "status": "ok",
    "encoding": "json_rows",
    "results": [{"name": "Example", "longitude": -97.0, "latitude": 35.0}]
  }
]
```

For topology-grade payloads, use `encoding: "arrow_ipc"` with
`payload_encoding: "base64"` and `payload` containing the Arrow IPC stream. WASM
renderers can copy those bytes through the raw data-provider imports; Go
renderers can use `srdashboard.DataFrameEncoding(index)` and
`srdashboard.DataFrameBytes(index)`.

The harness validates the manifest shape, checks the WASM SHA256 digest when the
manifest declares one, validates settings against the package schema subset used
for local development, runs the renderer, and displays the emitted render model
JSON. Full authorization, package trust policy, storage, Mapbox settings, SRQL
execution, and deck.gl rendering remain ServiceRadar web-ng responsibilities.

See `examples/network-map/` for a minimal TinyGo renderer package that emits a
`deck_map` model from sample SRQL frame rows.
