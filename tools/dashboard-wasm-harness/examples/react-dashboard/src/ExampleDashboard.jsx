import React from "react"
import {frameRows} from "@serviceradar/dashboard-sdk/frames"
import {
  useDashboardFrame,
  useDashboardNavigation,
  useDashboardSettings,
  useDashboardSrql,
  useDashboardTheme,
} from "@serviceradar/dashboard-sdk/react"

export function ExampleDashboard() {
  const frame = useDashboardFrame("sites")
  const navigation = useDashboardNavigation()
  const settings = useDashboardSettings()
  const srql = useDashboardSrql()
  const theme = useDashboardTheme()
  const sites = frameRows(frame)

  return React.createElement(
    "main",
    {
      style: {
        minHeight: "100%",
        padding: "24px",
        background: theme === "dark" ? "#0b1120" : "#f8fafc",
        color: theme === "dark" ? "#e5e7eb" : "#111827",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      },
    },
    React.createElement("h1", {style: {margin: "0 0 16px", fontSize: "24px"}}, settings.title || "React Dashboard"),
    React.createElement(
      "div",
      {style: {display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap"}},
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () => srql.update(srql.build({entity: "wifi_sites", include: {site_code: ["DEN"]}, limit: 500})),
        },
        "Filter DEN",
      ),
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () => srql.update(srql.build({entity: "wifi_sites", limit: 500})),
        },
        "Reset",
      ),
    ),
    React.createElement(
      "section",
      {style: {display: "grid", gap: "8px"}},
      sites.map((site) =>
        React.createElement(
          "button",
          {
            key: site.site_code,
            type: "button",
            onClick: () => navigation.open({type: "path", path: `/devices?site=${encodeURIComponent(site.site_code)}`}),
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              padding: "12px 14px",
              border: "1px solid rgba(148, 163, 184, 0.35)",
              borderRadius: "8px",
              background: theme === "dark" ? "#111827" : "#ffffff",
              color: "inherit",
              textAlign: "left",
              cursor: "pointer",
            },
          },
          React.createElement("span", null, `${site.site_code} - ${site.name}`),
          React.createElement("span", null, `${site.ap_count || 0} APs`),
        ),
      ),
    ),
  )
}
