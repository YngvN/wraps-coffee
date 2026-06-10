import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

/** Reads the user's previously saved theme choice, if any. */
function getStoredTheme(): Theme | null {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : null
}

/**
 * Determines the theme to start with by checking, in order:
 * 1. The `data-theme` attribute already applied to <html> (set by the
 *    bootstrap script in index.html before React mounts).
 * 2. The OS-level `prefers-color-scheme` media query.
 */
function getInitialTheme(): Theme {
  const domTheme = document.documentElement.getAttribute('data-theme')
  if (domTheme === 'light' || domTheme === 'dark') return domTheme

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Provides the active light/dark theme and keeps it in sync with the
 * `data-theme` attribute on <html> and `localStorage`. While the user
 * hasn't made an explicit choice, it follows the OS theme automatically.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (getStoredTheme()) return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      setThemeState(event.matches ? 'dark' : 'light')
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, next)
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return { theme, setTheme, toggleTheme }
}
