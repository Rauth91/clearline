# ClearLine

Field ops for voice installs — Jobs hub, Site Survey, System Design, Go-Live, Accounts, and Tools.

Local-first React app. Hosted as a static SPA on Cloudflare Pages. With Supabase configured, techs in the same company can share jobs and accounts with background sync. Without Supabase, everything stays on-device (IndexedDB + `.clearline` export files).

## What it does

- **Jobs** — Survey → Design → Go-Live; export/import `.clearline` files
- **Accounts** — Call-flow documentation
- **Tools** — Diagnostics and references (always local)
- **Team sync** (optional) — magic-link auth, org invites, multi-tech sync, conflict review

**Privacy / backup:** Export a `.clearline` job file → store offline → delete from the browser → import when needed.

## Local development

```bash
cd frontend
cp .env.example .env.local   # optional — fill Supabase keys for team sync
npm install
npm run dev
```

Open http://localhost:5173

Hash routes: `#/` (My day), `#/jobs`, `#/job/:id` (cockpit), `#/job/:id/survey|design|golive|runbook`, `#/tools/reference|troubleshoot|config`, `#/settings`.

```bash
npm test   # jobHealth + network verdict unit tests
npm run build
```

### Optional: Supabase team backend

1. Create a Supabase project.
2. Run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in the SQL editor (or via Supabase CLI).
3. Enable **Email** auth with magic links (OTP) in Authentication → Providers.
4. Copy Project URL + anon key into `frontend/.env.local`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

5. Update CSP in [`frontend/public/_headers`](frontend/public/_headers): replace `TODO(project-ref)` with your project ref in both `https://` and `wss://` `connect-src` entries.
6. On Cloudflare Pages, set the same `VITE_*` env vars for production builds.

First signed-in user: **Create a company**. Admins invite teammates by email (Settings). Invitees sign in with the invited email and choose **I was invited**.

See [`docs/SYNC.md`](docs/SYNC.md) for outbox / revision / conflict design.

## Deploy on Cloudflare Pages

1. Push this repo to GitHub
2. Cloudflare Dashboard → **Workers & Pages** → connect the repo
3. Build settings:
   - **Root directory:** `frontend`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` if using team sync
5. Deploy

Cloudflare hosts the app shell only. Job payloads sync to your Supabase project when configured; they are not stored by Cloudflare.
