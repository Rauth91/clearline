# ClearLine sync design

Local-first multi-tech sync for ClearLine. Customer data lives in the browser first; Supabase is the shared org backend.

## Data flow

1. **Read** — UI always reads from IndexedDB via `repo.js` (in-memory cache after `ensureRepoReady()`).
2. **Write** — UI writes to IndexedDB immediately, then enqueues an **outbox** row, then notifies `sync.js`.
3. **Push** — When online, `sync.js` drains the outbox FIFO against Supabase (Postgres + Storage).
4. **Pull** — Periodic / on-login / on-`online` fetch of rows with `updated_at > lastSyncAt`.
5. **Realtime** — `postgres_changes` on `jobs` / `accounts` is an optimization; correctness comes from pull + outbox.

## Revisions (optimistic locking)

Each job section (`survey`, `design`, `golive`) and account `call_flow` has an integer `*_rev`.

Client update protocol:

```text
UPDATE jobs SET survey = :payload, survey_rev = :baseRev WHERE id = :id
```

The `bump_job_revs` trigger:

- If the JSON changed and the client sent the **same** rev as stored → accept and bump rev by 1.
- If the client sent a **different** rev → raise `conflict:<section>` (`P0001`).

Never last-write-wins across human edits. Never auto-merge.

## Conflicts

On `conflict:<section>`:

1. Outbox entry is marked `conflicted` (not deleted).
2. Local job record gets `conflicts[section] = { server, serverRev, local }`.
3. UI shows a banner + `ConflictReview` modal: **Keep mine** (re-enqueue with server rev as base) or **Take theirs** (replace local payload, clear conflict).

Pending outbox entries or conflicts block pull from clobbering that entity.

## Outbox entry types

| Type | Purpose |
|------|---------|
| `job.create` | Insert job row |
| `job.section` | Push one section + baseRev |
| `job.meta` | Stage, assignee, dates, customer/site |
| `job.softDelete` | Set `deleted_at` |
| `account.create` / `account.update` / `account.softDelete` | Account equivalents |
| `photo.upload` | Upload blobs to `job-photos` bucket + insert `photos` rows |

## Soft deletes

Jobs and accounts use `deleted_at`. Clients filter `deleted_at is null`. Hard SQL `DELETE` is admin-only via RLS.

## Auth / offline

- Magic-link (OTP) only.
- Profile + org via `create_org` / `accept_invite` RPCs.
- Session/profile cached in IndexedDB `meta` so a signed-in device works offline after first login.
- Without `VITE_SUPABASE_*`, the app runs fully local (no auth gate).

## Security

All authorization is Postgres RLS (`current_org()`). Client role checks are UI-only.

See `supabase/migrations/0001_init.sql` for schema, policies, triggers, and storage rules.
