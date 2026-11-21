import { useEffect, useState } from 'react'
import Header from './components/Header'
import SetupScreen from './components/SetupScreen'
import Home from './pages/Home'
import ReportPage from './pages/ReportPage'
import TrackPage from './pages/TrackPage'
import AdminPage from './pages/AdminPage'
import { isConfigured } from './lib/supabase'

function readPath() {
  const hash = window.location.hash.replace(/^#/, '')
  return hash.startsWith('/') ? hash : '/'
}

export default function App() {
  const [path, setPath] = useState(readPath)

  useEffect(() => {
    const onHashChange = () => {
      setPath(readPath())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (!isConfigured) {
    return <SetupScreen />
  }

  let page
  if (path === '/report') page = <ReportPage />
  else if (path.startsWith('/track')) {
    page = <TrackPage key={path} initialId={path.startsWith('/track/') ? path.slice(7) : ''} />
  } else if (path === '/admin') page = <AdminPage />
  else page = <Home />

  return (
    <div className="app">
      <Header path={path} />
      <main className="main">{page}</main>
      <footer className="site-footer">
        <p>Streetlight Fault Reporting · Municipal complaints demo</p>
      </footer>
    </div>
  )
}
