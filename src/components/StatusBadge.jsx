import { statusLabel } from '../lib/statuses'

export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  )
}
