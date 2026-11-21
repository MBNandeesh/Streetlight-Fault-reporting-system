export function formatDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export function formatCoords(latitude, longitude) {
  return `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`
}

export function mapLink(latitude, longitude) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`
}
