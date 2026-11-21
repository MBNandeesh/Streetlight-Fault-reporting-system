import { STATUS_FLOW, statusLabel } from '../lib/statuses'

/**
 * Submitted -> Verified -> Assigned -> Resolved.
 * A rejected complaint shows a single terminal state instead.
 */
export default function StatusTimeline({ status }) {
  if (status === 'rejected') {
    return (
      <ol className="timeline">
        <li className="timeline-step is-done is-rejected">
          <span className="timeline-dot" aria-hidden="true" />
          <span>Rejected</span>
        </li>
      </ol>
    )
  }

  const currentIndex = Math.max(0, STATUS_FLOW.indexOf(status))

  return (
    <ol className="timeline">
      {STATUS_FLOW.map((step, index) => {
        const state =
          index < currentIndex ? 'is-done' : index === currentIndex ? 'is-current' : ''
        return (
          <li key={step} className={`timeline-step ${state}`}>
            <span className="timeline-dot" aria-hidden="true" />
            <span>{statusLabel(step)}</span>
          </li>
        )
      })}
    </ol>
  )
}
