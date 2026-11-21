import { useEffect, useRef, useState } from 'react'
import { trackComplaint } from '../lib/api'
import { isValidTrackingId, normalizeTrackingId } from '../lib/tracking'
import { formatCoords, formatDateTime, mapLink } from '../lib/format'
import StatusBadge from '../components/StatusBadge'
import StatusTimeline from '../components/StatusTimeline'

export default function TrackPage({ initialId = '' }) {
  const [input, setInput] = useState(initialId)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  async function lookup(value) {
    const id = normalizeTrackingId(value)

    if (!id || id === 'SL-') {
      setReport(null)
      setError('Enter the tracking ID from your report.')
      return
    }
    // Shape is checked locally, so a typo never becomes a database query.
    if (!isValidTrackingId(id)) {
      setReport(null)
      setError(`"${id}" is not a complete tracking ID. It has the form SL- followed by 6 characters, for example SL-4K9XQ2.`)
      return
    }

    setInput(id)
    setLoading(true)
    setError('')
    setReport(null)
    try {
      const result = await trackComplaint(id)
      if (result) setReport(result)
      else setError(`No complaint found for ${id}. Check the ID and try again.`)
    } catch (lookupError) {
      setError(lookupError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialId) lookup(initialId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId])

  function handleSubmit(event) {
    event.preventDefault()
    lookup(input)
  }

  function searchAnother() {
    setReport(null)
    setError('')
    setInput('')
    if (inputRef.current) inputRef.current.focus()
  }

  return (
    <div className="page page-narrow">
      <div className="page-heading">
        <h1>Track a complaint</h1>
        <p className="muted">Enter the tracking ID you received after submitting the report.</p>
      </div>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="tracking">Tracking ID</label>
          <input
            id="tracking"
            ref={inputRef}
            className="input mono"
            placeholder="SL-4K9XQ2"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <p className="hint">It starts with SL- and has 6 more characters. Capital letters are not required.</p>
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? 'Checking…' : 'Check status'}
        </button>
      </form>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {report && (
        <section className="card report-card">
          <div className="report-header">
            <h2>Complaint status</h2>
            <StatusBadge status={report.status} />
          </div>

          <StatusTimeline status={report.status} />

          {report.status === 'rejected' && (
            <div className="note-box">
              <p className="note-label">Reason for rejection</p>
              <p>{report.admin_note ? report.admin_note : 'The report was rejected. No reason was given.'}</p>
            </div>
          )}

          {report.status !== 'rejected' && report.admin_note && (
            <div className="note-box">
              <p className="note-label">Note from the admin team</p>
              <p>{report.admin_note}</p>
            </div>
          )}

          <dl className="details">
            <div>
              <dt>Report ID</dt>
              <dd className="mono">{report.tracking_id}</dd>
            </div>
            <div>
              <dt>Submitted on</dt>
              <dd>{formatDateTime(report.created_at)}</dd>
            </div>
            <div>
              <dt>Description</dt>
              <dd>{report.description}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>
                {formatCoords(report.latitude, report.longitude)}
                <br />
                <a
                  className="link small"
                  href={mapLink(report.latitude, report.longitude)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Google Maps
                </a>
              </dd>
            </div>
            <div>
              <dt>Last update</dt>
              <dd>{formatDateTime(report.updated_at)}</dd>
            </div>
          </dl>

          {report.photo_url && (
            <figure className="report-photo">
              <img src={report.photo_url} alt={`Streetlight reported under ${report.tracking_id}`} />
              <figcaption className="hint">Photo you submitted with this report</figcaption>
            </figure>
          )}

          <hr className="divider" />
          <button type="button" className="link" onClick={searchAnother}>
            Track another report
          </button>
        </section>
      )}
    </div>
  )
}
