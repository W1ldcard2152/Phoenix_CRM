# Changelog

All notable changes to Phoenix CRM, most recent first. Entries are dated by push-to-main (deploy date). Categories follow [Keep a Changelog](https://keepachangelog.com/) conventions.

## 2026-06-15

### Added
- Follow-up notes now have an **Add & Resolve** button that logs the note and marks the follow-up resolved in one step — handy since the first note on a follow-up is usually the one that closes it.
- **Jobs view** — invoices, quotes, and work orders now organize parts and labor **by job** (each Service Requested) instead of separate Parts and Labor sections. Every job shows its own parts and labor with a per-job total, and each service package is its own job. On the work order / quote page, each requested service is its own container with Add Part / From Inventory / Import / Add Labor buttons, so anything added — including receipt-imported parts — lands on that job automatically; an **Add Job** button creates more. Parts or labor with no job assigned fall under the first service. (Already-invoiced work orders keep the previous flat layout.)

### Changed
- Creating a Work Order or Quote now auto-selects the vehicle only when the customer has exactly one in their garage (instead of always picking the first), and the Vehicle field is now required.
- Saving a Work Order or Quote that's missing a required field now shows the specific reason (e.g. "Please select a vehicle") instead of a generic "Failed to save work order".
- Adding a customer whose phone number already exists now warns and links to the existing customer, but still lets you create the new one with **Create New Anyway** — and the warning can no longer be skipped by saving before the duplicate check finishes.
- Work order / quote totals summary now breaks down **by job**, with a toggle to expand each job's parts and labor subtotals.
- Invoice and quote line items now read like a standard receipt: column headers (Qty · Unit Price · Amount), columns aligned across jobs, and a **Total** line at the bottom of each job. Fixed-price labor now shows "ea" units (e.g. "4 ea" at "$25.00/ea") to match hourly's "1.5 hr".

### Fixed
- Production deploys were failing to build because the hosting environment treats lint warnings as errors; the production build no longer fails on warnings, so deploys go through again.
- Importing or adding a not-yet-received part to a Work Order that had already flipped to "Parts Received" now drops it back to "Parts Ordered" (unless the part is added and marked received in the same action), so the status reflects that something is still on order.
- The invoice status dropdown was being clipped at the bottom edge of the table; it now floats above the table so all options are reachable.
- Resolving a follow-up from the dashboard now removes it from the Follow-Ups card and updates the count immediately, instead of leaving stale follow-ups until the page is refreshed.

## 2026-06-12

### Added
- **Shop Hours** setting in the Shop tab — per-day open/close time (6 AM–10 PM, whole-hour increments), Closed toggle, and optional lunch start + duration. Defaults to Mon–Fri 8 AM–6 PM, Sat–Sun closed.
- **Multi-day appointment dragging** — appointments are now chains of 15-minute segments occupying shop-open time. Drag one toward close and the overflow flows onto the next open day (and dragging toward open flows backward); a live dashed-blue ghost shows exactly where every segment will land before you drop. Any day-block of a multi-day appointment can be grabbed and the whole chain moves together. The daily view announces off-screen overflow with an edge chip (e.g. "+45m → Mon 8:00 AM").
- Lunch breaks from Shop Hours now appear as a gray band on the calendar, and appointments automatically split and flow around them — same for scheduling in the form.
- **Now indicator** — when viewing today, each technician's lane shows a soft yellow highlight on the current hour plus a red line at the exact current minute, refreshing every minute.
- Calendar viewport now dynamically bounds to the earliest open and latest close time across all visible days — no more hardcoded 8 AM–6 PM ceiling.
- Closed days in the weekly calendar now show a "Closed" label and a gray background instead of a blank column.

### Changed
- Appointment form is now duration-driven: pick a start date/time and a duration, and the end time is computed by flowing through shop hours (wrapping past close into the next open day, skipping lunch and closed days). Start-time choices come from that day's actual open hours.
- Appointment cards and hover popovers show shop-time durations based on the configured hours instead of an assumed 8–6 schedule; multi-day popovers show the full span (e.g. Fri 1:00 PM → Mon 9:00 AM).
- Dropping an appointment directly on a Closed day still works (that day is treated as open 8–6 for the appointment), but overflow from neighboring days skips closed days.
- Technician rows on both calendar views are now separated by a gray spacer strip so it's clear where one tech's lane ends and the next begins.

## 2026-06-11

### Changed
- Quick Entry **Done** button now saves the open Work Order or Appointment section if it has pending data, then closes — previously Done just exited and silently discarded anything that wasn't committed via "Create Work Order & Continue". Validation errors are surfaced and block the close so nothing's lost.
- Inventory side of receipt import merge now defaults to **Existing** when the catalog already has a value, falling back to the receipt only where the existing field is blank. WO-side merge still favors the receipt (the rule that already shipped).
- Discount modal preview, WO/Quote summary, and Invoice Generator summary now show a **Subtotal after coupon** line so the post-discount number is visible without doing the subtraction in your head.
- Year picker on Edit Vehicle replaced with the searchable dropdown — no more accidental scroll-wheel value changes, plus typeahead for the 127-year list.
- Receipt extraction's Gemini model is now overridable via `GEMINI_MODEL` env var (default `gemini-2.5-flash`). Errors from the AI call propagate the actual message instead of a generic 500.

### Fixed
- Receipt Importer on Work Orders returned 500 from `/api/workorders/:id/extract-receipt` — the hardcoded Gemini model alias had been retired upstream.
- Newly-created Work Orders, Quotes, and Invoices were displaying with yesterday's date — the client sent `YYYY-MM-DD` and Mongoose cast it to UTC midnight, which renders as the previous evening in any negative-offset timezone. `date` and `invoiceDate` are now handled by the date-conversion middleware as business-timezone start-of-day.
- Date inputs (mileage history rows, etc.) were shifting back one day after the user picked a date — `formatDateForInput` was reparsing already-formatted `YYYY-MM-DD` strings as UTC and converting to local. It now passes those through unchanged.
- Multi-day appointments only appeared on Today's Schedule on their start day — the query now matches any appointment whose span intersects today (`startTime < tomorrow AND endTime >= today_start`).
- Mileage records were being silently duplicated when the same date + mileage was entered twice — the controller had no dedup logic and the vehicle cache wasn't invalidated, so the page appeared to "clean up" the duplicate on refresh while the DB kept it. The server now skips inserts with matching date+mileage (merging any new notes into the existing record), the model's pre-save hook dedupes the array as a safety net so pre-existing duplicates get cleaned up on next save, and the vehicle cache is invalidated.
- Receipt importer merge screen showed empty Part # in the FROM RECEIPT column even when the AI had pulled the SKU — the extractor returned `brand` and `itemNumber` separately while the merge UI looked up `partNumber`. The extractor now also emits a pre-joined `partNumber` matching the format used by stored records, so the merge defaults compare like-for-like.

## 2026-06-09

### Added
- Tabbed Related Records section on Customer and Vehicle detail pages — single panel with Vehicles / Work Orders / Quotes tabs (Vehicle pages skip the Vehicles tab), counts shown in the tab labels, defaults to Work Orders, with a New action button on the right that switches per tab
- Maintenance option in the appointment service type dropdown for oil changes and other routine work
- Feedback button now visible on mobile (was previously hidden below the sm breakpoint, making it unreachable for users filing feedback from their phones)

### Changed
- Vehicle detail page rebalanced: Vehicle Information card now includes the last 3 mileage entries inline with the most recent flagged as **Current**, plus a View All button that opens the full history in a modal; standalone Mileage History card removed; top section is now 2 columns instead of 3, with Owner Information stacked above Vehicle Notes
- Customer detail page cleaned up: separate Vehicles, Recent Work Orders, and Customer Stats cards removed (counts now live in the tab labels of the new Related Records section)
- VIN normalized to uppercase at the Mongoose schema level on Vehicle records and used-part records, so any entry path (form, API, import, intake) ends up with a uppercase VIN

### Fixed
- Split work order feature was broken end-to-end — the new work order failed to save (invalid status value), and the moved parts and labor were not being removed from the original work order; now the split correctly creates the new WO with the selected items and removes them from the original
- Invoice status dropdown on the invoices list page closed immediately when clicked, making it impossible to change the status — the click-outside detector was using a single ref but the status badge renders in both desktop and mobile layouts simultaneously (hidden via CSS), so a click on one was registered as outside the other

## 2026-06-08

### Added
- Warranty preset dropdown on inventory items and WO parts (14 days, 30 days, 90 days, 6 months, 1 year, 2 years, 3 years, 5 years, Lifetime); new items default to 90 days; legacy free-text values preserved as a per-item fallback option so existing records don't lose data
- Default Labor Rate setting in the Shop tab — pre-fills the rate field when adding labor to a WO or quote (was hardcoded to $75 in four places)
- Tabbed Settings page: **My Account** (profile, password, account info) and **Shop** (admin/management only — labor rate, part markup)
- Sortable column headers on inventory list (Name, Category, Vendor, Price, QOH, Unit, Reorder) with asc/desc/off cycle, multi-sort up to 3 keys with numbered indicators, persisted across sessions via localStorage
- CHANGELOG.md (this file) for tracking user-visible changes by deploy date

### Changed
- Vehicle search now AND-matches across whitespace-separated tokens and includes year — "2018 BMW" returns only 2018 BMWs (previously OR'd across fields and ignored year entirely). Regex special characters escaped before injection.
- Inventory list table density tightened (smaller row padding, smaller adjust buttons, `whitespace-nowrap` on most columns)
- AI URL extraction no longer pulls warranty — most product pages had ambiguous or marketing warranty text that wasn't trustworthy enough to auto-fill

## 2026-05-15

### Added
- Notes field on schedule blocks (form textarea + display near top of calendar popover so any list/process is immediately visible)
- `SearchableDropdown` common component (fixed positioning escapes modal overflow, flips upward when room is tight, keyboard nav, allow-clear, optional sublabel/keywords for search)
- Manual match override in receipt importers — users can correct AI's duplicate guess (plain select for short WO parts list, searchable combobox for long inventory list)
- Per-field merge UI in receipt importers — Existing / From receipt / Custom text input side-by-side with radio selection per field (name, part #, brand, vendor, cost, notes); defaults favor incoming when non-empty, else existing

### Changed
- Calendar appointment popover redesigned: flanks the card left/right (was above/below, eliminating the dead-zone gap), action buttons moved to top, Customer/Vehicle and Service/Time combined onto single lines
- Schedule block conflict warning fires immediately on edit-form load (no longer waits for 350ms debounce)
- Receipt importer backends (`confirmReceiptParts`, `confirmInventoryReceipt`) apply per-field merge selections verbatim; choosing existing cost preserves existing retail price instead of reflowing through markup
- Receipt importer modals sized to 95% of content container width with min-h-[70vh], centered over content area only

### Fixed
- Multi-day appointments (e.g. Thu 9am → Fri 11am) no longer marked Completed at Thursday's 6pm cron — `appointmentCompleteJob` now sweeps by `endTime` in the past 24 hours instead of by `startTime`, and excludes already-Completed rows
- Schedule block notes redacted for non-admin viewers via `applyScheduleBlockVisibility`

## 2026-05-14

### Added
- Bidirectional scheduling conflict detection between appointments and schedule blocks — `ScheduleBlock.checkConflicts` static method builds proposed time instances (one-time: single window; recurring: expanded from `max(today, effectiveFrom)` to `min(effectiveUntil, today+90d)`) and queries Appointments + other active blocks for same-technician overlap
- POST `/api/schedule-blocks/check-conflicts` endpoint wired into ScheduleBlockForm with debounced re-check and yellow warning banner

### Changed
- Invoices dashboard redesigned
- Quotes dashboard refinements
- Work Orders dashboard default filters
- Width standardization across dashboard sections

## 2026-05-01

### Added
- Inventory pricing and parts draft/commit workflow — service packages on WOs are uncommitted drafts until "Pull from Inventory" atomically deducts stock and marks them `committed: true`

## 2026-04-29

### Added
- Inventory receipt import flow with AI extraction, duplicate detection, and one-by-one new-item queue
- Retail price auto-calculation from cost in `InventoryItemForm` (uses settings markup, with override checkbox)
- Brand field extraction in receipt parser, separated from item name and SKU
- `formatBrandName` helper that title-cases 4+ letter brand words, preserves 1-3 letter acronyms, and respects user-managed override list
- `Settings.brandOverrides` field with add/update/remove/apply-to-inventory endpoints
- `ManageBrandsModal` with per-row Apply and Apply All to Inventory buttons that rewrite `partNumber` on existing items
- More Actions dropdown in InventoryList header (Manage Brands first option)
- Inline Manage Categories section under category filter row with cascading rename (updates Settings list and `InventoryItem.category` in one shot via `renameInventoryCategory` endpoint)
- `ServicePackageCommitModal` — pre-validates inventory levels before committing, shows per-item stock status with links into inventory
- `UncommittedServicesWarningModal` — triggers on invoice generation if WO has uncommitted service packages, allows inline commit
- `ServicePackageRemovalModal` — three explicit options for committed packages (Remove and Restock / Remove and Don't Restock / Cancel)
- `includedItems` sub-schema on `InvoiceItemSchema` so invoice service items preserve component details (name, brand, part number, quantity, unit)
- Brand field on `ServicePackageItemSchema` in WorkOrder model, captured from inventory item on package add

### Changed
- Receipt extraction prompt: tax now extracted as separate line item (amortized into per-part cost alongside shipping), concise part names with marketing filler stripped, manufacturer/OEM part numbers prioritized over marketplace item numbers
- Service packages filtered to committed-only on printed work orders / invoices (uncommitted drafts no longer appear)
- Replaced `window.confirm` flows with proper modals for service package commit / removal / uncommitted-services warning
- Combined brand and itemNumber into single Brand/Model field when prefilling new item form from receipt import; receipt import modal displays brand and SKU joined by middle dot
- Tightened `findDuplicates` prompt: part number mismatch is a hard veto, brand+spec match only applies to items without SKUs
- `servicePackages` and `taxRate` added to work order print data so service packages render on printed work orders

### Fixed
- Shipping/tax amortization divides by total units across all extracted items, locked to extraction-time count so unchecking items doesn't redistribute
- Receipt quantity multiplied by existing item's `unitsPerPurchase` when adding to existing stock
- InvoiceList print action was missing service packages from its document data
- InvoiceDetail and InvoiceGenerator now mark mapped service packages as committed and pass through `includedItems` for printing
- `whitespace-nowrap` on Date and Archived Date columns in FeedbackAdminPage to prevent multi-line wrapping

### Removed
- Redundant top-of-page error banner on failed inventory pull (alert popup is sufficient)
