import { useEffect } from 'react'

const LINK_ID = 'appearance-theme-google-font'

/**
 * Injects (and keeps up to date) a single `<link>` tag loading every font in
 * `fontFamilies` from Google Fonts, so a theme's free-text font choices
 * actually render without needing to be bundled in `index.html` ahead of
 * time. Reuses one `<link>` tag across calls/renders (swapping its `href`)
 * rather than piling up a new one per theme switch/font role.
 */
export function useGoogleFontLoader(fontFamilies: string[]) {
  const familiesKey = fontFamilies.join('|')

  useEffect(() => {
    const trimmed = [...new Set(familiesKey.split('|').map((family) => family.trim()).filter(Boolean))]
    if (trimmed.length === 0) return

    let link = document.getElementById(LINK_ID) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.id = LINK_ID
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    const familyParams = trimmed.map((family) => `family=${family.replace(/\s+/g, '+')}:wght@300..700`).join('&')
    link.href = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`
  }, [familiesKey])
}
