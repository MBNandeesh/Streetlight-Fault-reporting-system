// Hash routing keeps the app deployable to any static host (Vercel)
// without server rewrites, and the browser back button still works.
export function navigate(path) {
  window.location.hash = path
}
