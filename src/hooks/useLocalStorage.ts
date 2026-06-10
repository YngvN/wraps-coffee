import { useState } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  })

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
