# VoIP Ops Console — SaaS Product Design

> This document is the source of truth for product direction: what we're building, who it's for, how it should be structured, and what to do next.

---

## What this product is

**VoIP Ops Console** is a field operations platform for VoIP MSPs and installers. It replaces clipboards, spreadsheets, and tribal knowledge with a structured digital workflow that takes a customer from first site visit through go-live.

**Primary users:**
| Role | What they do |
|------|-------------|
| **Admin** | Manages the org, invites team, sees billing |
| **Project Manager** | Creates accounts and jobs, assigns techs, tracks status |
| **Field Tech** | Runs site surveys, installs devices, executes runbooks |
| **System Engineer** | Designs call flows, configures system |

---

## What's wrong right now

### 1. Navigation doesn't reflect the actual workflow

The current structure is: **Home → Accounts → Account → Job → [8 tabs]**

The 8 tabs inside a job (Survey, Design, Call Flow, Topology, Migration, Go-Live, Activity, Cockpit) are all at the same level with no sense of order or phase. A new tech has no idea where to start.

**Fix:** Jobs should have 3 explicit phases — Survey → Design → Install — each with its own sub-steps. The tab bar should reflect progress through these phases, not just list every tool.

### 2. "Tools" are disconnected from jobs

Tools like Call Diagnostic, Network Check, and Port Checklist exist in a separate section, but techs actually use them *during* a job. A tech shouldn't have to leave their job context to run a network check.

**Fix:** Move diagnostic tools into the job workspace as contextual actions. Keep a Tools section only for standalone reference tools (codec tables, firmware versions, Yealink codes).

### 3. No job status / lifecycle

Jobs exist as either "Install" or "Migration" but have no status. There's no way to see at a glance: which jobs are in-flight, which are stuck at survey, which are ready for go-live.

**Fix:** Add a `status` field with a defined lifecycle: `draft → survey → design → install → complete`.

### 4. No real multi-tenancy

The app was built for one user at a time. For SaaS, multiple companies (orgs) need isolated data, their own users, and role-based access.

**Fix:** Add an `org_id` to every table in Supabase. Use Supabase Row-Level Security (RLS) policies to enforce tenant isolation at the database level.

### 5. Home screen is too passive

The current home shows recent jobs and a search bar. That's fine for a solo tool, but a team dashboard needs to show: jobs by status, what's assigned to me, what's blocked.

**Fix:** Rebuild the home as an ops dashboard showing jobs grouped by lifecycle phase.

---

## Correct Information Architecture

```
/                           Home — active jobs dashboard, my queue
/accounts                   All customer accounts
/accounts/:id               Account detail — contacts, sites, job list
/jobs/:id                   Job workspace (see below)
/tools                      Standalone reference tools
/admin                      Org settings, team, billing
```

### Job workspace (the core product)

```
/jobs/:id
├── Overview              Status, assigned team, due date, timeline
│
├── Phase 1: Survey       (field tech fills this out on-site)
│   ├── Site Info         Company, contacts, address, ticket ID
│   ├── Network Tests     Speedtests + MyConnection runs → readiness verdict
│   ├── Topology          Network diagram (devices + cables)
│   └── Photos            MDF, IDF, cabling evidence
│
├── Phase 2: Design       (engineer fills this out)
│   ├── Call Flow         Visual call routing diagram
│   ├── System Design     Users, extensions, device assignments
│   └── Numbers           DIDs, main numbers, E911 locations
│
├── Phase 3: Install      (tech executes on-site)
│   ├── Provisioning      Device config sheet
│   ├── Port Checks       QoS, SIP ALG, firewall ports
│   └── Go-Live Runbook   Step-by-step checklist with sign-off
│
└── Activity              Audit log of all changes and events
```

---

## Data Model (Supabase)

```sql
-- Tenant isolation
organizations       id, name, slug, plan, seats, created_at

-- People
users               id, org_id, email, name, role, avatar_url
                    role: 'admin' | 'pm' | 'tech' | 'viewer'

-- Customers
accounts            id, org_id, name, type, created_by, created_at

-- Jobs
jobs                id, account_id, org_id, type, status, title
                    type: 'install' | 'migration'
                    status: 'draft' | 'survey' | 'design' | 'install' | 'complete'
                    assigned_to: uuid[]
                    due_date: date

-- Job data (all scoped to job_id)
job_surveys         id, job_id, data (jsonb), updated_at
job_designs         id, job_id, call_flow (jsonb), system_design (jsonb)
job_topology        id, job_id, nodes (jsonb), links (jsonb)
job_photos          id, job_id, url, caption, taken_at
job_activity        id, job_id, user_id, event, metadata, created_at
```

**Row-Level Security rules (Supabase RLS):**
- Every table includes `org_id`
- Auth middleware sets `app.org_id` from the JWT claim
- All queries auto-filter to `org_id = current_setting('app.org_id')`

---

## What's Good — Keep It

- **FluidDock nav** — the glass sidebar is excellent UX, keep the pattern
- **Supabase sync + conflict detection** — solid foundation, expand it
- **Site Survey data model** — thorough, well-structured
- **Go-Live Runbook** — the gated/done step pattern is exactly right
- **Call Flow diagram** — just needs React Flow to replace the SVG renderer
- **Glass aesthetic** — invest in it, it's a differentiator

---

## What's Broken — Fix It

| Problem | Fix |
|---------|-----|
| 8 flat tabs in job workspace | Reorganize into 3 phases with sub-steps |
| No job status/phase tracking | Add `status` to jobs, show phase progress bar |
| Tools disconnected from jobs | Move diagnostics into job context |
| No team/role model | Add `role` to users, gate UI accordingly |
| Home screen is passive | Build ops dashboard: jobs by status |
| Call flow uses custom SVG | Replace with React Flow (`npm install reactflow`) |
| No org isolation | Add `org_id` to all tables + RLS policies |

---

## What's Missing — Build It (phased)

### Phase 1 — Clean up (do this first, no new infra)
- [ ] Reorganize job workspace into Survey / Design / Install phases
- [ ] Add job status + phase progress bar to JobCockpit
- [ ] Rebuild home as ops dashboard (jobs by status column)
- [ ] Move Network Check + Port Checklist into job Install phase
- [ ] Wire CallFlowCanvas.jsx (React Flow) into AccountCallFlow.jsx

### Phase 2 — SaaS foundations
- [ ] `organizations` table + `org_id` on all tables
- [ ] User roles: admin / pm / tech / viewer
- [ ] Team invites via email (Supabase Auth)
- [ ] RLS policies for tenant isolation
- [ ] Org settings screen (name, logo, slug)

### Phase 3 — SaaS growth
- [ ] Billing (Stripe Checkout + Customer Portal)
- [ ] Job templates (start from a saved config)
- [ ] Customer-facing read-only portal (share survey/design with the customer)
- [ ] Notifications (email/Slack on status changes)
- [ ] Mobile-optimized survey mode for field techs

---

## Tech Stack

| Layer | Current | Target |
|-------|---------|--------|
| Frontend | Vite + React 18, hash routing | Keep — add React Router for cleaner URLs |
| Styling | CSS custom properties + glass system | Keep — continue the design system |
| State | Component state + localStorage | Keep local state, push all persistence to Supabase |
| Database | Supabase (PostgreSQL) | Expand — add org isolation + RLS |
| Auth | Supabase Auth | Keep — add org claim to JWT |
| Real-time | Supabase Realtime (partial) | Expand to all job tables |
| Payments | None | Stripe (Phase 3) |
| Hosting | TBD | Vercel or Netlify for frontend, Supabase for backend |

---

## The One Principle

Every screen should answer: **"What does this tech / PM need to do right now?"**

If a screen makes someone think for more than 3 seconds about where to go next, it's designed wrong.

---

*Last updated: 2026-08-03*
