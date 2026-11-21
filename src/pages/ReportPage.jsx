import { useEffect, useRef, useState } from 'react'
import { findNearbyOpenReports, submitComplaint } from '../lib/api'
import { statusLabel } from '../lib/statuses'
import { formatCoords, mapLink } from '../lib/format'

const MIN_DESCRIPTION = 5
const MAX_DESCRIPTION = 500

const STAGE_LABELS = {
  checking: 'Checking nearby reports…',
  preparing: 'Preparing photo…',
  uploading: 'Uploading photo…',
  saving: 'Saving report…',
}

export default function ReportPage() {
  const [photo, setPhoto] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [description, setDescription] = useState('')
  const [locationMode, setLocationMode] = useState('none') // 'none' | 'gps' | 'manual'
  const [coords, setCoords] = useState(null)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [nearby, setNearby] = useState(null) // possible duplicate awaiting a decision
  const [warned, setWarned] = useState(false) // citizen chose to continue
  const [trackingId, setTrackingId] = useState('')
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef(null)
  const copyTimer = useRef(null)

  const submitting = stage !== ''

  useEffect(() => {
    if (!photo) {
      setPreviewUrl('')
      return undefined
    }
    const url = URL.createObjectURL(photo)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  function handlePhotoChange(event) {
    const file = event.target.files && event.target.files[0]
    setError('')
    if (file) setPhoto(file)
  }

  function captureLocation() {
    setLocationError('')
    if (!navigator.geolocation) {
      setLocationMode('manual')
      setLocationError('This browser does not support location access. Enter the coordinates manually.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
        setLocationMode('gps')
        setWarned(false)
        setLocating(false)
      },
      (geoError) => {
        setLocating(false)
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setLocationMode('manual')
          setLocationError(
            'Location permission was denied. Allow it in your browser settings and try again, or type the coordinates below.',
          )
        } else {
          setLocationMode('manual')
          setLocationError(
            'Could not get your location. Try again outdoors, or type the coordinates below.',
          )
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  function startManualLocation() {
    setLocationError('')
    setLocationMode('manual')
  }

  /** Returns { latitude, longitude } or null after setting a message. */
  function resolveLocation() {
    if (locationMode === 'gps' && coords) {
      return { latitude: coords.latitude, longitude: coords.longitude }
    }
    if (locationMode === 'manual') {
      const lat = Number(manualLat.trim())
      const lng = Number(manualLng.trim())
      if (manualLat.trim() === '' || manualLng.trim() === '') {
        setError('Enter both latitude and longitude, or use your current location.')
        return null
      }
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        setError('Latitude must be a number between -90 and 90.')
        return null
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        setError('Longitude must be a number between -180 and 180.')
        return null
      }
      return { latitude: lat, longitude: lng }
    }
    setError('Please add the streetlight location.')
    return null
  }

  async function save(location, acknowledged) {
    setStage('preparing')
    try {
      const id = await submitComplaint({
        description,
        photo,
        latitude: location.latitude,
        longitude: location.longitude,
        duplicateWarning: acknowledged,
        onStage: setStage,
      })
      setTrackingId(id)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setStage('')
      setNearby(null)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (submitting) return undefined

    if (!photo) return setError('Please add a photo of the faulty streetlight.')
    if (description.trim().length < MIN_DESCRIPTION) {
      return setError(`Please describe the fault in at least ${MIN_DESCRIPTION} characters.`)
    }
    const location = resolveLocation()
    if (!location) return undefined

    // Ask whether anything is already open at this spot before saving.
    // Only a count and distance come back, never another report's details.
    if (!warned) {
      setStage('checking')
      try {
        const result = await findNearbyOpenReports(location.latitude, location.longitude)
        if (result.openCount > 0) {
          setStage('')
          setNearby({ ...result, ...location })
          return undefined
        }
      } catch (checkError) {
        setStage('')
        setError(checkError.message)
        return undefined
      }
    }

    await save(location, warned)
    return undefined
  }

  function continueAnyway() {
    if (!nearby) return
    const location = { latitude: nearby.latitude, longitude: nearby.longitude }
    setWarned(true)
    setNearby(null)
    save(location, true)
  }

  function resetForm() {
    setTrackingId('')
    setPhoto(null)
    setDescription('')
    setCoords(null)
    setManualLat('')
    setManualLng('')
    setLocationMode('none')
    setLocationError('')
    setNearby(null)
    setWarned(false)
    setError('')
  }

  async function copyTrackingId() {
    try {
      await navigator.clipboard.writeText(trackingId)
      setCopied(true)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the ID is on screen to copy by hand.
    }
  }

  if (trackingId) {
    return (
      <div className="page page-narrow">
        <section className="card success-card">
          <span className="success-mark" aria-hidden="true">
            ✓
          </span>
          <h1>Report submitted</h1>
          <p className="muted">
            Save this tracking ID. You need it to check the complaint status later.
          </p>
          <p className="tracking-id mono">{trackingId}</p>
          <div className="button-row">
            <button type="button" className="btn btn-secondary" onClick={copyTrackingId}>
              {copied ? 'Copied' : 'Copy ID'}
            </button>
            <a className="btn btn-primary" href={`#/track/${trackingId}`}>
              View status
            </a>
          </div>
          <hr className="divider" />
          <button type="button" className="link" onClick={resetForm}>
            Report another streetlight
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="page page-narrow">
      <div className="page-heading">
        <h1>Report a streetlight fault</h1>
        <p className="muted">
          Fill in the three details below. Fields marked with <span aria-hidden="true">*</span> are
          required.
        </p>
      </div>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="photo">
            Photograph <span className="required">*</span>
          </label>
          <div className="photo-picker">
            {previewUrl ? (
              <img className="photo-preview" src={previewUrl} alt="Selected streetlight" />
            ) : (
              <div className="photo-placeholder">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 8h3l1.5-2h7L17 8h3v10H4z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                <span>No photo selected</span>
              </div>
            )}
            <input
              id="photo"
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
            />
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={submitting}
            >
              {photo ? 'Change photo' : 'Take or choose photo'}
            </button>
          </div>
          <p className="hint">Large photos are resized automatically before upload.</p>
        </div>

        <div className="field">
          <label htmlFor="description">
            What is wrong? <span className="required">*</span>
          </label>
          <textarea
            id="description"
            className="input"
            rows={4}
            maxLength={MAX_DESCRIPTION}
            placeholder="Example: The lamp has not been working for three nights. Pole number 24 near the bus stop."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={submitting}
          />
          <p className="hint">
            {description.trim().length}/{MAX_DESCRIPTION} characters (minimum {MIN_DESCRIPTION})
          </p>
        </div>

        <div className="field">
          <label htmlFor="location">
            Location <span className="required">*</span>
          </label>

          {locationMode === 'gps' && coords ? (
            <div className="location-box">
              <p className="mono small">{formatCoords(coords.latitude, coords.longitude)}</p>
              <p className="hint">Accuracy ±{Math.round(coords.accuracy)} m</p>
              <div className="button-row">
                <a
                  className="link"
                  href={mapLink(coords.latitude, coords.longitude)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Maps
                </a>
                <button type="button" className="link" onClick={captureLocation} disabled={locating}>
                  {locating ? 'Locating…' : 'Refresh location'}
                </button>
                <button type="button" className="link" onClick={startManualLocation}>
                  Enter manually
                </button>
              </div>
            </div>
          ) : locationMode === 'manual' ? (
            <div className="manual-location">
              <div className="coord-inputs">
                <div className="coord-field">
                  <label htmlFor="manualLat" className="small">
                    Latitude
                  </label>
                  <input
                    id="manualLat"
                    className="input"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="28.6139"
                    value={manualLat}
                    onChange={(event) => {
                      setManualLat(event.target.value)
                      setWarned(false)
                    }}
                    disabled={submitting}
                  />
                </div>
                <div className="coord-field">
                  <label htmlFor="manualLng" className="small">
                    Longitude
                  </label>
                  <input
                    id="manualLng"
                    className="input"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="77.2090"
                    value={manualLng}
                    onChange={(event) => {
                      setManualLng(event.target.value)
                      setWarned(false)
                    }}
                    disabled={submitting}
                  />
                </div>
              </div>
              <p className="hint">
                Get the numbers from Google Maps: long-press the streetlight on the map, then copy the
                two numbers that appear.
              </p>
              <button
                type="button"
                className="link"
                onClick={captureLocation}
                disabled={locating || submitting}
              >
                {locating ? 'Getting your location…' : 'Use my current location instead'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              id="location"
              className="btn btn-secondary btn-block"
              onClick={captureLocation}
              disabled={locating || submitting}
            >
              {locating ? 'Getting your location…' : 'Use my current location'}
            </button>
          )}

          {locationMode === 'none' && (
            <button type="button" className="link" onClick={startManualLocation} disabled={submitting}>
              Enter location manually
            </button>
          )}

          {locationError && <p className="field-error">{locationError}</p>}
          <p className="hint">Stand near the streetlight when you capture the location.</p>
        </div>

        {nearby && (
          <div className="warn-box" role="alert">
            <p className="warn-label">Possible duplicate report</p>
            <p>
              A complaint is already open {nearby.nearestMetres} m from this location
              {nearby.nearestStatus ? ` (status: ${statusLabel(nearby.nearestStatus)})` : ''}
              {nearby.openCount > 1 ? `, along with ${nearby.openCount - 1} other open report at the same spot` : ''}
              . It may be the same streetlight.
            </p>
            <p className="hint">
              If this is a different streetlight or a separate fault, continue. Your report is kept
              either way and an admin makes the final decision.
            </p>
            <div className="button-row">
              <button type="button" className="btn btn-primary" onClick={continueAnyway}>
                Continue — different fault
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setNearby(null)}>
                Go back
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={submitting}>
          {submitting ? STAGE_LABELS[stage] || 'Submitting report…' : 'Submit complaint'}
        </button>
      </form>
    </div>
  )
}
