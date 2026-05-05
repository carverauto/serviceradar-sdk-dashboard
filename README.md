# ServiceRadar Dashboard SDK

This SDK contains helpers for browser dashboard packages that target
ServiceRadar's dashboard package host interfaces.

The canonical SDK reference — including the React hook surface, composed map
patterns, and the local harness walkthrough — lives on the developer portal:
[**developer.serviceradar.cloud/docs/v2/dashboard-sdk**](https://developer.serviceradar.cloud/docs/v2/dashboard-sdk).
This README mirrors the most important examples for anyone reading the SDK
source directly.

## Install

Dashboard packages should consume the SDK from npm:

```bash
npm install @carverauto/serviceradar-dashboard-sdk react react-dom
```

This single install pulls in `@carverauto/serviceradar-cli` transitively as a dependency,
so the `serviceradar-cli` bin lands in your project's `node_modules/.bin/`
automatically. Project npm scripts can call `serviceradar-cli dashboard <subcommand>`
directly; for ad-hoc invocation use `npx serviceradar-cli ...`.

During local SDK development, customer packages may temporarily use a file
dependency, but published dashboard packages should depend on the npm package.

## CLI

The companion CLI lives in the ServiceRadar monorepo at
`~/src/serviceradar/js/cli/` and ships separately as `@carverauto/serviceradar-cli`. It
exposes two subcommand groups:

- `serviceradar-cli dashboard <init|build|dev|validate|manifest|publish|import>`
  — full dashboard authoring loop (Vite-driven build, HMR dev harness,
  scaffolder, publish to a ServiceRadar instance).
- `serviceradar-cli auth <login|status|logout>` — RFC 8628 device-code login
  with manual-token fallback. Stores credentials at
  `~/.config/serviceradar/credentials.json` (mode `0600`).

`dashboard publish` posts a multipart upload to
`/api/v1/dashboard-packages`; the bearer JWT must carry the
`dashboard.publish` scope and the user must hold the
`cli.dashboard.publish` RBAC permission. Same `id@version` re-pushes are
idempotent when the renderer SHA256 matches; pushes against an enabled
package with different bytes are rejected (409
`version_already_published`) so operator browsers never silently fetch
swapped renderer code. See the [dashboard-sdk publishing
docs](https://developer.serviceradar.cloud/docs/v2/dashboard-sdk#publishing)
for the full endpoint contract and error envelope.

The legacy `serviceradar-dashboard` bin name is preserved as a transitional
alias that prints a deprecation notice and routes to
`serviceradar-cli dashboard *`. Removal scheduled for the release after.

Canonical docs:
[`developer.serviceradar.cloud/docs/v2/dashboard-sdk`](https://developer.serviceradar.cloud/docs/v2/dashboard-sdk).

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
} from "@carverauto/serviceradar-dashboard-sdk/react"

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
      <button onClick={() => navigation.toDashboard("network-map")}>
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
`useDashboardCapability`, `useDashboardNavigation`,
`useDashboardPreferences`, `useDashboardSavedQueries`, `useDashboardPopup`, and
`useDashboardDetails` instead of reaching into raw host internals.

The build output is still a standalone `renderer.js` artifact. Customer authors
can iterate against the local harness with sample frames/settings and then ship
the same artifact through ServiceRadar package import.

The companion ServiceRadar CLI owns the repeatable package commands that create
that artifact: renderer bundling, manifest digest stamping, harness launch, and
local import validation. Customer dashboard repositories own the React dashboard
code, package identity, frame declarations, sample data, and settings schema.

React dashboards with async setup, such as Mapbox/deck.gl controllers, can opt
into an explicit ready lifecycle. This keeps simple dashboards fast while still
letting heavier dashboards delay host completion until their controller is
mounted:

```jsx
import React from "react"
import {mountReactDashboard, useDashboardController} from "@carverauto/serviceradar-dashboard-sdk/react"

function MapDashboard() {
  const controller = useDashboardController(createMapController)

  if (controller.error) return <div role="alert">Map failed to load</div>

  return <div ref={controller.ref} />
}

export const mountDashboard = mountReactDashboard(MapDashboard, {waitForReady: true})
```

`useDashboardController` owns the common imperative-controller lifecycle for
React dashboards: it passes `(root, host, api)` into your controller factory,
destroys stale controllers on unmount, reports readiness to
`mountReactDashboard(..., {waitForReady: true})`, and exposes async startup
errors for the component to render.

## Production-Grade React Hooks

The SDK ships a layered set of hooks designed for dashboards that need to scale
to thousands of rows, decode Arrow IPC frames, drive Mapbox or deck.gl maps, and
stay memoized through every host push.

### Query state — `useDashboardQueryState`

Custom dashboards usually have local filter state (chip toggles, search text,
viewport bounds, drill selections). That state has to be turned into an SRQL
query, deduplicated against the previous one, debounced for fast typing, and
applied through the host's SRQL update API. `useDashboardQueryState` owns all
of that:

```jsx
import {useDashboardQueryState} from "@carverauto/serviceradar-dashboard-sdk/react"

const INITIAL = {region: null, ap: null, search: ""}

function FilterBar() {
  const queryState = useDashboardQueryState({
    initialState: INITIAL,
    debounceMs: 350,
    buildQuery: (state) => state.region
      ? `in:wifi_sites region:(${state.region}) limit:500`
      : "in:wifi_sites limit:500",
    buildFrameQueries: (state) => state.region
      ? {aps: `in:wifi_aps region:(${state.region}) limit:500`}
      : {},
  })

  return (
    <>
      <input
        value={queryState.state.search}
        onChange={(event) => queryState.apply({search: event.target.value})}
      />
      {["AMERICAS", "EMEA", "APAC"].map((region) => (
        <button key={region} onClick={() => queryState.apply({region})}>
          {region}
        </button>
      ))}
      <button onClick={() => queryState.reset()}>Reset</button>
      {queryState.dirty ? <span>updating…</span> : null}
    </>
  )
}
```

The hook returns `{state, query, frameQueries, dirty, apply, reset, flush, hydrate}`.
Identical apply/reset calls are deduped by query+frame-overrides fingerprint —
`useDashboardQueryState` only invokes `api.srql.update` when the fingerprint
actually changes. The framework-agnostic core is exposed as
`createDashboardQueryState` at `@carverauto/serviceradar-dashboard-sdk/query-state` for
non-React consumers.

### Frame data — `useFrameRows`, `useArrowTable`, `useDashboardFrame`

`useDashboardFrame` and `useDashboardFrames` now bail out when the incoming
frame digest matches the cached one, so identical host pushes do not invalidate
downstream `useMemo` deps. `useFrameRows` decodes a frame to a row array with
optional Arrow IPC handling and optional row-shape projection — both are cached
by the SDK so repeated calls with the same shape on the same frame return the
same reference:

```jsx
import {useFrameRows} from "@carverauto/serviceradar-dashboard-sdk/react"

const SITE_SHAPE = Object.freeze({
  site_code: (row) => String(row.site_code || row.iata || "").toUpperCase(),
  region: "region",
  latitude: (row) => Number(row.latitude ?? row.lat),
  longitude: (row) => Number(row.longitude ?? row.lon),
})

function SitesTable() {
  const sites = useFrameRows("sites", {decode: "auto", shape: SITE_SHAPE})
  return <span>{sites.length} sites</span>
}
```

`decode` accepts `"auto"` (default — Arrow IPC if the frame carries it,
otherwise JSON), `"arrow"`, or `"json"`. Apache Arrow is dynamically imported
only when an Arrow path actually decodes — JSON-only dashboards do not pay the
bundle cost. For column-oriented advanced consumers there's also
`useArrowTable(frame)` which returns the decoded `apache-arrow` `Table` once
the lazy decoder loads. Tests can inject a custom decoder via
`setArrowDecoder(fn)` from `@carverauto/serviceradar-dashboard-sdk/arrow`.

### Indexed local filtering — `useIndexedRows`, `useFilterState`

Responsive dashboards can avoid repeated linear scans by precomputing per-row
Sets and a single lowercase haystack at data load. `useIndexedRows` provides
that primitive:

```jsx
import {useFilterState, useIndexedRows} from "@carverauto/serviceradar-dashboard-sdk/react"

const INDEX_BY = {
  region: "region",
  apFamily: (site) => site.ap_families,
  wlcModel: (site) => Object.keys(site.wlc_models || {}),
}

function SiteList({sites}) {
  const filters = useFilterState({
    initialState: {regions: [], apFamilies: [], wlcModels: [], search: ""},
    debounceMs: 350,
    debounceFields: ["search"],
  })

  const indexed = useIndexedRows(sites, {indexBy: INDEX_BY, searchText: ["site_code", "name"]})

  const visible = indexed.applyFilters({
    region: filters.state.regions,
    apFamily: filters.state.apFamilies,
    wlcModel: filters.state.wlcModels,
    search: filters.debouncedState.search,
  })

  return (
    <ul>
      {visible.map((site) => <li key={site.site_code}>{site.site_code}</li>)}
    </ul>
  )
}
```

`indexed.applyFilters` returns the rows array via Set intersection rather than
linear scans. Indexes rebuild only when the input row reference changes —
combined with the digest-stable refs from `useFrameRows`, that means a no-op
host push doesn't rebuild any indexes. `useFilterState` returns stable
`setFilter` / `toggle` / `clear` callbacks for chip groups and supports a
debounced `debouncedState` view per field for SRQL-roundtrip drivers.

`useFilterState` and `useDashboardQueryState` compose: feed
`filters.debouncedState` into `queryState.apply` to drive the SRQL roundtrip,
while `filters.state` drives the immediate sidebar response.

### Map runtime — `useMapboxMap`, `useDeckMap`, `useDeckLayers`

Mapbox GL JS is injected by the host through `api.libraries`. Use
`useMapboxMap` for dashboards that only need the map lifecycle, DOM markers, or
Mapbox sources/layers and do not need deck.gl/luma:

```jsx
import {useMapboxMap} from "@carverauto/serviceradar-dashboard-sdk/map"

function MapStage() {
  const handle = useMapboxMap({
    initialViewState: {center: [-98.5, 39.8], zoom: 3.7},
    viewportThrottleMs: 120,
    onViewStateChange: (next) => console.log(next.zoom),
  })

  return <div ref={handle.containerRef} className="map-stage" />
}
```

For GPU-backed layers, `MapboxOverlay` and deck.gl layer constructors are also
injected by the host. `useDeckMap` composes `useMapboxMap`, instantiates the
overlay once, and `useDeckLayers` owns deck layer memoization:

```jsx
import {useDeckMap, useDeckLayers, scatter, text} from "@carverauto/serviceradar-dashboard-sdk/map"

function MapStage({sites, dark}) {
  const handle = useDeckMap({
    initialViewState: {center: [-98.5, 39.8], zoom: 3.7},
    viewportThrottleMs: 120,
    onViewStateChange: (next) => console.log(next.zoom),
  })

  const accessors = useMemo(() => ({
    getPosition: (site) => [site.longitude, site.latitude],
    getRadius: 8,
  }), [])

  const visualProps = useMemo(() => ({
    pickable: true,
    radiusUnits: "pixels",
    getFillColor: dark ? [17, 24, 39, 238] : [255, 255, 255, 248],
    getLineColor: [31, 34, 207, 255],
  }), [dark])

  useDeckLayers(handle, {
    sites: scatter("sites", {data: sites, accessors, visualProps, events: {onClick: console.log}}),
    labels: text("labels", {
      data: sites,
      accessors: useMemo(() => ({
        getPosition: (site) => [site.longitude, site.latitude],
        getText: (site) => site.site_code,
      }), []),
      visualProps: useMemo(() => ({getSize: 13, background: true}), []),
    }),
  })

  return <div ref={handle.containerRef} className="map-stage" />
}
```

The memoization contract is the load-bearing perf lever: as long as `data`,
`accessors`, and `visualProps` references are stable, `useDeckLayers` reuses
the underlying deck.gl layer instance and the GPU buffers do not rebuild.
Inline `accessors={{getPosition: (s) => [...]}}` allocates new functions every
render and forces deck.gl to rebuild — wrap them in `useMemo` with deps that
reflect what actually drives rendering.

`handle` exposes `{containerRef, ready, viewState, map, overlay, flyTo}`. Use
`flyTo({center, zoom})` for sidebar-driven map navigation.

Available factory helpers: `scatter`, `text`, `icon`, `line`. They're thin
wrappers that stamp the right `kind` so the spec is more readable; you can
also write specs by hand.

### React-mounted Mapbox popups — `useMapPopup`

Mapbox popups are imperative — `new mapboxgl.Popup().setHTML(...)`. To render
React content inside them with managed lifecycle, use `useMapPopup`:

```jsx
import {useMapPopup} from "@carverauto/serviceradar-dashboard-sdk/popup"

function MapWithPopup({handle, focusedSite, onClose}) {
  const popup = useMapPopup(handle.map, {
    closeOnClick: false,
    offset: 18,
    onClose,
  })

  useEffect(() => {
    if (!focusedSite) {
      popup.close()
      return
    }
    popup.open({
      coordinates: [focusedSite.longitude, focusedSite.latitude],
      content: <SitePopup site={focusedSite} />,
    })
  }, [focusedSite, popup])

  return null
}
```

The popup is created lazily on first `open`. Subsequent `open` calls re-render
the React subtree inside the existing popup — they don't recreate it or
re-anchor it unless coordinates change. `close` (or the user dismissing the
popup) unmounts the React root before removing the popup from the map, so no
React roots leak.

### A composed example

Here is the production pattern in roughly 80 lines — frame ingest, filter
state, SRQL roundtrip, indexed local filtering, map, and popup all working
together:

```jsx
import React, {useCallback, useMemo, useState} from "react"
import {
  mountReactDashboard,
  useDashboardQueryState,
  useDashboardTheme,
  useFilterState,
  useFrameRows,
  useIndexedRows,
} from "@carverauto/serviceradar-dashboard-sdk/react"
import {scatter, useDeckLayers, useDeckMap} from "@carverauto/serviceradar-dashboard-sdk/map"
import {useMapPopup} from "@carverauto/serviceradar-dashboard-sdk/popup"

const SITE_SHAPE = Object.freeze({
  site_code: (row) => String(row.site_code || row.iata).toUpperCase(),
  region: "region",
  latitude: (row) => Number(row.latitude ?? row.lat),
  longitude: (row) => Number(row.longitude ?? row.lon),
  ap_count: (row) => Number(row.ap_count || 0),
})

const INDEX_BY = {region: "region"}
const INITIAL = {regions: [], search: ""}

function NetworkMap() {
  const sites = useFrameRows("sites", {decode: "auto", shape: SITE_SHAPE})
  const dark = useDashboardTheme() === "dark"

  const filters = useFilterState({initialState: INITIAL, debounceMs: 350, debounceFields: ["search"]})
  const indexed = useIndexedRows(sites, {indexBy: INDEX_BY, searchText: ["site_code"]})

  const queryState = useDashboardQueryState({
    initialState: INITIAL,
    debounceMs: 350,
    buildQuery: (state) => state.regions.length
      ? `in:wifi_sites region:(${state.regions.join(",")}) limit:500`
      : "in:wifi_sites limit:500",
  })

  // Drive the SRQL roundtrip from debounced filter state
  React.useEffect(() => {
    queryState.apply(filters.debouncedState)
  }, [filters.debouncedState, queryState])

  const visible = useMemo(() => indexed.applyFilters({
    region: filters.state.regions,
    search: filters.debouncedState.search,
  }), [indexed, filters.state.regions, filters.debouncedState.search])

  const handle = useDeckMap({initialViewState: {center: [-98.5, 39.8], zoom: 3.7}})

  const accessors = useMemo(() => ({getPosition: (s) => [s.longitude, s.latitude], getRadius: 8}), [])
  const visualProps = useMemo(() => ({
    pickable: true,
    radiusUnits: "pixels",
    getFillColor: dark ? [17, 24, 39, 238] : [255, 255, 255, 248],
  }), [dark])

  const [focused, setFocused] = useState(null)

  useDeckLayers(handle, {
    sites: scatter("sites", {
      data: visible,
      accessors,
      visualProps,
      events: {onClick: (info) => setFocused(info?.object || null)},
    }),
  })

  const popup = useMapPopup(handle.map, {closeOnClick: false, onClose: () => setFocused(null)})

  React.useEffect(() => {
    if (!focused) { popup.close(); return }
    popup.open({
      coordinates: [focused.longitude, focused.latitude],
      content: <div><strong>{focused.site_code}</strong> · {focused.ap_count} APs</div>,
    })
  }, [focused, popup])

  return <div ref={handle.containerRef} style={{position: "absolute", inset: 0}} />
}

export const mountDashboard = mountReactDashboard(NetworkMap)
```

This is the pattern — frame data flows through shape projections,
`useFilterState` owns the local UI response, `useDashboardQueryState` owns the
SRQL roundtrip, `useIndexedRows` owns the per-keystroke filter pass,
`useDeckMap` + `useDeckLayers` own the map lifecycle and layer memoization, and
`useMapPopup` owns the React-into-Mapbox popup bridge. Each layer is
independently testable; the framework-agnostic cores
(`createDashboardQueryState`, `createIndexedRows`, `createReactMapPopupController`)
are exposed at `/query-state`, `/filtering`, and `/popup` for non-React
consumers.

## Lower-Level Surfaces

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
The SDK root also exports small frame helpers for packages that need to branch
between row JSON and raw Arrow IPC bytes without reaching into host internals:

```js
import {frameRows, isArrowFrame, requireArrowFrameBytes} from "@carverauto/serviceradar-dashboard-sdk/frames"

const frame = api.frame("sites")
const rows = frameRows(frame)

if (isArrowFrame(frame)) {
  const bytes = requireArrowFrameBytes(frame)
  // Hand bytes to an Arrow decoder or renderer-specific table pipeline.
}
```

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

Host actions that affect ServiceRadar-owned state or shell UI stay behind
capability checks. React packages should use the SDK hooks rather than direct
DOM or URL manipulation:

```js
const preferences = useDashboardPreferences()
const savedQueries = useDashboardSavedQueries()
const popup = useDashboardPopup()
const details = useDashboardDetails()

preferences.set("density", "compact")
savedQueries.apply("in:wifi_sites site_code:(DEN) limit:500")
popup.open({title: "DEN", fields: [{label: "APs", value: 42}]}, {x: 24, y: 36})
details.open({type: "site", site_code: "DEN"})
```

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

The companion CLI also provides the local dashboard development harness:

```bash
npm run dev
```

The harness imports the renderer module, passes sample frames/settings, and
provides `api.libraries` using browser module imports for Mapbox and deck.gl.
This is intended for customer authors to iterate on layout, filters, popups,
clustering, and map interaction without standing up a ServiceRadar development
environment. The React/Vite build emits a standalone
`dashboard-browser-module-v1` `renderer.js`, computes the SHA256 digest, and
writes `dist/manifest.json`, `dist/sample-frames.json`, and
`dist/sample-settings.json`.

Customer packages can wire scripts like this after installing the SDK:

```json
{
  "scripts": {
    "dev": "serviceradar-cli dashboard dev",
    "build": "serviceradar-cli dashboard build",
    "validate": "serviceradar-cli dashboard validate",
    "manifest": "serviceradar-cli dashboard manifest",
    "publish": "serviceradar-cli dashboard publish",
    "import:local": "serviceradar-cli dashboard import"
  }
}
```

The CLI reads `dashboard.config.mjs`, `dashboard.config.js`,
`dashboard.config.json`, or `package.json#serviceradarDashboard`. `build`
bundles a browser-module renderer with SDK Vite defaults, computes the renderer
SHA256, writes `dist/manifest.json`, and copies configured sample frames and
settings. `dev` builds and serves the SDK harness. `import` verifies the
manifest/artifact digest and can delegate to a local ServiceRadar import command
through `SERVICERADAR_DASHBOARD_IMPORT_COMMAND`.

Example for a browser-module package:

```text
http://localhost:4177/?manifest=/dashboard/dist/manifest.json&wasm=/dashboard/dist/renderer.js&frames=/dashboard/dist/sample-frames.json&settings=/dashboard/dist/sample-settings.json
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

## npm Release

The package is published as `@carverauto/serviceradar-dashboard-sdk`. Pull requests and
pushes run `npm run ci`, which executes JavaScript tests, Go tests, and
`npm pack --dry-run`.

Release publishing is handled by GitHub Actions in the mirrored repository via
`.github/workflows/npm-publish.yml`. The workflow uses npm trusted publishing
with GitHub OIDC, so it does not require `NPM_TOKEN`.

1. Update `package.json` to the target semver.
2. Tag the SDK repo as `v<package.json version>`, for example `v0.1.0`.
3. Push the tag to Forgejo and let the GitHub mirror receive the same tag.
4. Ensure npmjs.com has a trusted publisher configured for the GitHub mirror
   repository and workflow file `.github/workflows/npm-publish.yml`.
5. Let the tag-triggered GitHub workflow publish, or run the workflow manually
   with the same tag.

The workflow refuses to publish if the tag does not match the package version.
