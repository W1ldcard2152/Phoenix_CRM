# Phoenix CRM

Auto repair shop CRM for a German vehicle specialist. Manages customers, vehicles, work orders, appointments, invoices, quotes, and parts inventory.

## Tech Stack

- **Frontend**: React 18 + React Router v6, Tailwind CSS + Bootstrap, Axios, Formik/Yup, jsPDF
- **Backend**: Node.js/Express, MongoDB/Mongoose, JWT (HTTP-only cookies), Passport.js (Google OAuth)
- **External Services**: AWS S3 (media), SendGrid (email), Twilio (SMS), Google Gemini (all AI: receipt/offer/registration image extraction, URL product extraction, duplicate detection)

## Project Structure

```
src/
├── server/
│   ├── app.js              # Express setup & middleware
│   ├── controllers/        # Request handlers
│   ├── models/             # Mongoose schemas
│   ├── routes/             # API routes
│   ├── services/           # External integrations (email, SMS, S3, AI)
│   ├── middleware/         # Error handling
│   └── utils/              # Helpers (calculations, validation, dates)
└── client/src/
    ├── pages/              # Page components by feature
    ├── components/         # Reusable UI components
    ├── contexts/           # AuthContext for state
    ├── services/           # API client services
    └── utils/              # Formatters, PDF utils
```

## Key Models

- **Customer**: Contact info, communication preferences, linked vehicles
- **Vehicle**: Year/make/model/VIN, mileage history, service history
- **WorkOrder**: Core entity - parts, labor, service packages, media, status tracking, technician assignment
- **Appointment**: Scheduling with technician, reminders, multi-day support
- **Invoice**: Generated from work orders, payment tracking, line items (types: Part, Labor, Service)
- **Quote**: Estimates that convert to work orders
- **InventoryItem**: Stock tracking with unit conversion, package tags, adjustment log audit trail
- **ServicePackage**: Tag-based service bundles (e.g., "Oil Change") with flat-rate pricing and included items matched by `packageTag`
- **Part**: Catalog with cost/price/vendor tracking
- **User**: Roles (admin, management, service-writer, technician), Google OAuth support

## Work Order Statuses

`Scheduled` → `Inspected` → `Awaiting Approval` → `Parts Ordered` → `In Progress` → `Repair Complete - Awaiting Payment` → `Ready for Pickup` → `Completed`

## Important Patterns

### Error Handling
- `AppError` class for operational errors (`src/server/utils/appError.js`)
- `catchAsync` wrapper for async handlers (`src/server/utils/catchAsync.js`)
- Global error middleware in `src/server/middleware/errorHandler.js`

### Authentication
- JWT in HTTP-only cookies (XSS protection)
- `protect` middleware validates JWT and user status
- `restrictTo('admin', 'management')` for role-based access
- Google OAuth via Passport.js

### Timezone / Date Handling
- All dates stored as UTC in MongoDB, converted at boundaries
- `convertDates` middleware (`src/server/middleware/convertDates.js`) automatically converts `req.body` date strings to UTC before controllers run — **do not manually convert dates in controllers**
- Naive datetime strings (e.g. `"2026-03-14T10:30:00"`, no Z/offset) on any field → converted to UTC Date
- Named date-only fields (`effectiveFrom`, `oneTimeDate` → start-of-day; `effectiveUntil` → end-of-day) → converted to UTC Date
- Frontend sends local-timezone strings; backend receives them already as UTC Date objects
- For display: `moment.utc(date).tz(TIMEZONE)` (server: `src/server/config/timezone.js`, client: `src/client/src/utils/formatters.js`)
- Date-only utilities available in `src/server/utils/dateUtils.js` (parseLocalDate, buildDateRangeQuery, etc.)

### Cost Calculations
Use `src/server/utils/calculationHelpers.js` for all pricing:
- Parts: price × quantity
- Labor: rate × quantity (supports hourly or fixed billing)
- Service Packages: flat-rate price per package
- `calculateWorkOrderTotal(parts, labor, servicePackages)` — always pass all three arrays
- Totals calculated server-side for consistency

### Service Packages & Inventory
- **Tag-based matching**: ServicePackage `includedItems` reference items by `packageTag` string (e.g., "Motor Oil"), not by ObjectId. InventoryItem has a `packageTag` field for matching.
- **Draft/commit workflow**: Adding a package to a WO creates an uncommitted draft (`committed: false`) — no inventory impact. "Pull from Inventory" commits it: validates QOH, atomically deducts stock, sets `committed: true`.
- **Removal**: Removing a committed package prompts whether to return items to inventory. Removing a draft just deletes.
- **WorkOrder sub-document**: `servicePackages: [ServicePackageLineSchema]` — separate from parts and labor arrays. Each line has `name`, `price`, `committed`, and `includedItems` (with `inventoryItemId`, `name`, `quantity`, `cost`).
- **Atomic deduction**: Uses `findOneAndUpdate` with `quantityOnHand: { $gte: qty }` guard to prevent race conditions.
- **Package tags managed in Settings**: `Settings.packageTags` array, admin-managed via `/api/settings/package-tags`.

### API Response Format
```javascript
{ status: 'success', data: { ... }, message: '...' }
```

### Model Relationships
- Customer → many Vehicles
- Vehicle → many WorkOrders
- WorkOrder → many Appointments, Media, Invoices, ServicePackageLines
- Appointment → one Technician, one WorkOrder
- ServicePackage → many includedItems (matched by packageTag to InventoryItem)
- InventoryItem → referenced by WorkOrder parts (`inventoryItemId`) and service package items

## Commands

```bash
npm run dev          # Run both client & server (concurrently)
npm run dev:server   # Server only (nodemon)
npm run dev:client   # Client only
npm run build        # Build client for production
```

## Codebase Knowledge Graph (Graphify)

[Graphify](https://github.com/safishamsi/graphify) is installed (PyPI package `graphifyy`; CLI at `C:\Users\Wildc\AppData\Roaming\Python\Python312\Scripts\graphify.exe`, also available as the `/graphify` skill). A pre-built graph of this codebase lives in `graphify-out/` (gitignored).

Use it to answer architecture/relationship questions before grepping:

```bash
graphify query "<question>"          # BFS context retrieval from the graph
graphify explain "<symbol or file>"  # node + its callers/callees (function nodes use "name()" form)
graphify path "A" "B"                # shortest path between two symbols
graphify affected "<symbol>"         # reverse impact analysis
graphify update .                    # rebuild after code changes (local AST only, no API calls)
```

The graph records the commit it was built from (see `graphify-out/GRAPH_REPORT.md`) — run `graphify update .` if it's stale.

## Environment Variables

Required in `.env`:
- `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`, `AWS_REGION`
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `GEMINI_API_KEY` (optional `GEMINI_MODEL`, defaults to `gemini-2.5-flash` for dup-detection/registration; optional `GEMINI_EXTRACT_MODEL` defaults to `gemini-2.5-flash` for receipt + offer-screenshot extraction; `extractFromUrl` hardcodes `gemini-2.5-pro`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## Naming Conventions

- Models: PascalCase singular (`WorkOrder`, not `WorkOrders`)
- Routes: kebab-case plural (`/api/work-orders`)
- Controllers/Services: PascalCase with suffix (`workOrderController`)
- Variables/functions: camelCase

## Security

- Helmet.js for HTTP headers
- express-mongo-sanitize for NoSQL injection
- XSS sanitizer middleware
- Rate limiting on auth endpoints
- CORS with credentials
- Password reset tokens expire in 10 minutes

## Changelog

`CHANGELOG.md` (repo root) tracks user-visible changes by deploy date (push-to-main = deploy). The app is continuously deployed, so versioning is calver-by-date, not semver.

**When the user asks you to write a commit message, also update `CHANGELOG.md` in the same edit pass:**

- Add entries under today's date (`YYYY-MM-DD`) at the top of the file. If today's section already exists, append to it instead of creating a duplicate.
- Group entries under **Added** / **Changed** / **Fixed** / **Removed**. Skip empty subsections.
- One bullet per user-visible change. Condense related implementation details into a single bullet — don't mirror the commit message line-for-line.
- Phrase from the user's perspective ("Receipt importer now lets users override the AI's duplicate guess") not the implementation's ("Added override prop to ReceiptImportModal").
- Skip purely internal refactors with no behavioral impact (internal variable renames, restructuring without behavior change, test-only changes).
- Bugfixes go under **Fixed** and should describe the symptom that was wrong, not just the code that changed.
