# SPEC.md

## Project Name
Construction Budget & Progress App

## Purpose
Build a web application for managing the budget and construction progress of construction projects. The app must allow different users to log in with different permissions, manage project budgets, update installed quantities/progress, and visualize project performance through dashboards.

## Core Problem
Construction project budget and progress tracking is often fragmented across spreadsheets, emails, and disconnected reports. This app centralizes the budget, progress updates, and dashboards in one system with role-based access.

## Target Users
- Admin
- Engineer
- Viewer / Manager

## User Roles

### Admin
- Create and manage projects
- Create and manage users and permissions
- Upload or manually input itemized project budgets
- Edit budget items
- View all dashboards and data
- Manage project membership

### Engineer
- Access assigned projects
- View budget items for assigned projects
- Enter or update progress quantities or percent complete
- View dashboards relevant to assigned projects
- Cannot manage global settings or other users

### Viewer / Manager
- Read-only access to assigned projects
- View dashboards, summaries, and reports
- Cannot modify project data

## Core Features

### 1. Authentication
- Secure login/logout
- Role-based access control
- Protected routes
- Session persistence

### 2. Project Management
- Create projects
- Edit project metadata
- Archive or deactivate projects
- Assign users to projects with a role

### 3. Budget Management
- Admin can manually create budget items
- Admin can upload itemized budget from CSV or Excel
- Budget items should support:
  - item code
  - description
  - unit
  - budget quantity
  - unit cost
  - total budget
  - optional grouping/category
- Budget data is stored in the database and linked to a project

### 4. Progress Tracking
- Engineers can submit progress updates against budget items
- Progress updates should support:
  - reporting date
  - installed quantity
  - optional percent complete
  - remarks / notes
- App should maintain a history of progress updates
- Current progress can be computed from the latest update or aggregated from updates, depending on implementation

### 5. Dashboards
Provide dashboards at project level showing at least:
- total budget
- total installed quantity
- percent complete
- cost breakdown by category
- progress over time
- remaining quantity / value
- top budget items by value
- summary cards and charts

### 6. Data Security
- Users only access projects they are assigned to
- Only admins can upload/edit budgets
- Engineers can only modify progress data they are allowed to edit
- Viewers have read-only access
- Security should be enforced in the backend/database, not only in the frontend

## Non-Goals for V1
- Enterprise SSO
- Offline mode
- Mobile app
- Full ERP/accounting integration
- Complex scheduling integration
- Approval workflows
- Advanced reporting exports beyond basic CSV if needed

## Recommended Tech Stack
- Frontend: React
- Styling: Tailwind CSS
- Backend platform: Supabase
- Database: PostgreSQL via Supabase
- Authentication: Supabase Auth
- Authorization: Row Level Security (RLS)
- Deployment: On hold during current phase (local-first)

## Suggested Data Model
Main entities:
- profiles
- projects
- project_members
- budget_items
- progress_updates
- optional categories
- optional attachments
- optional audit_log

## Data Relationships
- A project has many budget items
- A project has many project members
- A budget item belongs to one project
- A budget item has many progress updates
- A user can belong to many projects
- A project member record stores the user role for that project

## V1 Success Criteria
The first usable version is successful when:
1. Users can log in securely
2. Admin can create a project
3. Admin can upload or enter a budget
4. Engineers can add progress updates
5. Dashboards reflect budget and progress data accurately
6. Role-based permissions work correctly
7. The app can be shared with colleagues through a deployed test URL

## UX Goals
- Clean and professional appearance
- Simple navigation
- Fast forms and editable tables
- Clear dashboard visuals
- Easy onboarding for non-technical project users

## Future Enhancements
- Change orders
- Earned value analysis
- Approval workflows
- File attachments and supporting documents
- Import templates
- Audit history
- Notifications
- Company SSO
- Production hardening for enterprise deployment