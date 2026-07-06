import type { CSSProperties } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, ScrollRestoration, useLocation } from 'react-router-dom'
import { LanguageSwitcher, PageTransition, ThemeToggle, TranslatedText } from './components'
import { useContactInfo } from './hooks/useContactInfo'
import { useIsScrolled } from './hooks/useIsScrolled'
import { useLanguage } from './i18n'
import { MAPS_URL } from './utils/location'

/** Days of the week in display order, matching `ContactInfo['hours']`'s keys. */
const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

/**
 * Application shell: header with the company name and primary navigation,
 * the routed page content, and a footer with company details, the cafe
 * tagline, copyright, and the theme toggle. The language switcher lives in
 * the nav bar.
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
  const [contactInfo] = useContactInfo()
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
            <LanguageSwitcher />
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
          <TranslatedText as="p" className="app__footer-company" id="footer.contact" />
          <p className="app__footer-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <a href={MAPS_URL} target="_blank" rel="noopener noreferrer">{contactInfo.address}</a>
          </p>
          <p className="app__footer-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12 19.79 19.79 0 0 1 1.95 3.37 2 2 0 0 1 3.92 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <a href={`tel:${contactInfo.phone}`}>{contactInfo.phone}</a>
          </p>
          <p className="app__footer-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <a href={`mailto:${contactInfo.email}`}>{contactInfo.email}</a>
          </p>
        </div>
        <div className="app__footer-section">
          <p className="app__footer-company">{t('footer.openingHours')}</p>
          <table className="app__footer-hours">
            <tbody>
              {WEEKDAY_KEYS.map((day) => {
                const dayHours = contactInfo.hours[day]
                return (
                  <tr key={day}>
                    <td>{t(`footer.hours.${day}`)}</td>
                    <td>{dayHours.closed ? t('footer.hours.closed') : `${dayHours.open}–${dayHours.close}`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="app__footer-section">
          <TranslatedText as="p" id="footer.tagline" />
          <TranslatedText as="p" id="footer.rights" vars={{ year: new Date().getFullYear() }} />
          <p>{t('footer.orgNumberLabel')} {t('footer.orgNumber')}</p>
          <p>Design: <a href="https://yngvn.github.io/" target="_blank" rel="noopener noreferrer">@NYKÅS</a></p>
        </div>
        <div className="app__footer-actions">
          <Link to="/admin/login" className="app__footer-admin-link" aria-label={t('footer.adminLogin')} title={t('footer.adminLogin')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </Link>
          <ThemeToggle />
        </div>
      </footer>
      <ScrollRestoration />
    </div>
  )
}

export default App
