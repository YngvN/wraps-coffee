import { NavLink, Outlet } from 'react-router-dom'
import { LanguageSwitcher, ThemeToggle, TranslatedText } from './components'

function App() {
  return (
    <div className="app">
      <header className="app__header">
        <nav className="app__nav">
          <NavLink to="/" end>
            <TranslatedText id="nav.home" />
          </NavLink>
          <NavLink to="/profile">
            <TranslatedText id="nav.profile" />
          </NavLink>
          <NavLink to="/components">
            <TranslatedText id="nav.components" />
          </NavLink>
        </nav>
        <div className="app__actions">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="app__content">
        <Outlet />
      </main>
    </div>
  )
}

export default App
