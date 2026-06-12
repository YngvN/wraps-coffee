import type { CSSProperties } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { LanguageSwitcher, ThemeToggle, TranslatedText } from './components'
import { useIsScrolled } from './hooks/useIsScrolled'
import { useLanguage } from './i18n'

/**
 * Application shell: header with the company name and primary navigation,
 * the routed page content, and a footer with company details, the cafe
 * tagline, copyright, and the language/theme controls.
 *
 * The header is transparent and sticky to the top, with only the nav links
 * sitting on their own background. Its measured height is exposed as the
 * `--header-height` CSS variable so the homepage hero can extend up behind
 * it to the top edge of the viewport. The header's company name stays
 * hidden while the page is at the top and slides down into view once the
 * user scrolls, in sync with the homepage hero animating out of view.
 */
function App() {
  const { t } = useLanguage()
  const isScrolled = useIsScrolled()
  const headerRef = useRef<HTMLElement>(null)
  const [headerHeight, setHeaderHeight] = useState(0)

  useLayoutEffect(() => {
    const updateHeaderHeight = () => setHeaderHeight(headerRef.current?.offsetHeight ?? 0)
    updateHeaderHeight()
    window.addEventListener('resize', updateHeaderHeight)
    return () => window.removeEventListener('resize', updateHeaderHeight)
  }, [])

  return (
    <div className="app" style={{ '--header-height': `${headerHeight}px` } as CSSProperties}>
      <header ref={headerRef} className={`app__header${isScrolled ? ' app__header--scrolled' : ''}`}>
        <Link to="/" className="app__logo">
          <span className="app__logo-text">Wraps & Coffee</span>
        </Link>
        <nav className="app__nav">
          <NavLink to="/" end>
            <TranslatedText id="nav.home" />
          </NavLink>
          <NavLink to="/menu">
            <TranslatedText id="nav.menu" />
          </NavLink>
          <NavLink to="/events">
            <TranslatedText id="nav.events" />
          </NavLink>
        </nav>
      </header>
      <main className="app__content">
        <Outlet />
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
