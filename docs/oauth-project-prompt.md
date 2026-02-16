# Google OAuth + User Role System — Implementation Prompt

## Context

Phoenix CRM is a Node.js/Express/MongoDB/React auto repair shop management system. It currently uses single-user email/password authentication (bcrypt + JWT). We need to add Google OAuth as the primary login method, add a User-to-Technician linking mechanism, and build an admin panel for managing authorized users.

**CRITICAL: Database safety is paramount.** Customer, Vehicle, WorkOrder, Appointment, and Parts data is production data and must not be modified or put at risk. Run `node scripts/backup-database.js` before starting any work. The only collection that should change is `users`. All other collections remain untouched.

## Current State

### User Model (`src/server/models/User.js`)
```
- name (String, required)
- email (String, required, unique, lowercase)
- password (String, required, 8+ chars, bcrypt hashed)
- passwordConfirm (String, virtual validation)
- role (String, enum: ['admin', 'technician', 'service-writer', 'parts-manager'], default: 'technician')
- passwordChangedAt, passwordResetToken, passwordResetExpires (password reset flow)
- active (Boolean, default: true)
```
Has instance methods: `correctPassword()`, `changedPasswordAfter()`, `createPasswordResetToken()`.

### Technician Model (`src/server/models/Technician.js`)
Separate entity — NOT linked to User:
```
- name, phone, email, specialization, hourlyRate, isActive, notes
```
Referenced by `WorkOrder.assignedTechnician` and `Appointment.technician` throughout the app. **Do NOT merge Technician into User.** Instead, add a link from User to Technician.

### Auth Controller (`src/server/controllers/authController.js`)
- `signup`, `login`, `logout` — email/password based
- `protect` middleware — JWT verification, sets `req.user`
- `restrictTo(...roles)` middleware — role-based access
- JWT issued on login, stored in cookie + sent in response

### Auth Routes (`src/server/routes/authRoutes.js`)
- POST `/api/users/signup`, `/api/users/login`, `/api/users/logout`
- GET `/api/users/me`
- PATCH `/api/users/updateMe`, `/api/users/updateMyPassword`
- POST `/api/users/forgotPassword`, `/api/users/resetPassword/:token`

### Client-Side Auth
- Login page: `src/client/src/pages/Auth/Login.jsx`
- Register page: `src/client/src/pages/Auth/Register.jsx`
- Auth context/service: `src/client/src/services/authService.js`
- Protected routes in `src/client/src/App.jsx`

### Environment
- Server: Express on port 5000, MongoDB Atlas
- Client: React (CRA) on port 3000
- `.env` has `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_URL`
- Rate limiting on auth endpoints already in place (`src/server/app.js`)

## Requirements

### Phase 1: Google OAuth Backend

1. **Install dependencies**: `passport`, `passport-google-oauth20`, `express-session` (or continue using JWT — your call on what's cleaner, but JWT is the current pattern)

2. **Add Google OAuth fields to User model** (additive only, no field removals):
   - `googleId` (String, unique, sparse) — Google's unique user ID
   - `avatar` (String) — Google profile picture URL
   - `technician` (ObjectId, ref: 'Technician', sparse) — links this user to a Technician record
   - `status` (String, enum: ['pending', 'active', 'disabled'], default: 'pending') — for the invitation flow
   - Keep `password` as optional (no longer required) since OAuth users won't have one
   - Keep existing email/password auth working as a fallback

3. **Add Google OAuth env vars** to `.env.example`:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_CALLBACK_URL` (default: `http://localhost:5000/api/auth/google/callback`)

4. **Implement OAuth routes**:
   - GET `/api/auth/google` — initiates Google OAuth flow
   - GET `/api/auth/google/callback` — handles Google callback
   - The callback should:
     a. Check if a User exists with this `googleId` — if yes, log them in
     b. If no `googleId` match, check if a User exists with this email — if yes, link `googleId` and log in
     c. If no User exists with this email, check if the email is in the authorized/pending users list — if yes, create the User record and log in
     d. If none of the above, reject with "Not authorized — contact your administrator"
   - After successful auth, issue a JWT (same as current pattern) and redirect to the client app

5. **Keep existing email/password login working** — don't break the current flow. Some users (like the admin) may want to use password auth as a fallback.

### Phase 2: Admin User Management

1. **Admin routes** (restricted to role='admin'):
   - GET `/api/admin/users` — list all users
   - POST `/api/admin/users` — pre-authorize a new user (email + role + optional technician link)
   - PATCH `/api/admin/users/:id` — update role, status, technician link
   - DELETE `/api/admin/users/:id` — deactivate user (soft delete via `active: false`)

2. **Admin panel page** (client-side):
   - Table of all users: name, email, role, status, linked technician, last login
   - "Add User" form: email, role dropdown, optional technician dropdown (pulls from existing Technician records)
   - Edit user: change role, link/unlink technician, activate/deactivate
   - Add route in `App.jsx`, restrict to admin role

### Phase 3: Client-Side OAuth Integration

1. **Login page** (`src/client/src/pages/Auth/Login.jsx`):
   - Add a "Sign in with Google" button above or below the existing email/password form
   - Button triggers: `window.location.href = '/api/auth/google'`
   - Keep email/password form as secondary option

2. **Handle OAuth redirect**:
   - After Google callback, the server redirects to something like `/auth/callback?token=<JWT>`
   - Client catches this route, stores the token, and redirects to the dashboard
   - Update `authService.js` to handle this flow

3. **Auth context updates**:
   - `req.user` should now include `role`, `technician` (if linked), and `avatar`
   - Update the user menu/header to show Google avatar if available
   - Ensure role-based UI restrictions work (e.g., technicians can't see admin panel)

### Phase 4: Role-Based Access

1. **Sidebar/Navigation** — show/hide menu items based on role:
   - Admin: everything + admin panel
   - Service Writer: everything except admin panel
   - Technician: Technician Portal, limited WO access
   - Parts Manager: Parts pages, limited WO access

2. **API-level enforcement** — use existing `restrictTo()` middleware on sensitive routes

## Important Constraints

- **DO NOT modify** Customer, Vehicle, WorkOrder, Appointment, Part, or any non-User collection
- **DO NOT remove** any existing User model fields — only add new ones
- **DO NOT remove** email/password auth — keep it as a fallback
- **DO NOT modify** the Technician model — only add a `technician` ref field on User
- The existing `assignedTechnician` field on WorkOrder and `technician` field on Appointment continue to reference the Technician model, not User
- Run `node scripts/backup-database.js` before starting work
- All existing API endpoints must continue to work

## File Reference

Key files to read before starting:
- `src/server/models/User.js`
- `src/server/models/Technician.js`
- `src/server/controllers/authController.js`
- `src/server/routes/authRoutes.js`
- `src/server/middleware/` (any auth middleware)
- `src/client/src/pages/Auth/Login.jsx`
- `src/client/src/pages/Auth/Register.jsx`
- `src/client/src/services/authService.js`
- `src/client/src/App.jsx` (routing + protected routes)
- `src/client/src/components/layout/Sidebar.jsx` (navigation)
- `.env.example`
