# Quantities Manager

Prototype of a construction budget and progress tracking web app built with React, TypeScript, Tailwind CSS, and Supabase.

## Stage 3 – Phase 2 Projects (Current)

This repository now includes the Phase 2 foundation from the roadmap:

- Sign in / sign up UI with controlled forms
- Session bootstrapping on app load
- User profile provisioning into `profiles` with default admin access
- Protected app shell with Projects and Dashboard sections
- Project list and create form connected to Supabase
- Centralized Supabase client bootstrap (`src/lib/supabase.ts`)

## Tech Stack

- React 18
- TypeScript
- Tailwind CSS
- Vite
- Supabase JS client

## Prerequisites

- Node.js 20+
- npm 10+

## Environment Setup

1. Open `.env.local` (committed as a placeholder template) and paste your real Supabase values.
2. `.env.example` contains the same required keys for quick reference.
3. Restart `npm run dev` after changing env values.

Required variables:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## Database Setup

Run the SQL migration below in the Supabase SQL editor to create the `profiles` table used for access-level provisioning:

- `supabase/migrations/20260414_create_profiles.sql`

## Run Locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite (usually `http://localhost:5173`).

## Test/Validation Commands

```bash
npm run lint
npm run test
npm run build
```

## Available Scripts

- `npm run dev` - Start local development server
- `npm run lint` - Run ESLint checks
- `npm run test` - Run Vitest (non-watch)
- `npm run build` - Type-check and build production bundle
- `npm run preview` - Preview production build locally

## Suggested Next Stage

- Continue refining project detail and membership assignment flows
- Connect project CRUD to Supabase tables
- Introduce role-aware project access policies
