# ServiceRadar Dashboard SDK

This SDK contains TinyGo helpers for browser dashboard packages that target
ServiceRadar's `dashboard-wasm-v1` host interface.

Dashboard packages still export the stable functions required by web-ng:

- `alloc_bytes`
- `free_bytes`
- `sr_dashboard_init_json`

The SDK owns the host ABI glue. Customer renderers use
`srdashboard.EmitRenderModelJSON` to emit constrained ServiceRadar render
models; ServiceRadar owns the deck.gl, Mapbox, popup, and event wiring.
