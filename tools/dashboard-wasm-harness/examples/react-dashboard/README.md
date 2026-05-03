# React Dashboard Package Template

This example is the minimal React/Vite browser-module dashboard package. It
builds a standalone `dashboard-browser-module-v1` renderer artifact plus the
manifest and sample frame files consumed by the ServiceRadar dashboard harness
and web-ng package import UI.

## Build

```bash
cd tools/dashboard-wasm-harness/examples/react-dashboard
npm install
npm run build
```

The build writes:

- `dist/renderer.js`
- `dist/manifest.json`
- `dist/sample-frames.json`
- `dist/sample-settings.json`

## Harness

Serve the harness directory:

```bash
cd ../..
python3 -m http.server 4177
```

Open:

```text
http://localhost:4177/?manifest=./examples/react-dashboard/dist/manifest.json&wasm=./examples/react-dashboard/dist/renderer.js&frames=./examples/react-dashboard/dist/sample-frames.json&settings=./examples/react-dashboard/dist/sample-settings.json
```

The `wasm` query parameter is the generic renderer artifact URL. For this
browser-module template it points at `renderer.js`.
