export default function SetupScreen() {
  return (
    <div className="setup">
      <div className="setup-card">
        <h1>Connect your Supabase backend</h1>
        <p className="muted">
          This app needs a Supabase project before it can accept reports. Follow the steps in
          <code> README.md</code> (section <em>Supabase setup</em>), then restart the dev server.
        </p>

        <ol className="setup-steps">
          <li>
            Create a project at <span className="mono">supabase.com</span> and run
            <code> supabase/schema.sql</code> in the SQL editor.
          </li>
          <li>
            Copy <code>.env.example</code> to <code>.env</code> and fill in:
            <pre className="setup-code">VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...</pre>
          </li>
          <li>
            Restart <code>npm run dev</code>. The anon key is public by design; never put the
            service-role key in the frontend.
          </li>
        </ol>
      </div>
    </div>
  )
}
