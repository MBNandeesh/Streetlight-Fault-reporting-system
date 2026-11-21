// "Approximately 30-50 metres" from the brief: 50 m usually covers the next
// pole, so anything closer is worth a second look.
export const DUPLICATE_RADIUS_M = 50

const EARTH_RADIUS_M = 6371000

/** Great-circle distance in metres between two points (haversine). */
export function distanceMetres(lat1, lng1, lat2, lng2) {
  const rad = (value) => (value * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}
