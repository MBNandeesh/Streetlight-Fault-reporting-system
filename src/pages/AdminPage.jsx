import { useCallback, useEffect, useState } from 'react'
import {
  DUPLICATE_RADIUS_M,
  checkIsAdmin,
  getSession,
  listComplaints,
  listNearbyOpenComplaints,
  onAuthChange,
  publicPhotoUrl,
  signInAdmin,
  signOutAdmin,
  updateComplaint,
} from '../lib/api'
import { formatCoords, formatDateTime, mapLink } from '../lib/format'
import { STATUS_OPTIONS, statusLabel } from '../lib/statuses'
import StatusBadge from '../components/StatusBadge'

const FILTERS = [{ value: 'all', label: 'All' }, ...STATUS_OPTIONS]

export default function AdminPage() {
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [isAdmin, setIsAdmin] = useState(null)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let active = true
    getSession()
      .then((current) => {
        if (active) setSession(current)
      })
      .catch(() => {
        if (active) setSession(null)
      })
    const unsubscribe = onAuthChange((next) => {
      if (active) setSession(next)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) {
      // Keep a rejection message visible while the non-admin is signed out.
      setIsAdmin(false)
      return undefined
    }
    // A new session: any earlier rejection no longer applies to this account.
    setAuthError('')
    let active = true
    setIsAdmin(null)
    checkIsAdmin()
      .then((allowed) => {
        if (!active) return
        setIsAdmin(allowed)
        if (!allowed) {
          setAuthError('This account does not have admin access.')
          signOutAdmin()
        }
      })
      .catch((error) => {
        if (!active) return
        setIsAdmin(false)
        setAuthError(error.message)
      })
    return () => {
      active = false
    }
  }, [session])

  if (session === undefined) {
    return (
      <div className="page page-narrow">
        <p className="muted center">Checking your session…</p>
      </div>
    )
  }

  if (!session) {
    return <AdminLogin error={authError} />
  }

  if (isAdmin === null) {
    return (
      <div className="page page-narrow">
        <p className="muted center">Verifying admin access…</p>
      </div>
    )
  }

  // Anything other than a verified admin stays on the login screen.
  if (!isAdmin) {
    return <AdminLogin error={authError} />
  }

  return <AdminDashboard session={session} />
}

function AdminLogin({ error: initialError }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const shownError = error || initialError

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      await signInAdmin(email.trim(), password)
      // The auth listener in AdminPage picks up the new session.
    } catch (signInError) {
      setError(signInError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page page-narrow">
      <div className="page-heading">
        <h1>Admin login</h1>
        <p className="muted">Only municipal staff with an admin account can sign in.</p>
      </div>

      <form className="card form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {shownError && (
          <p className="alert" role="alert">
            {shownError}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="muted small center">
        Citizen? <a className="link" href="#/">Go back to the home screen</a>
      </p>
    </div>
  )
}

function AdminDashboard({ session }) {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  async function handleSignOut() {
    setSignOutError('')
    setSigningOut(true)
    try {
      await signOutAdmin()
      // The auth listener in AdminPage swaps in the login screen.
    } catch (signOutFailure) {
      setSignOutError(signOutFailure.message)
    } finally {
      setSigningOut(false)
    }
  }

  const load = useCallback(async (status) => {
    setLoading(true)
    setError('')
    try {
      setComplaints(await listComplaints(status))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(filter)
  }, [filter, load])

  function handleUpdated(updated) {
    setSelected(updated)
    setComplaints((current) => {
      const next = current.map((item) => (item.tracking_id === updated.tracking_id ? updated : item))
      if (filter !== 'all' && updated.status !== filter) {
        return next.filter((item) => item.tracking_id !== updated.tracking_id)
      }
      return next
    })
  }

  if (selected) {
    return (
      <AdminDetail
        complaint={selected}
        onBack={() => setSelected(null)}
        onUpdated={handleUpdated}
      />
    )
  }

  return (
    <div className="page">
      <div className="admin-bar">
        <div>
          <h1>Complaints</h1>
          <p className="muted small">Signed in as {session.user.email}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>

      {signOutError && (
        <p className="alert" role="alert">
          {signOutError}
        </p>
      )}

      <div className="tabs" role="tablist" aria-label="Filter by status">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={filter === item.value}
            className={`tab ${filter === item.value ? 'is-active' : ''}`}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="list-toolbar">
        <span className="muted small">
          {loading ? 'Loading…' : `${complaints.length} complaint${complaints.length === 1 ? '' : 's'}`}
        </span>
        <button type="button" className="link" onClick={() => load(filter)} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && complaints.length === 0 && (
        <div className="empty">
          <p>No complaints in this view yet.</p>
        </div>
      )}

      <ul className="complaint-list">
        {complaints.map((item) => (
          <li key={item.tracking_id}>
            <button type="button" className="complaint-row" onClick={() => setSelected(item)}>
              <img className="thumb" src={publicPhotoUrl(item.photo_path)} alt="" loading="lazy" />
              <span className="complaint-main">
                <span className="complaint-top">
                  <span className="mono small">{item.tracking_id}</span>
                  <StatusBadge status={item.status} />
                </span>
                <span className="complaint-desc">{item.description}</span>
                {item.duplicate_warning && (
                  <span className="flag">Nearby report when submitted</span>
                )}
                <span className="muted small">
                  {formatDateTime(item.created_at)} · {formatCoords(item.latitude, item.longitude)}
                </span>
              </span>
              <span className="chevron" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const DUPLICATE_OPTIONS = [
  { value: '', label: 'Not decided yet' },
  { value: 'separate', label: 'Separate — different streetlight or fault' },
  { value: 'duplicate', label: 'Duplicate of the other report' },
  { value: 'grouped', label: 'Handle together with the other report' },
]

function AdminDetail({ complaint, onBack, onUpdated }) {
  const [status, setStatus] = useState(complaint.status)
  const [note, setNote] = useState(complaint.admin_note || '')
  const [decision, setDecision] = useState(complaint.duplicate_decision || '')
  const [nearby, setNearby] = useState([])
  const [nearbyError, setNearbyError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const photoUrl = publicPhotoUrl(complaint.photo_path)

  // Other unresolved complaints within the same radius the citizen was warned about.
  useEffect(() => {
    let active = true
    listNearbyOpenComplaints(complaint)
      .then((rows) => {
        if (active) setNearby(rows)
      })
      .catch((nearbyFailure) => {
        if (active) setNearbyError(nearbyFailure.message)
      })
    return () => {
      active = false
    }
  }, [complaint.tracking_id, complaint.latitude, complaint.longitude])

  async function handleSave(event) {
    event.preventDefault()
    setError('')
    setSaved(false)
    if (note.trim().length > 500) {
      setError('The admin note must be 500 characters or fewer.')
      return
    }
    setSaving(true)
    try {
      const updated = await updateComplaint(complaint.tracking_id, {
        status,
        adminNote: note,
        duplicateDecision: decision,
      })
      onUpdated(updated)
      setSaved(true)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page page-narrow">
      <button type="button" className="back-link" onClick={onBack}>
        ← Back to complaints
      </button>

      <section className="card">
        <div className="report-header">
          <div>
            <p className="mono small muted">{complaint.tracking_id}</p>
            <h1 className="h-sm">Complaint details</h1>
          </div>
          <StatusBadge status={complaint.status} />
        </div>

        <p className="detail-description">{complaint.description}</p>

        <a
          className="photo-link"
          href={photoUrl}
          target="_blank"
          rel="noreferrer"
          title="Open the full photo"
        >
          <img
            className="photo-view"
            src={photoUrl}
            alt={`Reported streetlight ${complaint.tracking_id}`}
          />
        </a>
        <p className="hint">Tap the photo to open it full size.</p>

        <dl className="details">
          <div>
            <dt>Location</dt>
            <dd>
              <span className="mono small">{formatCoords(complaint.latitude, complaint.longitude)}</span>
              <br />
              <a
                className="link small"
                href={mapLink(complaint.latitude, complaint.longitude)}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google Maps
              </a>
            </dd>
          </div>
          <div>
            <dt>Reported</dt>
            <dd>{formatDateTime(complaint.created_at)}</dd>
          </div>
          <div>
            <dt>Last update</dt>
            <dd>{formatDateTime(complaint.updated_at)}</dd>
          </div>
          <div>
            <dt>Duplicate check</dt>
            <dd>
              {DUPLICATE_OPTIONS.find((option) => option.value === decision)?.label || 'Not decided yet'}
            </dd>
          </div>
        </dl>
      </section>

      {(nearby.length > 0 || nearbyError || complaint.duplicate_warning) && (
        <section className="card">
          <h2>Possible duplicates</h2>

          {nearbyError && (
            <p className="field-error">{nearbyError}</p>
          )}

          {nearby.length > 0 && (
            <>
              <p className="muted small">
                Open complaints within {DUPLICATE_RADIUS_M} m of this location:
              </p>
              <ul className="nearby-list">
                {nearby.map((item) => (
                  <li key={item.tracking_id} className="nearby-item">
                    <span className="complaint-top">
                      <span className="mono small">{item.tracking_id}</span>
                      <StatusBadge status={item.status} />
                    </span>
                    <span className="small">{item.distance_m} m away · {formatDateTime(item.created_at)}</span>
                    <span className="muted small complaint-desc">{item.description}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {nearby.length === 0 && !nearbyError && (
            <p className="muted small">No other open complaint within {DUPLICATE_RADIUS_M} m.</p>
          )}

          {complaint.duplicate_warning && (
            <p className="flag">The citizen was warned about a nearby open report when submitting.</p>
          )}

          <p className="hint">
            These are hints only. Photos and GPS cannot prove a report is genuine or a duplicate, so
            the decision below is yours. Nothing is ever deleted automatically.
          </p>
        </section>
      )}

      <form className="card form" onSubmit={handleSave}>
        <h2>Update this complaint</h2>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select
            id="status"
            className="input"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setSaved(false)
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="hint">
            Citizens see: Submitted → Verified → Assigned → Resolved. Use Rejected when the report
            cannot be handled.
          </p>
        </div>

        <div className="field">
            <label htmlFor="decision">Duplicate decision</label>
            <select
              id="decision"
              className="input"
              value={decision}
              onChange={(event) => {
                setDecision(event.target.value)
                setSaved(false)
              }}
            >
              {DUPLICATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="hint">
              Recorded on this report only. Marking it a duplicate never deletes or hides it.
            </p>
        </div>

        <div className="field">
          <label htmlFor="note">
            {status === 'rejected' ? 'Reason for rejection (optional)' : 'Admin note (optional)'}
          </label>
          <textarea
            id="note"
            className="input"
            rows={3}
            maxLength={500}
            placeholder={
              status === 'rejected'
                ? 'Example: Duplicate of an existing complaint for this pole.'
                : 'Example: Team assigned, repair scheduled for Friday.'
            }
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
              setSaved(false)
            }}
          />
          <p className="hint">{note.trim().length}/500 characters — shown to the citizen.</p>
        </div>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {saved && !error && <p className="success-text">Saved. The citizen now sees {statusLabel(status)}.</p>}

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
