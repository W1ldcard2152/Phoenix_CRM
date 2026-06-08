# Changelog

All notable changes to Phoenix CRM, most recent first. Entries are dated by push-to-main (deploy date). Categories follow [Keep a Changelog](https://keepachangelog.com/) conventions.

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
