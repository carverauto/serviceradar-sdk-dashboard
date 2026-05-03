# ServiceRadar Dashboard SDK

This SDK contains helpers for browser dashboard packages that target
ServiceRadar's dashboard package host interfaces.

## Deployment Model

Dashboard packages are not compiled into ServiceRadar web-ng. ServiceRadar
ships the stable host, importer, verifier, SRQL data-frame provider, and shared
browser libraries. Customers ship their dashboard package from their own source
repository.

The production flow is:

1. A dashboard author builds a package in an external repository.
2. The build writes a manifest plus renderer artifact, including a SHA256 digest
   and any signing metadata required by the operator.
3. A ServiceRadar admin adds that repository as a dashboard/plugin source.
4. ServiceRadar imports the manifest and artifact server-side, verifies the
   digest/trust policy, and stores the package metadata.
5. An admin enables a dashboard instance and chooses its route or dashboard
   placement.
6. At runtime web-ng loads the verified artifact and supplies SRQL data frames,
   settings, theme, navigation helpers, Mapbox settings, and shared map/deck
   libraries through the dashboard host API.

This lets customer dashboards update independently from ServiceRadar releases.
If the package renderer changes, the customer publishes a new package version
and ServiceRadar imports that version; web-ng does not need to be rebuilt.

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

## React Dashboard SDK

React is the preferred authoring path for browser-module dashboards. The SDK
exports a small React surface that mirrors the existing web-ng React hook pattern
used by the Zen rules editor: mount with `createRoot`, keep Phoenix/web-ng as
the host shell, and pass all data/theme/navigation through a bounded host API.

```jsx
import React from "react"
import {
  mountReactDashboard,
  useDashboardFrame,
  useDashboardMapbox,
  useDashboardNavigation,
  useDashboardSrql,
  useDashboardTheme,
} from "@serviceradar/dashboard-sdk/react"

function NetworkMap() {
  const sites = useDashboardFrame("sites")
  const srql = useDashboardSrql()
  const theme = useDashboardTheme()
  const mapbox = useDashboardMapbox()
  const navigation = useDashboardNavigation()

  return (
    <section data-theme={theme} data-map-style={mapbox.style_dark}>
      <button onClick={() => srql.update(srql.build({
        entity: "wifi_sites",
        include: {site_code: ["DEN"]},
        limit: 500,
      }))}>
        {sites?.results?.length || 0} sites
      </button>
      <button onClick={() => navigation.toDashboard("ual-network-map")}>
        Open map
      </button>
    </section>
  )
}

export const mountDashboard = mountReactDashboard(NetworkMap)
```

The `./react` subpath ships TypeScript declarations for the stable browser
host contract. React dashboards can use `useDashboardFrames`,
`useDashboardFrame`, `useDashboardTheme`, `useDashboardSrql`,
`useDashboardSettings`, `useDashboardMapbox`, `useDashboardLibraries`,
`useDashboardCapability`, and `useDashboardNavigation` instead of reaching into
raw host internals.

The build output is still a standalone `renderer.js` artifact. Customer authors
can iterate against the local harness with sample frames/settings and then ship
the same artifact through ServiceRadar package import.

Trusted browser modules can render deck.gl maps directly because the host passes
the map/deck constructors through `api.libraries`:

```js
export async function mountDashboard(root, host, api) {
  const {mapboxgl, MapboxOverlay, ScatterplotLayer, TextLayer} = api.libraries

  const map = new mapboxgl.Map({
    container: root,
    style: "mapbox://styles/mapbox/dark-v11",
    center: [-98, 39],
    zoom: 3,
  })

  const overlay = new MapboxOverlay({
    interleaved: true,
    layers: [
      new ScatterplotLayer({
        id: "sites",
        data: api.frame("sites").results,
        getPosition: (row) => [row.longitude, row.latitude],
        getRadius: 8,
      }),
      new TextLayer({
        id: "site-labels",
        data: api.frame("sites").results,
        getPosition: (row) => [row.longitude, row.latitude],
        getText: (row) => row.site_code,
      }),
    ],
  })

  map.addControl(overlay)

  return {
    destroy() {
      map.removeControl(overlay)
      map.remove()
    },
  }
}
```

`interleaved: true` lets deck.gl share the Mapbox WebGL context, which avoids
allocating a second rendering context and is the expected path for high-volume
map dashboards.

Large dashboard frames can request `encoding: "arrow_ipc"` in the manifest.
When ServiceRadar can satisfy the frame as Arrow IPC, trusted modules receive a
base64 payload and can decode it through the host API:

```js
const table = await api.arrow.table("sites")
```

If the active SRQL backend cannot emit Arrow for that query, ServiceRadar falls
back to `json_rows` with the same frame id so packages can stay compatible.

Browser modules also receive first-class SRQL helpers through `api.srql`.
Package authors should use these helpers when map/sidebar interactions need to
change the server-side query that hydrates the dashboard:

```js
const current = api.srql.query("sites")
const next = api.srql.build({
  entity: "wifi_sites",
  search: "ORD",
  searchField: "site_code",
  exclude: {
    region: ["AM-East"],
    ap_family: ["2xx", "3xx"],
  },
  where: ["down_count:>0"],
  limit: 500,
})

api.srql.update(next)
```

`api.srql.update(query, frameQueries)` asks ServiceRadar to push a LiveView
patch, rerun the approved dashboard data frames through SRQL, and remount the
renderer with fresh server-filtered rows. The optional `frameQueries` object can
override individual frame IDs when a dashboard needs detail frames to use a
different SRQL query from the primary map frame. The old `api.setSrqlQuery`
alias remains for compatibility, but new packages should prefer `api.srql`.

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

Go renderers and build tooling can use `srdashboard.BuildSRQL` for deterministic
query construction:

```go
query := srdashboard.BuildSRQL(srdashboard.SRQLQuery{
	Entity:      "wifi_sites",
	SearchField: "site_code",
	Search:      "ORD",
	Exclude: map[string][]string{
		"region":    {"AM-East"},
		"ap_family": {"2xx", "3xx"},
	},
	Where: []string{"down_count:>0"},
	Limit: 500,
})
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

For trusted browser modules, the same harness imports the renderer module,
passes sample frames/settings, and provides `api.libraries` using browser module
imports for Mapbox and deck.gl. This is intended for customer authors to iterate
on layout, filters, popups, clustering, and map interaction without standing up
a ServiceRadar development environment.

Example for a browser-module package:

```text
http://localhost:4177/?manifest=/ual-dashboard/dist/manifest.json&wasm=/ual-dashboard/dist/renderer.js&frames=/ual-dashboard/dist/sample-frames.json&settings=/ual-dashboard/dist/sample-settings.json
```

The `wasm` query parameter is currently the generic renderer artifact URL; for
browser modules it points at `renderer.js`. Mapbox settings should come from the
settings JSON passed to the harness, for example:

```json
{
  "mapbox": {
    "access_token": "pk...",
    "style_dark": "mapbox://styles/mapbox/dark-v11",
    "style_light": "mapbox://styles/mapbox/light-v11"
  }
}
```

In production, Mapbox settings come from ServiceRadar settings and are exposed
through `api.mapbox()`.

The harness is not an authorization or package-verification substitute. It is a
local rendering loop. ServiceRadar production import still verifies manifest
shape, artifact digest, trust policy, and capabilities before a dashboard can be
enabled.
