# Snyder's Gutters CRM

Gutter cleaning and pressure washing business CRM for **Snyder's Gutters & Pressure Washing Services**. Manages customers, properties, work orders, appointments, invoices, quotes, and supplies inventory.

---

## Relationship to Phoenix CRM

This is a **domain fork** of Phoenix CRM (auto repair shop CRM). Both codebases share identical infrastructure and patterns, kept intentionally in sync for future consolidation into a multi-tenant platform.

### Files/patterns that MUST stay synchronized with Phoenix CRM

Any change to the following in Phoenix CRM should be evaluated and ported here (and vice versa):

| Area | Files |
|------|-------|
| Auth system | `src/server/config/passport.js`, `src/server/controllers/authController.js`, `src/server/routes/authRoutes.js`, `src/server/routes/oauthRoutes.js`, `src/server/models/User.js` |
| Error handling | `src/server/utils/appError.js`, `src/server/utils/catchAsync.js`, `src/server/middleware/errorHandler.js` |
| Date/timezone | `src/server/middleware/convertDates.js`, `src/server/utils/dateUtils.js`, `src/server/config/timezone.js` |
| Security middleware | Helmet, mongoSanitize, XSS, rate limiting, CORS stack in `src/server/app.js` |
| External services | `src/server/services/emailService.js`, `src/server/services/twilioService.js`, `src/server/services/s3Service.js`, `src/server/services/cacheService.js` |
| Calculation pattern | `src/server/utils/calculationHelpers.js` (structure identical; field names adapted) |
| Role system | admin, management, service-writer, technician — same roles, same `protect`/`restrictTo` middleware |
| API response format | `{ status: 'success', data: { ... }, message: '...' }` |

### Files replaced by domain-specific equivalents (do NOT back-port to Phoenix)

- `Vehicle` → `Property` model (different fields, same relationship pattern)
- Work order status enum (different business workflow — no diagnostics/parts-ordering cycle)
- Service package names and default inventory categories
- Settings defaults (vendors, categories, package tags)
- `Part` model removed entirely (no automotive parts catalog; all supply tracking via `InventoryItem`)

---

## Tech Stack

- **Frontend**: React 18 + React Router v6, Tailwind CSS + Bootstrap, Axios, Formik/Yup, jsPDF
- **Backend**: Node.js/Express, MongoDB/Mongoose, JWT (HTTP-only cookies), Passport.js (Google OAuth)
- **External Services**: AWS S3 (job photos/media), SendGrid (email), Twilio (SMS)

---

## Project Structure

```
src/
├── server/
│   ├── app.js              # Express setup & middleware
│   ├── controllers/        # Request handlers
│   ├── models/             # Mongoose schemas
│   ├── routes/             # API routes
│   ├── services/           # External integrations (email, SMS, S3, cache)
│   ├── middleware/         # Error handling, date conversion, ownership
│   ├── config/             # Passport, timezone
│   ├── jobs/               # Background jobs (appointment reminders)
│   └── utils/              # Helpers (calculations, validation, dates)
└── client/src/
    ├── pages/              # Page components by feature
    ├── components/         # Reusable UI components
    ├── contexts/           # AuthContext for state
    ├── services/           # API client services (thin axios wrappers)
    ├── hooks/              # Custom React hooks
    └── utils/              # Formatters, PDF utils, permissions
```

---

## Key Models

### Customer

Contact info, communication preferences, linked properties. Nearly identical to Phoenix.

| Field | Type | Notes |
|-------|------|-------|
| `name` | String, required | |
| `phone` | String, required | |
| `email` | String | Validated, lowercase |
| `address` | Object | street, city, state, zip — **billing/mailing address**, not service address |
| `properties` | [ObjectId] | Refs to Property (replaces Phoenix's `vehicles` array) |
| `communicationPreference` | Enum | SMS, Email, Phone, None |
| `notes` | String | |

**Indexes:** name, email, phone  
**Virtuals:** `fullAddress`  
**Methods:** `getMostRecentProperty()`

---

### Property

Replaces `Vehicle` from Phoenix CRM. Represents a **serviceable location** — a physical address where work is performed.

| Field | Type | Notes |
|-------|------|-------|
| `customer` | ObjectId, required | Ref to Customer |
| `address` | Object, required | street, city, state, zip — the **service address** (may differ from customer billing address) |
| `propertyType` | Enum | `residential`, `commercial` |
| `stories` | Number | Min: 1. Affects labor pricing — upper-story work adds time and risk |
| `estimatedGutterLinearFeet` | Number | Min: 0. Primary quoting dimension for gutter jobs |
| `roofType` | Enum | `asphalt`, `metal`, `tile`, `flat`, `other`. Affects pressure wash PSI approach |
| `lotSize` | String | Free text: "0.25 acres", "2,500 sq ft" |
| `notes` | String | Persistent notes: access codes, dog info, special instructions |
| `lastServiceDate` | Date | Updated automatically when a WO reaches Complete/Invoiced |
| `serviceHistory` | [ObjectId] | Refs to WorkOrder |

**Indexes:** customer, address.zip, address.city  
**Virtuals:** `displayAddress` (formatted "123 Main St, Anytown, OH 44444")  
**Methods:** `getLatestWorkOrder()`

**Key difference from Vehicle:** No mileage tracking. No VIN. The address IS the identity of the property — use address uniqueness checks when creating new properties for a customer.

---

### WorkOrder

Core entity — tracks service delivery from initial quote through invoicing.

| Field | Type | Notes |
|-------|------|-------|
| `property` | ObjectId | Ref to Property (replaces Phoenix `vehicle`) |
| `customer` | ObjectId, required | Ref to Customer |
| `date` | Date | Job date, default: now |
| `priority` | Enum | Low, Normal, High, Urgent |
| `status` | Enum | See Status Flow below |
| `statusChangedAt` | Date | Auto-tracked on status change |
| `holdReason` | Enum | `weather-delay`, `customer-request`, `access-issue`, `equipment-issue`, `other` |
| `holdReasonOther` | String | Free text when holdReason = 'other' |
| `services` | [{description}] | Service types requested (e.g., "Gutter Clean", "Driveway Pressure Wash") |
| `serviceNotes` | String | General notes about the job scope |
| `completionNotes` | String | Notes added when marking job Complete |
| `materials` | [MaterialSchema] | Supplies used — see below |
| `labor` | [LaborSchema] | Identical to Phoenix |
| `servicePackages` | [ServicePackageLineSchema] | Identical to Phoenix |
| `media` | [MediaSchema] | Pre-Service, In-Progress, Post-Service, Other |
| `assignedTechnician` | ObjectId | Ref to Technician |
| `createdBy` | ObjectId | Ref to User |
| `invoice` | ObjectId | Ref to Invoice |
| `appointments` | [ObjectId] | Refs to Appointment |
| `totalEstimate`, `totalActual` | Number | |

**MaterialSchema** (replaces Phoenix's PartSchema — auto-specific fields removed):

| Field | Type | Notes |
|-------|------|-------|
| `name` | String, required | |
| `partNumber` | String | Supplier SKU |
| `quantity` | Number, required | Min: 1 |
| `price` | Number | Min: 0 |
| `cost` | Number | Min: 0 |
| `vendor` | String | |
| `notes` | String | Internal notes |
| `warranty` | String | Customer-facing warranty info |
| `category` | String | |
| `inventoryItemId` | ObjectId | Ref to InventoryItem |

*Removed from Phoenix PartSchema:* `coreCharge`, `coreChargeInvoiceable`, `vin`, `stockNumber`, `itemNumber`, `ordered`, `received`, `purchaseOrderNumber`, `receiptImageUrl`, `serviceIncluded`

**LaborSchema** — identical to Phoenix:

| Field | Type | Notes |
|-------|------|-------|
| `description` | String, required | |
| `billingType` | Enum | `hourly`, `fixed` |
| `quantity` | Number, required | Hours if hourly, else 1 |
| `rate` | Number, required | Per-hour rate or flat fee |

**MediaSchema types:** `Pre-Service`, `In-Progress`, `Post-Service`, `Other`  
*(Phoenix types Pre-Inspection, Diagnostic, Parts Receipt, Post-Inspection replaced with job-flow equivalents)*

**Indexes:** property, customer, status, date  
**Virtuals:** `materialsCost`, `laborCost`, `servicePackagesCost`, `totalCost`  
**Methods:** `updateStatus(newStatus, notes)`

---

### Appointment

Scheduling with technician, reminders, multi-day support for large jobs.

| Field | Type | Notes |
|-------|------|-------|
| `customer` | ObjectId, required | |
| `property` | ObjectId | Ref to Property (replaces Phoenix `vehicle`) |
| `serviceType` | String, required | |
| `details` | String | |
| `startTime` | Date, required | |
| `endTime` | Date, required | |
| `technician` | ObjectId | |
| `notes` | String | |
| `status` | Enum | Scheduled, Confirmed, In Progress, Completed, Cancelled, No-Show |
| `workOrder` | ObjectId | |
| `reminder` | Object | sent (Boolean), sentAt (Date) |
| `followUp` | Object | sent (Boolean), sentAt (Date) |

**Statics:** `checkConflicts(startTime, endTime, technician, excludeId)`  
**Methods:** `createWorkOrder()` — creates linked WorkOrder with status Appointment Scheduled  
**Virtuals:** `durationHours`

---

### Invoice

Generated from work orders, payment tracking.

| Field | Type | Notes |
|-------|------|-------|
| `invoiceNumber` | String, required, unique | |
| `customer` | ObjectId, required | |
| `property` | ObjectId, required | Replaces Phoenix `vehicle` |
| `workOrder` | ObjectId | |
| `invoiceDate` | Date | |
| `dueDate` | Date, required | |
| `items` | [InvoiceItemSchema] | type Enum: `Supply`, `Labor`, `Service` (replaces Phoenix `Part`, `Labor`, `Service`) |
| `subtotal`, `taxRate`, `taxAmount`, `total` | Number | |
| `status` | Enum | Draft, Issued, Paid, Partial, Overdue, Cancelled, Refunded |
| `paymentTerms` | Enum | Due on Receipt, Net 15, Net 30, Net 60 |
| `payments` | [PaymentSchema] | date, amount, method (Cash/Credit Card/Check/Bank Transfer/Other), reference, notes |
| `notes`, `terms` | String | |

**Methods:** `addPayment(paymentData)`, `calculateTotals()`, `generatePDF()`  
**Virtuals:** `isOverdue`, `amountPaid`, `amountDue`

---

### Quote

Shares the WorkOrder model with a `Quote` status. Same pattern as Phoenix — quotes convert to work orders, can be archived.

---

### InventoryItem

Supplies and materials stock tracking. Identical structure to Phoenix; domain-specific categories and package tags.

| Field | Type | Notes |
|-------|------|-------|
| `name` | String, required | |
| `partNumber` | String | Supplier SKU |
| `category` | String | See default categories in Settings |
| `price`, `cost` | Number | Min: 0 |
| `vendor`, `brand`, `warranty`, `url` | String | |
| `quantityOnHand` | Number | Min: 0 |
| `unit` | String | default: 'each' |
| `unitsPerPurchase` | Number | For bulk items (e.g., 5-gallon cleaning solution = 5 gallons per purchase) |
| `purchaseUnit` | String | e.g., 'gallon' |
| `reorderPoint` | Number | Low-stock threshold |
| `packageTag` | String | Links item to service packages by tag (e.g., 'Cleaning Solution', 'Micro Guard') |
| `notes` | String | |
| `isActive` | Boolean | |
| `adjustmentLog` | [AdjustmentLogSchema] | Audit trail: adjustedBy, previousQty, newQty, reason |

**Default inventory categories:** `Gutter Guards`, `Downspout Hardware`, `Fasteners & Sealants`, `Cleaning Supplies`, `Pressure Wash Equipment`, `Miscellaneous`

---

### ServicePackage

Tag-based service bundles with flat-rate pricing. Identical structure to Phoenix.

| Field | Type | Notes |
|-------|------|-------|
| `name` | String, required | |
| `description` | String | |
| `price` | Number, required | Flat rate |
| `includedItems` | [{packageTag, label, quantity}] | Matched to InventoryItem by `packageTag` field |
| `isActive` | Boolean | |

**Default service packages:**
- Standard Gutter Clean
- Gutter Clean + Flush
- Gutter Guard Install
- Pressure Wash - Driveway
- Pressure Wash - House Exterior
- Pressure Wash - Deck/Patio
- Full Service - Gutters + Pressure Wash

---

### Settings (singleton)

| Field | Type / Default | Notes |
|-------|---------------|-------|
| `supplyMarkupPercentage` | Number, default: 20 | Replaces Phoenix `partMarkupPercentage` |
| `customVendors` | Array | Default: Home Depot, Menards, Lowe's, Grainger, Amazon, SiteOne, Regional Gutter Supply |
| `customCategories` | Array | Work order / service categories |
| `taskCategories` | Array | Schedule block categories (e.g., Equipment Maintenance, Drive Time, Material Pickup) |
| `inventoryCategories` | Array | Inventory item categories (see InventoryItem defaults above) |
| `packageTags` | Array | Default: Cleaning Solution, Micro Guard, Gutter Spike, Downspout Extension, Splash Block, End Cap |
| `showServiceAdvisorOnInvoice` | Boolean, default: false | |

**Statics:** `getSettings()` — singleton pattern, returns or creates single document with backfill for new fields.

---

### Supporting Models (identical to Phoenix)

| Model | Description |
|-------|-------------|
| **User** | Roles: admin, management, service-writer, technician. Google OAuth. Password reset. |
| **Technician** | name, phone, email, specialization, hourlyRate, isActive |
| **Feedback** | Technician-submitted feedback, archived state |
| **CustomerInteraction** | Call/text/email log per work order; contact type, direction, reason, outcome, follow-up tracking |
| **WorkOrderNote** | Internal and customer-facing notes per work order |
| **Media** | Photos/files attached to work orders, properties, customers. S3-backed. |
| **ScheduleBlock** | Recurring and one-time task blocks for technician calendars. `expandForDateRange()` static. |
| **FollowUp** | Task/reminder system across all entity types with note threads |

---

## Work Order Status Flow

```
Quote
  ↓
Work Order Created
  ↓
Appointment Scheduled
  ↓
In Progress
  ↓
Complete
  ↓
Invoiced
```

**Side states:** `On Hold`, `No-Show`, `Cancelled`, `Quote - Archived`

**Status semantics:**

| Status | Meaning |
|--------|---------|
| `Quote` | Estimate only — not committed. Customer has not approved. |
| `Work Order Created` | Customer approved, not yet on the calendar. |
| `Appointment Scheduled` | Job is on the calendar with a technician assigned. |
| `In Progress` | Technician is on-site. |
| `Complete` | Job done. Awaiting invoice generation / payment. |
| `Invoiced` | Invoice generated; payment tracking active. |
| `On Hold` | Paused — weather delay, access issue, customer request, or equipment issue. `holdReason` required. |
| `No-Show` | Technician arrived but could not access property (locked gate, no one home). |
| `Cancelled` | Job cancelled. |
| `Quote - Archived` | Old quote, no longer active. |

**Compared to Phoenix:** Removed the multi-stage diagnostic/parts-ordering cycle (Inspected → Awaiting Approval → Parts Ordered → Parts Received → Repair In Progress → Repair Complete - Awaiting Payment → Ready for Pickup → Completed). Gutter and pressure washing jobs do not require diagnostic approval workflows — scope is known at quoting time.

---

## Important Patterns

### Error Handling
- `AppError` class for operational errors (`src/server/utils/appError.js`)
- `catchAsync` wrapper for async handlers (`src/server/utils/catchAsync.js`)
- Global error middleware in `src/server/middleware/errorHandler.js`
- Every controller handler uses `catchAsync`
- `AppError(message, statusCode)` passed to `next()` for operational errors

### Authentication
- JWT in HTTP-only cookies (XSS protection)
- `protect` middleware validates JWT and user status
- `restrictTo('admin', 'management')` for role-based access
- Google OAuth via Passport.js

### Timezone / Date Handling
- All dates stored as UTC in MongoDB, converted at boundaries
- `convertDates` middleware (`src/server/middleware/convertDates.js`) automatically converts `req.body` date strings to UTC before controllers run — **do not manually convert dates in controllers**
- Naive datetime strings (e.g. `"2026-03-14T10:30:00"`, no Z/offset) → converted to UTC Date
- Named date-only fields (`effectiveFrom`, `oneTimeDate` → start-of-day; `effectiveUntil` → end-of-day) → converted to UTC Date
- Frontend sends local-timezone strings; backend receives them already as UTC Date objects
- For display: `moment.utc(date).tz(TIMEZONE)` (server: `src/server/config/timezone.js`, client: `src/client/src/utils/formatters.js`)
- Date-only utilities: `src/server/utils/dateUtils.js` (`parseLocalDate`, `buildDateRangeQuery`, `getDayBoundaries`)

### Cost Calculations
Use `src/server/utils/calculationHelpers.js` for all pricing:
- Materials: price × quantity
- Labor: rate × quantity (supports hourly or fixed billing)
- Service Packages: flat-rate price per package
- `calculateWorkOrderTotal(materials, labor, servicePackages)` — always pass all three arrays
- Totals calculated server-side for consistency

**Changes from Phoenix:** `calculatePartsCost` renamed to `calculateMaterialsCost`. Core charge logic removed (not applicable to gutter/pressure washing supplies).

### Service Packages & Inventory
- **Tag-based matching**: ServicePackage `includedItems` reference items by `packageTag` string (e.g., "Cleaning Solution"), not by ObjectId. InventoryItem has a `packageTag` field for matching.
- **Draft/commit workflow**: Adding a package to a WO creates an uncommitted draft (`committed: false`) — no inventory impact. "Pull from Inventory" commits it: validates QOH, atomically deducts stock, sets `committed: true`.
- **Removal**: Removing a committed package prompts whether to return items to inventory. Removing a draft just deletes.
- **WorkOrder sub-document**: `servicePackages: [ServicePackageLineSchema]` — separate from materials and labor arrays. Each line has `name`, `price`, `committed`, and `includedItems` (with `inventoryItemId`, `name`, `quantity`, `cost`).
- **Atomic deduction**: Uses `findOneAndUpdate` with `quantityOnHand: { $gte: qty }` guard to prevent race conditions.
- **Package tags managed in Settings**: `Settings.packageTags` array, admin-managed via `/api/settings/package-tags`.

### API Response Format
```javascript
{ status: 'success', data: { ... }, message: '...' }
```

### Backend Controller Pattern
- Every handler wrapped in `catchAsync`
- Updates: `{ new: true, runValidators: true }`
- Deletes return `204`
- Cache service uses `node-cache` with namespaced keys (`properties:`, `appointments:`, etc.)
- Cache invalidated on every mutation via `invalidateByPattern()`

### Client Service Pattern
- Thin axios wrappers in `src/client/src/services/`
- Import shared `API` from `./api` (baseURL `/api`, 30s timeout, `withCredentials: true`)
- Each method: `async`, try/catch, `console.error` on failure, rethrow

---

## Model Relationships

```
Customer → many Properties
Property → many WorkOrders
WorkOrder → many Appointments, Media, WorkOrderNotes, ServicePackageLines
WorkOrder → one Invoice
Appointment → one Technician, one WorkOrder
ServicePackage → many includedItems (matched by packageTag to InventoryItem)
InventoryItem → referenced by WorkOrder materials (inventoryItemId) and ServicePackageLines
User → one Technician (optional link)
```

---

## API Route Prefixes

| Prefix | Resource |
|--------|----------|
| `/api/auth` | Google OAuth callbacks |
| `/api/users` | Auth: login, signup, password reset, user management |
| `/api/customers` | Customer CRUD, search, phone check |
| `/api/properties` | Property CRUD, search, service history (replaces `/api/vehicles`) |
| `/api/workorders` | WorkOrder CRUD, quotes, status updates, materials, labor, service packages |
| `/api/appointments` | Appointment CRUD, conflict check, reminders, date range |
| `/api/invoices` | Invoice CRUD, PDF, payments, status |
| `/api/technicians` | Technician CRUD |
| `/api/inventory` | InventoryItem CRUD |
| `/api/service-packages` | ServicePackage CRUD |
| `/api/schedule-blocks` | ScheduleBlock CRUD, expansion, exceptions |
| `/api/settings` | Settings singleton read/write, package tags, categories |
| `/api/interactions` | CustomerInteraction CRUD |
| `/api/workorder-notes` | WorkOrderNote CRUD |
| `/api/media` | Media upload/delete (S3-backed) |
| `/api/feedback` | Technician feedback |
| `/api/follow-ups` | FollowUp CRUD, close/reopen, notes |
| `/api/search` | Global search |
| `/api/admin` | Admin-only operations |

**Removed from Phoenix:** `/api/vin`, `/api/registration`, `/api/ai`, `/api/parts`

---

## Calendar System

- `SwimmingLaneCalendar` is the main calendar (daily/weekly toggle)
- `DailyView` and `WeeklyView` group events by `technician._id` — items without a technician are invisible
- `AppointmentCard` renders both appointments and schedule blocks (uses `isScheduleBlock` flag)
- `AvailabilityCalendar` is embedded in appointment form for checking technician availability
- Schedule blocks are expanded server-side and merged with appointments client-side
- Conflict detection in `appointmentController.checkConflicts` checks both appointments AND schedule blocks
- Drag-and-drop rescheduling via `useDragToReschedule` hook

## Color System

`src/client/src/utils/appointmentColors.js` — status-to-color mapping:
- Blue = service writer action needed
- Yellow/Orange = technician action needed
- Green = scheduled/confirmed
- Gray = stopped (On Hold, Cancelled, No-Show)
- Purple = quote
- Indigo = schedule blocks

## Role-Based Visibility (Schedule Blocks)

- `applyScheduleBlockVisibility(block, user)` in `src/client/src/utils/permissions.js`
- Admin/Management: see full details (indigo cards)
- Service Writers: see grey "Unavailable" blocks (no title/category/reason)
- Technicians: see own tasks fully, others as grey "Unavailable"

---

## Commands

```bash
npm run dev          # Run both client & server (concurrently)
npm run dev:server   # Server only (nodemon)
npm run dev:client   # Client only
npm run build        # Build client for production
```

---

## Environment Variables

Required in `.env`:
- `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`, `AWS_REGION`
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `CLIENT_URL` (CORS origin)
- `NODE_ENV`, `PORT`

**Removed from Phoenix:** `OPENAI_API_KEY` (no receipt scanning or VIN AI features in this domain)

---

## Naming Conventions

- Models: PascalCase singular (`WorkOrder`, `Property`, not `Properties`)
- Routes: kebab-case plural (`/api/properties`, `/api/work-orders`)
- Controllers: camelCase with suffix (`propertyController`, `workOrderController`)
- Client services: camelCase with suffix (`propertyService.js`)
- Variables/functions: camelCase

---

## Security

- Helmet.js for HTTP headers (CSP, HSTS, etc.)
- express-mongo-sanitize for NoSQL injection prevention
- XSS sanitizer middleware
- Rate limiting: 100 req/hr prod, 1000/15min dev; stricter on auth endpoints (5 attempts/15min)
- CORS with credentials, restricted to `CLIENT_URL` origin
- Password reset tokens expire in 10 minutes
- JWT in HTTP-only cookies (not localStorage)

---

## Domain-Specific Notes

### Seasonal Scheduling

- Gutter cleaning peaks in **fall** (leaf clogging) and **spring** (winter debris clearance). Plan scheduling views to show weekly workload for capacity management.
- Pressure washing peaks in **spring/summer**. Full-service jobs (gutters + pressure wash) are common spring package bookings.
- In northern climates, pressure washing on wood surfaces may be inadvisable November–March (freeze risk). Consider adding a service-level warning when scheduling pressure wash jobs in winter months.
- Appointment reminders should optionally include a weather check — crews should be able to cancel same-day via On Hold (weather-delay) without customer-facing friction.

### Weather Considerations

- Rain and freezing temperatures are primary cancellation drivers. `On Hold` with `holdReason: 'weather-delay'` is a **primary** workflow path, not an edge case.
- When a job is moved to On Hold for weather, the appointment should remain linked but be rescheduled — do not delete the appointment, just push the date.
- No-Show in this domain typically means the property owner was not home (locked gate, no access code on file). Capture specifics in `holdReasonOther` and update the property notes with the access info for next visit.
- Consider a future integration with a weather API to auto-flag appointments within 48 hours of rain/freeze forecasts.

### Property-Based Service Tracking

- Properties (unlike vehicles) are **stationary** — the service address IS the property identity. When creating a new property for a customer, check for duplicate addresses to avoid double-entry.
- A single customer may own **multiple properties** — a homeowner plus a rental property, or a property management company with dozens of units. The customer→property relationship is one-to-many.
- Property history is **physically persistent**: gutter guards installed last year are still there. Service notes and history build a permanent record that informs every future quote.
- `estimatedGutterLinearFeet` is the primary dimension for gutter job quoting. Store it at the property level and auto-populate quote line items from it.
- `stories` directly affects **labor pricing** — second-story work requires extension ladders and more time. Use this field to flag or adjust estimates.
- `roofType` affects **pressure washing approach** — tile and metal roofs require lower PSI to avoid damage; flat roofs require different drainage consideration. Technicians should see this field prominently in the technician portal.

### Multi-Service Quoting

- Many jobs combine gutter cleaning + pressure washing. A single work order can carry both types of labor lines — no need to split into separate WOs unless different crews service on different days.
- Quotes should list services as separate line items with individual pricing for customer clarity.
- Service packages (`Full Service - Gutters + Pressure Wash`) streamline common combinations with flat-rate pricing.
- For large commercial properties, consider splitting into multiple work orders by service type or building section when job complexity warrants separate scheduling.

### Technician Scheduling Patterns

- Most residential jobs are **1–4 hours**. Multi-day jobs are rare (large commercial gutter guard installs).
- Crews typically consist of **1–2 technicians**. `assignedTechnician` stores the lead tech. Multi-tech jobs can be modeled via multiple labor lines with different tech names, or by assigning the WO to one tech and noting the helper in `serviceNotes`.
- **Drive time** is significant in this business — schedule blocks (Tasks) are heavily used for travel between jobs. Use `taskCategories` like "Drive Time", "Equipment Maintenance", "Material Pickup".
- Back-to-back scheduling in the same neighborhood/zip code is efficient — consider adding a zip-code grouping view in the calendar for scheduling optimization.

### Removed Auto-Specific Features

The following Phoenix CRM features do not apply to this domain and were removed:

| Feature | Reason |
|---------|--------|
| VIN decoder (`/api/vin`) | No vehicles |
| Registration card scanning (`/api/registration`) | No vehicle registration |
| Mileage tracking | No odometer on a house |
| Inspection & repair checklists | No multi-stage diagnostic/approval workflow |
| Core charges on parts | Not applicable to gutter/pressure wash supplies |
| Diagnostic notes | Replaced by simpler `serviceNotes` |
| `Part` model (automotive catalog) | Replaced by `InventoryItem` for all supply tracking |
| `skipDiagnostics` field | No diagnostics workflow |
| Receipt AI extraction | No automotive parts receipts to scan |
