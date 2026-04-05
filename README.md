# Calendar App Foundation

Production-ready foundation for a Supabase-backed calendar app using React, TypeScript, Vite, PWA support, and GitHub Pages-friendly build settings.

## What is included
- Finalized project architecture for `auth`, `calendar`, `config`, `lib`, and shared `types`.
- Supabase client wiring with safe environment checks.
- Basic auth flow (sign in, sign up, sign out).
- Full event CRUD (create, edit, delete) with polished editor sheet for desktop and mobile.
- Drag-and-drop + resize event interactions in month/week/day views.
- Supabase-persisted, user-scoped event queries and mutations compatible with RLS policies.
- Live tracked event timer with quick title input, one-active-timer enforcement, reload restoration, and start/stop synchronization.
- Recurring event support (daily/weekly/monthly/yearly, interval, optional until date).
- Automatic per-user title color grouping with stable Supabase-synced color groups.
- Demo-mode local persistence fallback when Supabase is not configured (optional mock fallback remains available via env flag).
- PWA setup (`vite-plugin-pwa`) with installable manifest and service worker registration.
- SQL schema and migration files for `events` table + RLS policies.

## Quick Start
```bash
npm install
cp .env.example .env
npm run dev
```

## Required Environment Variables
```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Optional:
```env
VITE_ENABLE_MOCK_FALLBACK=false
VITE_BASE_PATH=/calendar-app/
```

## Scripts
- `npm run dev`: Start local development.
- `npm run build`: Type-check and build for standard hosting.
- `npm run build:pages`: Build with an auto-derived GitHub Pages base path.
- `npm run deploy`: Publish `dist/` to `gh-pages` branch.

## GitHub Pages Notes
Base path resolution order:
1. `VITE_BASE_PATH` (explicit override)
2. `GITHUB_REPOSITORY` or `GH_PAGES_REPO` environment values
3. `/` fallback

The app uses `HashRouter` to avoid static-hosting route fallback issues.

## Database Setup
SQL lives under [`supabase/`](./supabase):
- `schema.sql`
- `migrations/20260402180000_init.sql`
- `migrations/20260402200000_add_running_event_support.sql`
- `migrations/20260402210000_add_recurrence_and_color_groups.sql`
- `migrations/20260402180500_seed_sample_events.sql`
- `seed.sql`

Apply migrations using Supabase CLI, then optionally run:
```sql
select public.seed_sample_events('<user-uuid>');
```
