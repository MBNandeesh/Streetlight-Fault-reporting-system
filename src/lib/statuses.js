// The order here is the normal lifecycle shown in the tracking timeline.
export const STATUS_FLOW = ['submitted', 'verified', 'assigned', 'resolved']

export const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'verified', label: 'Verified' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
]

export const STATUS_LABELS = STATUS_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label
  return acc
}, {})

export function statusLabel(value) {
  return STATUS_LABELS[value] || value
}
