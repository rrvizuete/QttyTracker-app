# Construction Budget & Progress App - Roadmap

## Phase 0 – Project Setup
Goal: Working skeleton deployed

- Create React app (Vite)
- Add Tailwind CSS
- Setup Supabase client
- Setup environment variables
- Deploy to Vercel
- Create basic layout (navbar + pages)

DONE when:
- App runs locally and on Vercel
- Supabase connection works

## Phase 1 – Project Setup
Goal: Users can sign up and log in

- Supabase Auth integration
- Login page
- Signup page
- Session handling
- Protected routes

DONE when:
- Users can log in
- Unauthorized users cannot access app pages

## Phase 2 – Projects
Goal: Admin can create and view projects

- Projects table in database
- Project list page
- Create project form
- Project detail page
- Professional UI implemented

DONE when:
- Admin can create projects
- Projects persist in database

## Phase 3 – Budget Upload
Goal: Admin can upload itemized budget

- Budget items table
- Manual input directly on the UI
- CSV/Excel upload
- Parse and insert rows
- Display budget table

DONE when:
- Budget is stored and visible per project

## Phase 4 – Progress Tracking
Goal: Engineers update progress

- Progress updates table
- UI to edit quantities / % complete
- Link progress to budget items

DONE when:
- Engineers can update progress
- Data persists correctly

## Phase 5 – Roles & Permissions
Goal: Different user access levels

- Roles: admin, engineer, viewer
- Project membership table
- Row Level Security policies

DONE when:
- Users only see/edit allowed data

## Phase 6 – Dashboards
Goal: Visualize project performance

- Aggregate queries
- Charts (progress, cost, % complete)
- Project dashboard page

DONE when:
- Key metrics are visible and correct

## Phase 7 – Polish & UX
Goal: Professional UI

- Improve layout
- Add loading states
- Error handling
- Better forms
- Mobile responsiveness

DONE when:
- App looks clean and usable

## Phase 8 – Production Readiness
Goal: Prepare for company deployment

- Audit logging
- Data validation
- Performance improvements
- Security review

DONE when:
- App is stable and secure