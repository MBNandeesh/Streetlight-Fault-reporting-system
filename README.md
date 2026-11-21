# Streetlight Fault Reporting System

A college community project: citizens report faulty streetlights with a photo and GPS
location, get a tracking ID, and follow the complaint status. Municipal admins log in to
review complaints and update their status.

**Stack:** React 18 + Vite (JavaScript), plain CSS, Supabase (Postgres, Storage, Auth),
deployable to Vercel.

---

## Status lifecycle

`Submitted → Verified → Assigned → Resolved`, plus `Rejected` with an optional reason.

---

## 1. Supabase setup (one time)

1. Create a project at <https://supabase.com> and open **SQL Editor**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and run it. This creates:
   - the `complaints` table with a status `CHECK` constraint,
   - row level security policies,
   - the `admin_users` allow-list and the `is_admin()` function,
   - the `track_complaint()` lookup function used by the citizen tracking screen,
   - the `nearby_open_reports()` duplicate pre-check (returns only a count, the nearest
     distance and its status — never another citizen's report),
   - the public `streetlight-photos` storage bucket with an upload policy,
   - the `touch_updated_at` trigger.
3. Create the admin account: **Authentication → Users → Add user** (choose *Create new user*,
   set an email and password). Turn off public sign-ups in **Authentication → Providers → Email**
   so nobody else can register.
4. Promote that user to admin: run this in the SQL editor with the real email.

   ```sql
   insert into public.admin_users (user_id, email)
   select id, email from auth.users where email = 'admin@yourcollege.edu'
   on conflict (user_id) do nothing;
   ```

5. Copy the project URL and **anon public** key from **Project Settings → API**
   into `.env`:

   ```bash
   cp .env.example .env
   ```

   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

   The anon key is designed to be public. The **service_role key must never appear** in this
   project — security comes from the RLS policies, not from hiding the anon key.

## 2. Run locally

```bash
npm install
npm run dev
```

Open the printed URL (usually <http://localhost:5173>).

## 3. Deploy to Vercel

1. Push the folder to GitHub.
2. In Vercel: **Add New → Project**, import the repo. Framework preset **Vite**,
   build command `npm run build`, output directory `dist`.
3. Add the two environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) under
   **Settings → Environment Variables**, then deploy.
4. No rewrite rules are needed: navigation uses hash routes (`#/report`, `#/track`, `#/admin`).

---

## Duplicate reports

When a citizen submits, the app asks `nearby_open_reports()` whether anything is still open
(`status` not `resolved`/`rejected`) within **50 m**. If so, the form shows a warning with the
distance and that report's status, and the citizen chooses:

- **Continue — different fault** — the report is created anyway and `duplicate_warning` is set
  to `true`, so the admin sees "Nearby report when submitted" in the list.
- **Go back** — nothing is saved.

The check is advisory. Photos and GPS cannot prove a report is genuine or a duplicate, so
nothing is ever merged, hidden or deleted automatically. In the admin detail view the app
lists the other open reports within 50 m (id, distance, status, description) and the admin
records one of three verdicts in `duplicate_decision`: **separate**, **duplicate** or
**grouped** — "handle together". That verdict is stored on the report itself.

Citizens cannot set `duplicate_decision`: the insert policy forces it to stay `NULL` at
creation.

## How access control works

| Actor | Allowed | Enforced by |
| --- | --- | --- |
| Citizen (anonymous) | Insert a new complaint starting as `submitted`; look up one complaint by tracking ID; ask whether anything is open nearby (count + distance only) | RLS insert policy + `track_complaint()` and `nearby_open_reports()` security-definer functions |
| Signed-in user not in `admin_users` | Nothing; the app signs them out | `is_admin()` returns false, RLS blocks all reads/writes |
| Admin | Read all complaints, update status and note | RLS select/update policies using `is_admin()` |

Citizens cannot list complaints, cannot change a status, and cannot read another person's
report without its unguessable 6-character ID (`SL-XXXXXX`, 32^6 ≈ 1 billion combinations).

## Project structure

```
index.html
vite.config.js
supabase/schema.sql        # database, RLS, RPCs, storage bucket
src/
  main.jsx                 # React entry
  App.jsx                  # hash router + layout
  styles.css               # all styling (mobile-first)
  lib/
    supabase.js            # client created from VITE_ env vars
    api.js                 # every Supabase call: submit, upload, track, admin CRUD
    statuses.js            # status values and labels
    tracking.js            # tracking-id generation, normalising and shape check
    geo.js                 # haversine distance + 50 m duplicate radius
    format.js              # date / coordinates / maps helpers
    nav.js                 # hash navigation helper
  components/
    Header.jsx             # brand + nav
    StatusBadge.jsx
    StatusTimeline.jsx
    SetupScreen.jsx        # shown when .env is missing
  pages/
    Home.jsx
    ReportPage.jsx         # photo + description + GPS or manual coordinates + submit
    TrackPage.jsx          # status lookup by tracking ID
    AdminPage.jsx          # login, complaint list, detail + status update
```

## Features

**Citizen (no account needed)**

- Report a faulty streetlight with a photo (camera or gallery), a description and GPS location.
- Type the coordinates instead when location permission is denied or GPS is unavailable.
- Warning before submitting when another complaint is still open within 50 m; the report is
  still accepted and the flag is shown to the admin.
- Unique tracking ID (`SL-XXXXXX`) with a copy button, plus a direct link to the status page.
- Track a complaint by ID: status badge, progress timeline, dates, description, coordinates,
  map link and photo.
- Rejection reason shown when a report is rejected.

**Admin (account listed in `admin_users`)**

- Email/password sign-in; a signed-in account that is not an admin is rejected and signed out.
- Newest-first complaint list with status filters, count and refresh.
- Detail view with the full photo, coordinates, map link, admin note and the other open reports
  within 50 m.
- Update status, note/rejection reason and duplicate verdict (separate / duplicate / handle
  together). Nothing is deleted or merged automatically.

**Security**

- Row level security on `complaints`; anonymous visitors can only insert, never list.
- Reads go through `SECURITY DEFINER` functions that return either one report by its unguessable
  ID or a bare count/distance for the duplicate check.
- Only the anon key is used in the browser; the service-role key is never referenced.

## Known limitations

- **One admin role.** Any account in `admin_users` can see and edit every complaint; there are no
  wards, teams or read-only staff.
- **Sign-ups are disabled manually.** Turn off public email sign-ups in the Supabase dashboard;
  the database itself does not prevent account creation (such accounts still cannot do anything).
- **No application-level rate limiting.** The public RPCs and the upload policy rely on Supabase
  platform limits. Add rate limiting before a wide public launch.
- **Photos are public.** The bucket is public so images render without signed URLs. Paths contain
  the unguessable tracking ID, but anyone holding the URL can view a photo.
- **Possible orphaned photo.** If the row insert fails after the upload, the app tries to delete
  the file, but anonymous users have no storage delete policy, so the object can remain.
- **No pagination.** The admin list loads the 200 newest complaints only.
- **Duplicate check is a hint.** It looks 50 m around the point for unresolved reports; GPS drift
  can miss a duplicate or produce a false warning.
- **No notifications.** Citizens must re-check their tracking ID to see updates.
- **No offline support.** Reports need a connection; GPS needs HTTPS or `localhost`.
- **No automated test suite.** Verification was manual; see *Verification status* below.

## Verification status

Checked locally with `npm run build` and by driving the real UI in Chromium against a local
Supabase-compatible stub:

- Missing photo, short/empty description and missing location are blocked with clear messages.
- Location permission denied switches to manual coordinates with an explanation.
- Duplicate warning shows distance and status; *Go back* saves nothing; *Continue* creates the
  report with `duplicate_warning = true`.
- If the duplicate check itself fails, the form explains it and offers **Submit anyway** instead
  of blocking the report; the photo upload and insert still run.
- A forced storage failure shows "Photo upload failed: …", keeps the form usable and shows no
  success screen; retrying succeeds.
- Slow responses disable the form and show staged progress (Preparing photo → Uploading → Saving).
- A malformed tracking ID is rejected in the browser without a single network request; a
  well-formed unknown ID shows "No complaint found"; lower case and spaces are normalised.
- Non-admin sign-in is rejected and signed out; admin sign-in reaches the dashboard and sign-out
  returns to a clean login screen.
- Admin status change to *Assigned* is persisted and the citizen tracking page then shows
  *Assigned* plus the admin note.
- The duplicate list in the detail view excludes the report itself.

**Not verified here:** the real Supabase project (no `.env` credentials), a physical Android
phone, and the Vercel deployment. Run the checklist below after connecting your project.

## Manual test checklist

1. **Report** — pick a photo, write a description, tap *Use my current location*, submit.
   A `SL-XXXXXX` ID appears. Check Supabase → Storage that `reports/SL-XXXXXX.jpg` exists and
   the row is in `complaints` with status `submitted`.
2. **Track** — open `#/track`, enter the ID (lower case and spaces are fine), confirm the report
   ID, submission date, description, status, location and photo. A well-formed but unknown ID
   shows "No complaint found"; an incomplete one (e.g. `SL-4K9XQ`) is rejected in the browser
   without querying the database.
3. **Auth guard** — sign in with a non-admin account: the app rejects it and signs out.
4. **Admin** — sign in with the admin account, open a complaint, set status to `Verified`,
   add a note, save. Re-check the tracking page to confirm the citizen sees the update.
5. **Rejected** — set status to `Rejected` with a reason; the tracking page shows the reason.
6. **Validation** — try submitting with no photo / a 3-character description; both are blocked.
7. **No GPS** — block location permission for the site and tap *Use my current location*: the
   form switches to two coordinate boxes. Type e.g. `28.6139` / `77.2090` and submit; the row
   should save with those values. Out-of-range input (lat `120`) is rejected.
8. **Duplicate warning** — submit a report, then submit a second one at the same coordinates.
   The form shows "Possible duplicate report" with the distance and the first report's status.
   *Continue — different fault* creates the second report, and the admin list marks it
   "Nearby report when submitted".
9. **Admin duplicate decision** — open that second report: *Possible duplicates* lists the open
   neighbour with its distance. Set *Duplicate decision* to **Duplicate** or
   **Handle together** and save; the choice is stored on the report and nothing is deleted.
