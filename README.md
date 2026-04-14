# QttyTracker App

Prototype of a construction budget and progress tracking web app built with React, TypeScript, Tailwind CSS, and Supabase.

## Stage 1 Scaffold (Current)

This repository now includes a reusable base application shell and styling system inspired by the UI references in `docs/ui-reference` and the rules in `docs/UI_GUIDE.md`:

- Sidebar navigation shell
- Top header with project context/actions
- Reusable KPI dashboard card style
- Reusable table style for budget/progress data
- Reusable form input and button styles
- Shared spacing + typography system
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

1. Copy and edit environment values:

```bash
cp .env.example .env
```

2. Set your Supabase project values in `.env`:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## Run Locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite (usually `http://localhost:5173`).

## Test/Validation Commands (Testing Environment)

Use these commands in CI or a test environment to validate the scaffold:

```bash
npm install
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

- Add Supabase Auth flows (login/signup/session handling)
- Add route protection and role-aware layout behavior
- Connect dashboard widgets to real project-level queries
