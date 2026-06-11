import { Link, NavLink, Outlet } from 'react-router-dom'
import logoMark from './assets/images/logo/logo-mark.svg'
import { LanguageSwitcher, ThemeToggle, TranslatedText } from './components'
import { useLanguage } from './i18n'

/**
 * Application shell: header with logo and primary navigation, the routed
 * page content, and a footer with company details, the cafe tagline,
 * copyright, and the language/theme controls.
 */
function App() {
  const { t } = useLanguage()

  return (
    <div className="app">
      <header className="app__header">
        <Link to="/" className="app__logo">
          <img src={logoMark} alt="" className="app__logo-mark" />
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
