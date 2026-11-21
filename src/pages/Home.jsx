import { STATUS_FLOW, statusLabel } from '../lib/statuses'

export default function Home() {
  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">College community project</p>
        <h1>Report a faulty streetlight in seconds</h1>
        <p className="lead">
          Take a photo, add your location and send the complaint to the municipal team. You get a
          tracking ID so you can follow what happens next.
        </p>
      </section>

      <section className="actions" aria-label="What would you like to do">
        <a className="action-card action-primary" href="#/report">
          <span className="action-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path
                d="M12 4v13m0-13 4.5 4.5M12 4 7.5 8.5M4 20h16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>
            <strong>Report a Fault</strong>
            <small>Photo, description and GPS location</small>
          </span>
        </a>

        <a className="action-card" href="#/track">
          <span className="action-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span>
            <strong>Track My Report</strong>
            <small>Check the status with your tracking ID</small>
          </span>
        </a>
      </section>

      <section className="card flow-card">
        <h2>How a complaint moves</h2>
        <ol className="flow">
          {STATUS_FLOW.map((status, index) => (
            <li key={status}>
              <span className="flow-index">{index + 1}</span>
              <span>{statusLabel(status)}</span>
            </li>
          ))}
        </ol>
        <p className="muted small">
          A complaint can also be rejected by the admin team, with a short reason.
        </p>
      </section>

      <section className="card admin-card">
        <div>
          <h2>For the municipal team</h2>
          <p className="muted small">
            View incoming complaints with photos and locations, then update their status.
          </p>
        </div>
        <a className="btn btn-secondary" href="#/admin">
          Admin login
        </a>
      </section>
    </div>
  )
}
