import type { CSSProperties } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LanguageSwitcher, PageTransition, ThemeToggle, TranslatedText } from './components'
import { useIsScrolled } from './hooks/useIsScrolled'
import { useLanguage } from './i18n'

/**
 * Application shell: header with the company name and primary navigation,
 * the routed page content, and a footer with company details, the cafe
 * tagline, copyright, and the language/theme controls.
 *
 * The header is transparent and fixed to the top (out of the normal page
 * flow), with only the nav links sitting on their own background. Its
 * measured height is exposed as the `--header-height` CSS variable so
 * `.app__content` can reserve space for it on every page except the
 * homepage, where the hero sits flush with the top edge of the viewport,
 * behind the transparent header. The header's company name stays hidden
 * while the page is at the top and slides down into view once the user
 * scrolls, in sync with the homepage hero animating out of view.
 *
 * On small screens the nav links collapse behind a hamburger button; toggling
 * it shows `.app__nav-overlay`, a fullscreen panel that expands/collapses via
 * a `max-height` transition.
 */
function App() {
  const { t } = useLanguage()
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isScrolled = useIsScrolled()
  const headerRef = useRef<HTMLElement>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  const [isNavOpen, setIsNavOpen] = useState(false)

  useLayoutEffect(() => {
    const updateHeaderHeight = () => setHeaderHeight(headerRef.current?.offsetHeight ?? 0)
    updateHeaderHeight()
    window.addEventListener('resize', updateHeaderHeight)
    return () => window.removeEventListener('resize', updateHeaderHeight)
  }, [])

  const closeNav = () => setIsNavOpen(false)

  return (
    <div className="app" style={{ '--header-height': `${headerHeight}px` } as CSSProperties}>
      <header ref={headerRef} className={`app__header${isScrolled ? ' app__header--scrolled' : ''}`}>
        <div className={`app__nav-overlay${isNavOpen ? ' app__nav-overlay--open' : ''}`}>
          <nav id="primary-navigation" className="app__nav">
            <NavLink to="/" end onClick={closeNav}>
              <TranslatedText id="nav.home" />
            </NavLink>
            <NavLink to="/menu" onClick={closeNav}>
              <TranslatedText id="nav.menu" />
            </NavLink>
            <NavLink to="/events" onClick={closeNav}>
              <TranslatedText id="nav.events" />
            </NavLink>
          </nav>
        </div>
        <button
          type="button"
          className={`app__nav-toggle${isNavOpen ? ' app__nav-toggle--open' : ''}`}
          aria-label={t(isNavOpen ? 'nav.closeMenu' : 'nav.openMenu')}
          aria-expanded={isNavOpen}
          aria-controls="primary-navigation"
          onClick={() => setIsNavOpen((open) => !open)}
        >
          <span className="app__nav-toggle-bar" />
          <span className="app__nav-toggle-bar" />
          <span className="app__nav-toggle-bar" />
        </button>
      </header>
      <main className={`app__content${isHome ? ' app__content--home' : ''}`}>
        <PageTransition />
      </main>
      <footer className="app__footer">
        <div className="app__footer-section">
          <TranslatedText as="p" className="app__footer-company" id="footer.company" />
          <p>
            {t('footer.orgNumberLabel')} {t('footer.orgNumber')}
          </p>
          <p>
            {t('footer.addressLabel')}: {t('footer.address')}
          </p>
        </div>
        <div className="app__footer-section">
          <TranslatedText as="p" id="footer.tagline" />
          <TranslatedText as="p" id="footer.rights" vars={{ year: new Date().getFullYear() }} />
        </div>
        <div className="app__footer-actions">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </footer>
    </div>
  )
}

export default App
