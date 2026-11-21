import { supabase, PHOTO_BUCKET } from './supabase'
import { createTrackingId, isValidTrackingId, normalizeTrackingId } from './tracking'
import { DUPLICATE_RADIUS_M, distanceMetres } from './geo'

export { createTrackingId } from './tracking'

// Phone cameras produce 3-8 MB photos. Downscaling to 1280px keeps
// uploads fast on mobile data and stays inside the storage size limit.
const MAX_INPUT_BYTES = 15 * 1024 * 1024
const MAX_EDGE = 1280

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('That image could not be read. Please choose another photo.'))
    }
    image.src = objectUrl
  })
}

async function preparePhoto(file) {
  if (!file) {
    throw new Error('Please add a photo of the faulty streetlight.')
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG or WebP).')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('That photo is larger than 15 MB. Please choose a smaller one.')
  }

  const image = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height))
  const width = Math.round(image.width * scale)
  const height = Math.round(image.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, width, height)

  const blob = await new Promise((resolve) =>
    canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.82),
  )
  if (!blob) {
    throw new Error('The photo could not be processed. Please try again.')
  }
  return blob
}

/* ---------------- Duplicate detection ---------------- */

export { DUPLICATE_RADIUS_M } from './geo'
/**
 * Citizen-side pre-check. Runs as SECURITY DEFINER on the database, so the
 * anonymous visitor never gets read access to the complaints table: only a
 * count, the nearest distance and its status come back.
 */
export async function findNearbyOpenReports(latitude, longitude, radiusMetres = DUPLICATE_RADIUS_M) {
  const { data, error } = await supabase.rpc('nearby_open_reports', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_radius_m: radiusMetres,
  })
  if (error) {
    throw new Error(`Could not check for nearby reports: ${error.message}`)
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { openCount: 0, nearestMetres: null, nearestStatus: null }
  return {
    openCount: row.open_count || 0,
    nearestMetres: row.nearest_m,
    nearestStatus: row.nearest_status || null,
  }
}

/**
 * Admin-side check for one complaint: other unresolved complaints within the
 * radius. Admins may read the table anyway, so this is a plain filtered query
 * with an exact distance calculated in the browser.
 */
export async function listNearbyOpenComplaints(complaint, radiusMetres = DUPLICATE_RADIUS_M) {
  if (!complaint || !Number.isFinite(complaint.latitude) || !Number.isFinite(complaint.longitude)) {
    return []
  }
  const latDelta = radiusMetres / 111320
  const cosLat = Math.max(Math.abs(Math.cos((complaint.latitude * Math.PI) / 180)), 0.01)
  const lngDelta = radiusMetres / (111320 * cosLat)

  const { data, error } = await supabase
    .from('complaints')
    .select('tracking_id, status, description, latitude, longitude, created_at')
    .neq('tracking_id', complaint.tracking_id)
    .not('status', 'in', '("resolved","rejected")')
    .gte('latitude', complaint.latitude - latDelta)
    .lte('latitude', complaint.latitude + latDelta)
    .gte('longitude', complaint.longitude - lngDelta)
    .lte('longitude', complaint.longitude + lngDelta)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    throw new Error(`Could not check nearby reports: ${error.message}`)
  }

  return (data || [])
    .map((row) => ({
      ...row,
      distance_m: Math.round(
        distanceMetres(complaint.latitude, complaint.longitude, row.latitude, row.longitude),
      ),
    }))
    .filter((row) => row.distance_m <= radiusMetres)
    .sort((a, b) => a.distance_m - b.distance_m)
}

/**
 * Uploads the photo, then creates the complaint row.
 * If the row insert fails it tries to delete the uploaded photo again, but
 * storage RLS blocks anonymous deletes, so an orphaned file is possible.
 * Returns the new tracking id.
 */
export async function submitComplaint({
  description,
  photo,
  latitude,
  longitude,
  duplicateWarning = false,
  onStage,
}) {
  const report = onStage || (() => {})
  const text = description.trim()
  if (text.length < 5) {
    throw new Error('Please describe the fault in at least 5 characters.')
  }
  if (text.length > 500) {
    throw new Error('The description must be 500 characters or fewer.')
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Please capture the streetlight location first.')
  }

  report('preparing')
  const trackingId = createTrackingId()
  const photoBlob = await preparePhoto(photo)
  report('uploading')
  const photoPath = `reports/${trackingId}.jpg`

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(photoPath, photoBlob, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) {
    throw new Error(`Photo upload failed: ${uploadError.message}`)
  }

  const { data: publicUrlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(photoPath)

  report('saving')

  const { error: insertError } = await supabase.from('complaints').insert({
    tracking_id: trackingId,
    description: text,
    photo_url: publicUrlData.publicUrl,
    latitude,
    longitude,
    status: 'submitted',
    duplicate_warning: duplicateWarning === true,
  })

  if (insertError) {
    await supabase.storage.from(PHOTO_BUCKET).remove([photoPath])
    throw new Error(`Could not save the report: ${insertError.message}`)
  }

  return trackingId
}

/** Public lookup by tracking id. Returns null when nothing matches. */
export async function trackComplaint(trackingId) {
  const id = normalizeTrackingId(trackingId)
  if (!isValidTrackingId(id)) {
    throw new Error('That tracking ID is incomplete. It looks like SL-4K9XQ2: SL- plus 6 characters.')
  }
  const { data, error } = await supabase.rpc('track_complaint', {
    p_tracking_id: id,
  })
  if (error) {
    throw new Error(`Could not look up that report: ${error.message}`)
  }
  return data && data.length > 0 ? data[0] : null
}

/* ---------------- Admin ---------------- */

export function getSession() {
  return supabase.auth.getSession().then(({ data }) => data.session)
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

export async function signInAdmin(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(error.message === 'Invalid login credentials'
      ? 'Wrong email or password.'
      : error.message)
  }
}

export function signOutAdmin() {
  return supabase.auth.signOut()
}

/** True when the signed-in user is listed in public.admin_users. */
export async function checkIsAdmin() {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) {
    throw new Error(`Could not verify admin access: ${error.message}`)
  }
  return data === true
}

export async function listComplaints(status) {
  let query = supabase
    .from('complaints')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Could not load complaints: ${error.message}`)
  }
  return data
}

export async function updateComplaint(trackingId, { status, adminNote, duplicateDecision }) {
  const note = adminNote.trim()
  const { data, error } = await supabase
    .from('complaints')
    .update({
      status,
      admin_note: note === '' ? null : note,
      duplicate_decision: duplicateDecision || null,
    })
    .eq('tracking_id', trackingId)
    .select()
    .single()

  if (error) {
    throw new Error(`Could not update the complaint: ${error.message}`)
  }
  return data
}
