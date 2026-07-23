import { useEffect } from 'react'

const DEFAULT_LINK_ID = 'appearance-theme-google-font'

/**
 * Injects (and keeps up to date) a single `<link>` tag loading every font in
 * `fontFamilies` from Google Fonts, so a theme's free-text font choices
 * actually render without needing to be bundled in `index.html` ahead of
 * time. Reuses one `<link>` tag across calls/renders (swapping its `href`)
 * rather than piling up a new one per theme switch/font role.
 *
 * `linkId` lets an unrelated caller (e.g. `FontPicker`'s own suggestion
 * previews) load its own set of fonts under a distinct `<link>` tag instead
 * of fighting over the same one with the default caller — pass a distinct
 * id whenever the two sets of fonts can be live/visible at the same time.
 */
export function useGoogleFontLoader(fontFamilies: string[], linkId: string = DEFAULT_LINK_ID) {
  const familiesKey = fontFamilies.join('|')

  useEffect(() => {
    const trimmed = [...new Set(familiesKey.split('|').map((family) => family.trim()).filter(Boolean))]
    if (trimmed.length === 0) return

    let link = document.getElementById(linkId) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    const familyParams = trimmed.map((family) => `family=${family.replace(/\s+/g, '+')}:wght@300..700`).join('&')
    link.href = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`
  }, [familiesKey, linkId])
}
