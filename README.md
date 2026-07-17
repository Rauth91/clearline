# ClearLine

Field ops for voice installs — Jobs hub, Site Survey, System Design, and Go-Live.

Dark-first UI. Built for Cloudflare Pages (static frontend — customer job data stays in the browser or in exported job files, not on the server).

## What it does

- **Jobs hub** — create/import/export/delete jobs; each job links Survey + Design + Go-Live
- **Site Survey** — customer/site, numbers, users, network readiness, topology, photos
- **System Design** — hours, auto attendant, night button, call flow; import from Survey
- **Go-Live** — cutover, install checklist, provisioning sheet, customer handoff

**Privacy workflow:** Export a `.clearline` job file → store offline → Delete from browser → Import when you need it again.

## Local development

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Deploy on Cloudflare Pages (~$0)

1. Push this repo to GitHub
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → connect the repo
3. Build settings:
   - **Root directory:** `frontend`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Deploy

Cloudflare only hosts the app shell. It does not receive Survey / Design / Go-Live data.
