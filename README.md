# ClearLine

Field ops for voice installs — Jobs hub, Site Survey, System Design, and Go-Live.

Customer job data stays on the device (browser storage or exported `.clearline` files). Cloudflare / the desktop shell only host the app UI.

## Desktop app (recommended for field techs)

Double-click installers — no website, no Node for techs.

```bash
# From repo root (build machine)
npm install
npm run dist
```

Installers land in `release/`:

- **Mac:** `ClearLine-*.dmg` (or `.zip`)
- **Windows:** `ClearLine Setup *.exe` (installer) and `ClearLine *.exe` (portable)

Techs install once, then open **ClearLine** like any other app. Works offline.

### Dev run (Electron + Vite)

```bash
# Terminal 1
cd frontend && npm install && npm run dev

# Terminal 2
cd .. && npm install && CLEARLINE_DEV_URL=http://localhost:5173 npm run dev
```

## Web (Cloudflare Pages)

```bash
cd frontend
npm install
npm run build
```

Pages settings:

- **Root directory:** `frontend`
- **Build command:** `npm run build`
- **Build output directory:** `dist`

## What it does

- **Jobs hub** — create/import/export/delete jobs; each job links Survey + Design + Go-Live
- **Site Survey** — customer/site, numbers, users, network readiness, topology, photos
- **System Design** — hours, auto attendant, night button, call flow; import from Survey
- **Go-Live** — cutover, install checklist, provisioning sheet, customer handoff

**Privacy workflow:** Export a `.clearline` job file → store offline → Delete from the app → Import when you need it again.
