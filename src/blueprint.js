import React, {createContext, useContext, useEffect, useLayoutEffect, useState} from "react"
import {HotkeysProvider, OverlaysContext, PortalProvider} from "@blueprintjs/core"
import {
  DashboardProvider,
  mountReactDashboard,
  useOptionalDashboardContext,
} from "./react.js"
import {
  BLUEPRINT_DARK_CLASS,
  BLUEPRINT_MOUNT_ATTRIBUTE,
  BLUEPRINT_PORTAL_ATTRIBUTE,
  BLUEPRINT_PORTAL_CLASS,
  BLUEPRINT_ROOT_CLASS,
  BLUEPRINT_STYLE_ATTRIBUTE,
  BLUEPRINT_THEME_BRIDGE_CSS,
  buildBlueprintThemeBridgeCss,
  scopeBlueprintCss,
} from "./blueprint-css.js"
import {
  BLUEPRINT_CORE_SCOPED_CSS,
  BLUEPRINT_SCOPED_CSS,
  BLUEPRINT_SELECT_SCOPED_CSS,
} from "./blueprint-styles.js"

export {
  BLUEPRINT_CORE_SCOPED_CSS,
  BLUEPRINT_DARK_CLASS,
  BLUEPRINT_MOUNT_ATTRIBUTE,
  BLUEPRINT_PORTAL_ATTRIBUTE,
  BLUEPRINT_PORTAL_CLASS,
  BLUEPRINT_ROOT_CLASS,
  BLUEPRINT_SCOPED_CSS,
  BLUEPRINT_SELECT_SCOPED_CSS,
  BLUEPRINT_STYLE_ATTRIBUTE,
  BLUEPRINT_THEME_BRIDGE_CSS,
  buildBlueprintThemeBridgeCss,
  scopeBlueprintCss,
}

const BlueprintPortalContext = createContext(null)
const BlueprintStyleManagedContext = createContext(false)
const activeMountsByRoot = new WeakMap()
const pendingMountsByRoot = new WeakMap()
const latestTokenByRoot = new WeakMap()
const sharedOverlaysContextValue = {hasProvider: true, stack: {current: []}}
const BLUEPRINT_STYLESHEET = `${BLUEPRINT_SCOPED_CSS}\n${BLUEPRINT_THEME_BRIDGE_CSS}`
const useIsomorphicLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : useEffect

export function useBlueprintPortalContainer() {
  return useContext(BlueprintPortalContext)
}

export function BlueprintDashboardProvider({
  children,
  className,
  style,
  portalClassName,
  theme: themeProp,
  host: hostProp,
  api: apiProp,
}) {
  const dashboardContext = useOptionalDashboardContext()
  const stylesManagedByMount = useContext(BlueprintStyleManagedContext)
  const effectiveApi = apiProp ?? dashboardContext?.api
  const resolvedTheme = useResolvedBlueprintTheme(themeProp, effectiveApi)
  const isDark = resolvedTheme === "dark"

  const [wrapperEl, setWrapperEl] = useState(null)
  const [portalContainer, setPortalContainer] = useState(null)
  const isClient = typeof document !== "undefined"

  useIsomorphicLayoutEffect(() => {
    if (stylesManagedByMount || !wrapperEl?.ownerDocument) return undefined

    const existing = findDirectChildByAttr(wrapperEl, BLUEPRINT_STYLE_ATTRIBUTE)
    if (existing) return undefined

    const styleEl = wrapperEl.ownerDocument.createElement("style")
    styleEl.setAttribute(BLUEPRINT_STYLE_ATTRIBUTE, "true")
    styleEl.textContent = BLUEPRINT_STYLESHEET
    wrapperEl.prepend(styleEl)

    return () => {
      styleEl.remove()
    }
  }, [stylesManagedByMount, wrapperEl])

  const rootClasses = joinClassNames(
    BLUEPRINT_ROOT_CLASS,
    isDark ? BLUEPRINT_DARK_CLASS : null,
    className,
  )

  const portalHostNode = React.createElement("div", {
    className: BLUEPRINT_PORTAL_CLASS,
    [BLUEPRINT_PORTAL_ATTRIBUTE]: "true",
    ref: setPortalContainer,
  })

  // Hold children/overlays on the client until portalContainer is committed in the DOM,
  // so Blueprint Portal never transiently falls back to document.body on initial render.
  const canRenderChildren = !isClient || portalContainer != null

  let content = children
  if (!dashboardContext && (hostProp !== undefined || apiProp !== undefined)) {
    content = React.createElement(
      DashboardProvider,
      {host: hostProp || {}, api: apiProp || {}},
      content,
    )
  }

  const blueprintTree = canRenderChildren
    ? React.createElement(
      BlueprintPortalContext.Provider,
      {value: portalContainer},
      React.createElement(
        PortalProvider,
        {portalClassName, portalContainer: portalContainer ?? undefined},
        React.createElement(
          OverlaysContext.Provider,
          {value: sharedOverlaysContextValue},
          React.createElement(HotkeysProvider, null, content),
        ),
      ),
    )
    : null

  return React.createElement(
    "div",
    {
      ref: setWrapperEl,
      className: rootClasses,
      style,
      "data-bp-color-scheme": isDark ? "dark" : "light",
      "data-sr-theme": isDark ? "dark" : "light",
    },
    blueprintTree,
    portalHostNode,
  )
}

export function mountBlueprintDashboard(Component, options = {}) {
  return async function mountDashboard(root, host, api) {
    if (!root || typeof root.ownerDocument?.createElement !== "function") {
      throw new TypeError("mountBlueprintDashboard requires a valid DOM root element")
    }

    if (api?.signal?.aborted || options.signal?.aborted) {
      return {destroy() {}}
    }

    const token = (latestTokenByRoot.get(root) ?? 0) + 1
    latestTokenByRoot.set(root, token)

    const pendingCleanup = pendingMountsByRoot.get(root)
    if (pendingCleanup) {
      pendingMountsByRoot.delete(root)
      pendingCleanup()
    }

    const previousHandle = activeMountsByRoot.get(root)
    if (previousHandle) {
      previousHandle.destroy()
    }

    clearBlueprintNodes(root)

    const doc = root.ownerDocument
    const styleEl = doc.createElement("style")
    styleEl.setAttribute(BLUEPRINT_STYLE_ATTRIBUTE, "true")
    styleEl.textContent = BLUEPRINT_STYLESHEET
    root.appendChild(styleEl)

    const mountNode = doc.createElement("div")
    mountNode.setAttribute(BLUEPRINT_MOUNT_ATTRIBUTE, "true")
    root.appendChild(mountNode)

    const abortController = typeof AbortController === "function" ? new AbortController() : null
    let superseded = false
    const cancelPending = () => {
      if (superseded) return
      superseded = true
      if (pendingMountsByRoot.get(root) === cancelPending) {
        pendingMountsByRoot.delete(root)
      }
      try {
        abortController?.abort()
      } finally {
        mountNode.remove()
        styleEl.remove()
      }
    }
    pendingMountsByRoot.set(root, cancelPending)

    const externalSignals = [options.signal, api?.signal].filter(
      (sig) => sig && typeof sig.addEventListener === "function",
    )
    const onExternalAbort = () => cancelPending()
    for (const sig of externalSignals) {
      if (sig.aborted) {
        cancelPending()
        return {destroy() {}}
      }
      sig.addEventListener("abort", onExternalAbort, {once: true})
    }

    function BlueprintWrappedDashboard(props) {
      return React.createElement(
        BlueprintStyleManagedContext.Provider,
        {value: true},
        React.createElement(
          BlueprintDashboardProvider,
          {
            className: options.className,
            style: options.style,
            portalClassName: options.portalClassName,
          },
          React.createElement(Component, props),
        ),
      )
    }

    let mounted = null
    try {
      mounted = await mountReactDashboard(BlueprintWrappedDashboard, {
        waitForReady: options.waitForReady,
        signal: abortController?.signal,
      })(mountNode, host, api)
    } catch (error) {
      if (pendingMountsByRoot.get(root) === cancelPending) {
        pendingMountsByRoot.delete(root)
      }
      mountNode.remove()
      styleEl.remove()
      throw error
    } finally {
      for (const sig of externalSignals) {
        sig.removeEventListener("abort", onExternalAbort)
      }
    }

    if (pendingMountsByRoot.get(root) === cancelPending) {
      pendingMountsByRoot.delete(root)
    }

    if (superseded || latestTokenByRoot.get(root) !== token) {
      try {
        mounted?.destroy?.()
      } finally {
        mountNode.remove()
        styleEl.remove()
      }
      return {destroy() {}}
    }

    let destroyed = false
    const handle = {
      destroy() {
        if (destroyed) return
        destroyed = true
        if (activeMountsByRoot.get(root) === handle) {
          activeMountsByRoot.delete(root)
        }
        try {
          mounted?.destroy?.()
        } finally {
          mountNode.remove()
          styleEl.remove()
        }
      },
    }
    activeMountsByRoot.set(root, handle)
    return handle
  }
}

function useResolvedBlueprintTheme(themeProp, api) {
  const [apiTheme, setApiTheme] = useState(() => readTheme(api))

  useEffect(() => {
    setApiTheme(readTheme(api))
    return api?.onThemeChange?.((nextTheme) => {
      setApiTheme(nextTheme || readTheme(api))
    })
  }, [api])

  return themeProp ?? apiTheme
}

function readTheme(api) {
  return api?.theme?.() || (api?.isDarkMode?.() ? "dark" : "light")
}


function clearBlueprintNodes(root) {
  if (!root?.children) return
  for (const node of Array.from(root.children)) {
    if (
      node.hasAttribute?.(BLUEPRINT_STYLE_ATTRIBUTE)
      || node.hasAttribute?.(BLUEPRINT_MOUNT_ATTRIBUTE)
    ) {
      node.remove()
    }
  }
}

function findDirectChildByAttr(parent, attr) {
  if (!parent?.children) return null
  for (const node of Array.from(parent.children)) {
    if (node.hasAttribute?.(attr)) return node
  }
  return null
}

function joinClassNames(...values) {
  const out = []
  for (const value of values) {
    if (typeof value === "string" && value.trim()) out.push(value.trim())
  }
  return out.length > 0 ? out.join(" ") : undefined
}
