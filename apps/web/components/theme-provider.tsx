"use client"

import * as React from "react"

type Theme = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  systemTheme: ResolvedTheme
  setTheme: (theme: Theme | ((current: Theme) => Theme)) => void
}

const storageKey = "theme"
const mediaQuery = "(prefers-color-scheme: dark)"
const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system"
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system"

  try {
    const value = window.localStorage.getItem(storageKey)
    return isTheme(value) ? value : "system"
  } catch {
    return "system"
  }
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia(mediaQuery).matches ? "dark" : "light"
}

function ThemeProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [theme, setThemeState] = React.useState<Theme>(readStoredTheme)
  const [systemTheme, setSystemTheme] = React.useState<ResolvedTheme>(readSystemTheme)
  const resolvedTheme = theme === "system" ? systemTheme : theme

  const setTheme = React.useCallback<ThemeContextValue["setTheme"]>((nextTheme) => {
    setThemeState((current) => {
      const value = typeof nextTheme === "function" ? nextTheme(current) : nextTheme
      try {
        window.localStorage.setItem(storageKey, value)
      } catch {
        // Ignore storage failures; theme still changes for the current tab.
      }
      return value
    })
  }, [])

  React.useEffect(() => {
    const root = document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(resolvedTheme)
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  React.useEffect(() => {
    const media = window.matchMedia(mediaQuery)
    const onChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light")
    }

    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setThemeState(isTheme(event.newValue) ? event.newValue : "system")
      }
    }

    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const value = React.useMemo<ThemeContextValue>(() => ({
    theme,
    resolvedTheme,
    systemTheme,
    setTheme,
  }), [resolvedTheme, setTheme, systemTheme, theme])

  return (
    <ThemeContext.Provider value={value}>
      <ThemeHotkey />
      {children}
    </ThemeContext.Provider>
  )
}

function useTheme() {
  const value = React.useContext(ThemeContext)
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return value
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (typeof event.key !== "string" || event.key.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider }
export { useTheme }
