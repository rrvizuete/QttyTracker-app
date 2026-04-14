# AGENTS.md

## Purpose
This repository contains a web app for managing construction project budgets and progress. The app is intended to start as a test deployment for colleagues and later evolve into a production-ready company application.

All contributors and coding agents must follow these instructions.

## Product Summary
Build a React + Tailwind + Supabase application with:
- secure authentication
- role-based access
- project management
- budget upload/input
- progress tracking
- dashboards

## Primary Technical Stack
- React
- Tailwind CSS
- TypeScript preferred
- Supabase for database, auth, and authorization
- Vercel for deployment

## Architectural Principles

### 1. Keep the frontend and backend responsibilities clean
- Frontend handles UI, navigation, forms, and charts
- Supabase handles auth, data persistence, and row-level access control
- Do not rely only on frontend checks for security

### 2. Keep the schema relational and explicit
- Prefer normalized tables over loose JSON blobs
- Define clear foreign keys and constraints
- Avoid storing important business data in unstructured fields unless necessary

### 3. Security first
- Enforce access rules with Supabase Row Level Security
- Never expose secret keys in frontend code
- Only public anon keys may be used in client-side code
- Service role keys must never be committed or used in the browser

### 4. Favor maintainability over cleverness
- Write readable code
- Keep components modular
- Avoid overly abstract patterns too early
- Prefer simple and explicit implementations for V1

## Code Standards

### General
- Use TypeScript where practical
- Use clear naming
- Keep files focused and reasonably small
- Avoid duplication when it improves maintainability

### React
- Use functional components
- Prefer hooks
- Keep page components separate from reusable UI components
- Use controlled forms for important data entry
- Keep state management simple unless complexity clearly requires more

### Styling
- Use Tailwind utility classes
- Aim for a professional, modern, clean UI
- Prefer consistency over visual experimentation
- Use spacing, typography, and layout systematically
- Avoid inline styles unless necessary

### Data Access
- Centralize Supabase client setup
- Centralize data-access helpers where useful
- Validate assumptions before writes
- Handle loading, error, and empty states clearly

## Folder Guidance
A suggested structure:

- src/
  - app/ or pages/
  - components/
  - features/
  - lib/
  - hooks/
  - types/
  - utils/

If using Vite, keep the structure simple and scalable.

## Role Model
Initial roles:
- admin
- engineer
- viewer

Assume project-scoped permissions unless a feature clearly requires global admin rights.

## V1 Functional Priorities
Build in this order unless instructed otherwise:
1. project scaffold
2. auth
3. project management
4. budget items
5. progress updates
6. dashboards
7. permissions hardening
8. UI polish

## Database Guidance
Expected tables include:
- profiles
- projects
- project_members
- budget_items
- progress_updates

Recommended practices:
- add created_at and updated_at timestamps
- use UUIDs for primary keys where appropriate
- use foreign keys
- add indexes for common joins and filters
- define cascading behavior carefully

## Dashboard Guidance
Dashboards should prioritize clarity:
- key metric cards
- progress over time
- budget by category
- percent complete
- top-value items
- remaining work/value

Do not overcomplicate charts in V1.

## Import Guidance
Budget upload should initially support CSV first if that reduces complexity.
Excel support can be added later if needed.
Use clear validation and error messaging for imports.

## UX Guidance
The app should feel professional and easy to use by construction professionals.
Prioritize:
- clear navigation
- simple forms
- understandable tables
- obvious permissions boundaries
- responsive layout
- useful empty states

## UI Reference Rules
- Use the images in `/docs/ui-reference` as the visual reference (not all the cards in the example apply to this app)
- Follow `UI_GUIDE.md` for layout and component styling
- Match the overall feel of the reference app without copying it exactly
- Prioritize consistency, readability, and a professional enterprise look
- Reuse shared UI components wherever possible

## Testing Expectations
Before completing a task:
- verify builds pass
- verify linting passes if configured
- test the changed flow manually
- avoid breaking existing features

## Git and Delivery Guidance
- Make focused commits
- Keep PRs scoped to a single feature or phase
- Do not mix unrelated refactors with feature work
- Document setup changes in README when needed

## What to Avoid
- Do not hardcode secrets
- Do not commit environment files with real credentials
- Do not build features outside the current roadmap unless requested
- Do not introduce unnecessary complexity in V1
- Do not bypass RLS by moving sensitive logic entirely client-side

## Definition of Done
A task is done when:
- the requested feature works
- the UI is coherent
- edge cases are handled reasonably
- security assumptions are respected
- code is readable and maintainable
- setup/run instructions remain accurate