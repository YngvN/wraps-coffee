import { useEffect, useState } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  // Keeps other same-origin tabs/windows in sync: the `storage` event fires
  // only in tabs *other* than the one that wrote the change, so this can't
  // loop with `setStoredValue` below.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key) return
      try {
        setValue(event.newValue ? (JSON.parse(event.newValue) as T) : initialValue)
      } catch {
        // Ignore malformed external writes
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [key, initialValue])

  const setStoredValue = (newValue: T) => {
    setValue(newValue)
    try {
      window.localStorage.setItem(key, JSON.stringify(newValue))
    } catch {
      // Ignore write errors (e.g. storage full or unavailable)
    }
  }

  return [value, setStoredValue] as const
}
