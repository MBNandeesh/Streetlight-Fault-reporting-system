export default function Header({ path }) {
  const isActive = (prefix) => (prefix === '/' ? path === '/' : path.startsWith(prefix))

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a className="brand" href="#/">
          <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2v3M5 22h14M8 22v-3a4 4 0 0 1 2-3.5V9a2 2 0 0 1 4 0v6.5A4 4 0 0 1 16 19v3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <circle cx="12" cy="8" r="2.4" fill="currentColor" />
          </svg>
          <span>
            <strong>Streetlight</strong>
            <small>Fault Reporting</small>
          </span>
        </a>

        <nav className="site-nav" aria-label="Main">
          <a href="#/report" className={isActive('/report') ? 'is-active' : ''}>
            Report
          </a>
          <a href="#/track" className={isActive('/track') ? 'is-active' : ''}>
            Track
          </a>
          <a href="#/admin" className={isActive('/admin') ? 'is-active' : ''}>
            Admin
          </a>
        </nav>
      </div>
    </header>
  )
}
