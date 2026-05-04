// `defineDashboardConfig` is identity at runtime. The value is the type
// information shipped in `config.d.ts` so editors can complete and validate
// the dashboard config shape without dashboard authors reading the SDK source.

export function defineDashboardConfig(config) {
  return config
}

export const DASHBOARD_CONFIG_VERSION = 1
