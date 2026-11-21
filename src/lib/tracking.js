// Tracking ids are SL- + 6 characters from an alphabet that leaves out
// characters people confuse (0/O, 1/I), giving 32^6 ≈ 1 billion values.
// They are the only way a citizen can read a complaint, so they must not
// be guessable or sequential.
export const TRACKING_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

const BODY_PATTERN = new RegExp(`^[${TRACKING_ALPHABET}]{6}$`)

export function createTrackingId() {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const byte of bytes) {
    code += TRACKING_ALPHABET[byte % TRACKING_ALPHABET.length]
  }
  return `SL-${code}`
}

/**
 * Accepts what a person actually types — "sl 4k9xq2", "4K9XQ2",
 * "SL-4K9XQ2 " — and returns the canonical "SL-4K9XQ2".
 */
export function normalizeTrackingId(value) {
  const raw = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  const body = raw.startsWith('SL') ? raw.slice(2) : raw
  return `SL-${body}`
}

/** True only for a complete, correctly shaped id. Checked before any query. */
export function isValidTrackingId(normalized) {
  return normalized.startsWith('SL-') && BODY_PATTERN.test(normalized.slice(3))
}
