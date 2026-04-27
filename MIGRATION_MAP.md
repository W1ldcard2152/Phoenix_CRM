# Migration Map: Phoenix CRM → Snyder's Gutters CRM

This file categorizes every source file by the work required to migrate it from the Phoenix CRM (auto repair) domain to the Snyder's Gutters CRM (gutter cleaning & pressure washing) domain.

**Categories:**
- **KEEP AS-IS** — transfer with zero changes
- **RENAME/RELABEL** — only domain terminology changes (vehicle→property, etc.); no logic changes
- **REWRITE** — significant domain-specific logic, field names, or business rules must change
- **DELETE** — does not apply to the new domain; remove entirely

---

## Server — Models (`src/server/models/`)

| File | Action | Notes |
|------|--------|-------|
| `User.js` | **KEEP AS-IS** | Identical auth model; same roles |
| `Technician.js` | **KEEP AS-IS** | Same concept, no domain changes |
| `Customer.js` | **RENAME/RELABEL** | Change `vehicles` array → `properties`; update `getMostRecentVehicle()` → `getMostRecentProperty()` |
| `Vehicle.js` | **REWRITE** → `Property.js` | Replace with Property model: address (service address), propertyType, stories, estimatedGutterLinearFeet, roofType, lotSize, lastServiceDate. Remove year/make/model/VIN/mileage/licensePlate entirely |
| `WorkOrder.js` | **REWRITE** | Status enum simplified (remove diagnostic/parts-ordering cycle). Rename `vehicle`→`property`. Rename `parts`→`materials` (remove core charge, VIN, ordered/received/receipt fields from schema). Rename `diagnosticNotes`→`serviceNotes`, add `completionNotes`. Simplify media types (Pre-Service, In-Progress, Post-Service). Remove `inspectionChecklist`, `repairChecklist`, `skipDiagnostics`, `serviceRequested`, `partsSortConfig` |
| `Appointment.js` | **RENAME/RELABEL** | Change `vehicle` field → `property` |
| `Invoice.js` | **RENAME/RELABEL** | Change `vehicle` field → `property`. Change InvoiceItem type enum: `Part`→`Supply` |
| `InventoryItem.js` | **RENAME/RELABEL** | Same structure; update `packageTag` default values in Settings (not in model). No model changes required |
| `ServicePackage.js` | **KEEP AS-IS** | Identical structure; default package names are seeded via Settings/seed scripts, not hardcoded in model |
| `Settings.js` | **REWRITE** | Rename `partMarkupPercentage`→`supplyMarkupPercentage`. Update `customVendors` defaults (home improvement suppliers). Update `packageTags` defaults (gutter/PW supply tags). Update `inventoryCategories` defaults. Remove `vendorHostnames` (auto-parts vendor URL map, not applicable). Update `taskCategories` defaults |
| `Feedback.js` | **KEEP AS-IS** | Domain-agnostic |
| `CustomerInteraction.js` | **KEEP AS-IS** | Domain-agnostic; contact log patterns are identical |
| `WorkOrderNote.js` | **KEEP AS-IS** | Domain-agnostic |
| `Media.js` | **RENAME/RELABEL** | Update `type` enum: replace `Pre-Inspection`/`Diagnostic`/`Parts Receipt`/`Post-Inspection` with `Pre-Service`/`In-Progress`/`Post-Service`/`Customer Document`/`Other` |
| `ScheduleBlock.js` | **KEEP AS-IS** | Identical; recurring/one-time task blocks work the same |
| `FollowUp.js` | **RENAME/RELABEL** | Change `vehicle` ref → `property` in entityType enum and field definitions |
| `Part.js` | **DELETE** | Automotive parts catalog; not applicable. All supply tracking goes through `InventoryItem` |

---

## Server — Controllers (`src/server/controllers/`)

| File | Action | Notes |
|------|--------|-------|
| `authController.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `userController.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `technicianController.js` | **KEEP AS-IS** | Identical concept |
| `customerController.js` | **RENAME/RELABEL** | Update field references: `vehicles`→`properties`, update populate calls |
| `vehicleController.js` | **REWRITE** → `propertyController.js` | Replace vehicle-specific logic (VIN checks, mileage recording, mileage history queries) with property logic (address duplicate check, service history, property-specific search by zip/city/type) |
| `workOrderController.js` | **REWRITE** | Update status enum references throughout. Rename `vehicle`→`property` in queries and populates. Rename `parts`→`materials`. Remove: mileage update logic, diagnostic checklist sync, VIN-on-part logic, receipt extraction call. Simplify status transition guards to match new flow. Update `calculatePartsCost`→`calculateMaterialsCost` calls |
| `appointmentController.js` | **RENAME/RELABEL** | Replace `vehicle` refs with `property` in populate calls and filters |
| `invoiceController.js` | **RENAME/RELABEL** | Replace `vehicle` refs with `property`; update item type display name (`Part`→`Supply`) |
| `inventoryController.js` | **KEEP AS-IS** | Identical logic; category values come from Settings |
| `servicePackageController.js` | **KEEP AS-IS** | Identical logic |
| `settingsController.js` | **REWRITE** | Update field name `partMarkupPercentage`→`supplyMarkupPercentage`. Remove `vendorHostnames` endpoint. Update any auto-specific default seeding |
| `scheduleBlockController.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `feedbackController.js` | **KEEP AS-IS** | Domain-agnostic |
| `customerInteractionController.js` | **KEEP AS-IS** | Domain-agnostic |
| `workOrderNotesController.js` | **KEEP AS-IS** | Domain-agnostic |
| `mediaController.js` | **KEEP AS-IS** | S3 logic is domain-agnostic; media type enum change handled in model |
| `followUpController.js` | **RENAME/RELABEL** | Update `vehicle`→`property` in entity type handling |
| `searchController.js` | **REWRITE** | Update searchable fields: replace vehicle (year/make/model/VIN) searches with property (address/city/zip/type) searches. Remove parts catalog search. Update result formatting |
| `adminController.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `partController.js` | **DELETE** | No automotive parts catalog |
| `vinController.js` | **DELETE** | No VIN decoding |
| `registrationController.js` | **DELETE** | No vehicle registration scanning |
| `aiController.js` | **DELETE** | Receipt/VIN AI not applicable; if photo analysis is desired in future, rebuild from scratch |

---

## Server — Routes (`src/server/routes/`)

| File | Action | Notes |
|------|--------|-------|
| `authRoutes.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `oauthRoutes.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `customerRoutes.js` | **KEEP AS-IS** | Route paths unchanged; controller updates handle domain changes |
| `vehicleRoutes.js` | **RENAME/RELABEL** → `propertyRoutes.js` | Change route prefix to `/api/properties`. Remove `/check-vin`, `/mileage-history`, `/mileage-at-date` endpoints. Add `/check-address` endpoint |
| `workOrderRoutes.js` | **REWRITE** | Remove: `/extract-receipt`, `/confirm-receipt-parts` endpoints. Keep all others; update to use `materials` terminology in body params |
| `appointmentRoutes.js` | **RENAME/RELABEL** | Update `GET /vehicle/:vehicleId` → `GET /property/:propertyId` |
| `invoiceRoutes.js` | **KEEP AS-IS** | Route paths unchanged |
| `technicianRoutes.js` | **KEEP AS-IS** | Identical |
| `scheduleBlockRoutes.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `feedbackRoutes.js` | **KEEP AS-IS** | Domain-agnostic |
| `customerInteractionRoutes.js` | **KEEP AS-IS** | Domain-agnostic |
| `workOrderNotesRoutes.js` | **KEEP AS-IS** | Domain-agnostic |
| `mediaRoutes.js` | **KEEP AS-IS** | Domain-agnostic |
| `inventoryRoutes.js` | **KEEP AS-IS** | Domain-agnostic |
| `servicePackageRoutes.js` | **KEEP AS-IS** | Domain-agnostic |
| `settingsRoutes.js` | **KEEP AS-IS** | Route paths unchanged; controller handles field changes |
| `followUpRoutes.js` | **KEEP AS-IS** | Domain-agnostic route structure |
| `adminRoutes.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `searchRoutes.js` | **KEEP AS-IS** | Route path unchanged; controller handles domain search changes |
| `partRoutes.js` | **DELETE** | No automotive parts |
| `vinRoutes.js` | **DELETE** | No VIN decoding |
| `registrationRoutes.js` | **DELETE** | No registration scanning |
| `aiRoutes.js` | **DELETE** | AI receipt/VIN not applicable |

---

## Server — Middleware (`src/server/middleware/`)

| File | Action | Notes |
|------|--------|-------|
| `errorHandler.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `convertDates.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `restrictToOwn.js` | **KEEP AS-IS** | Domain-agnostic ownership check |

---

## Server — Services (`src/server/services/`)

| File | Action | Notes |
|------|--------|-------|
| `emailService.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `twilioService.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `s3Service.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `cacheService.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix; update cache key namespaces (`properties:` instead of `vehicles:`) |
| `aiService.js` | **DELETE** | Receipt scanning and VIN AI not applicable |

---

## Server — Config (`src/server/config/`)

| File | Action | Notes |
|------|--------|-------|
| `passport.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `timezone.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |

---

## Server — Utils (`src/server/utils/`)

| File | Action | Notes |
|------|--------|-------|
| `appError.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `catchAsync.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `dateUtils.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `validationHelpers.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `calculationHelpers.js` | **REWRITE** | Rename `calculatePartsCost`→`calculateMaterialsCost`. Remove core charge calculation from materials cost. Update `calculateWorkOrderTotal` signature comment. Update `getWorkOrderCostBreakdown` to use `materialsCost` key instead of `partsCost`. Logic is otherwise identical |
| `populationHelpers.js` | **RENAME/RELABEL** | Update vehicle→property in any populate presets or helper functions |
| `nameUtils.js` | **KEEP AS-IS** | Domain-agnostic name formatting |
| `addDatabaseIndexes.js` | **REWRITE** | Update index creation calls to reference `Property` instead of `Vehicle`; remove Part model indexes; add any property-specific indexes |
| `server.js` | **KEEP AS-IS** | Server startup logic |

---

## Server — App Entry (`src/server/`)

| File | Action | Notes |
|------|--------|-------|
| `app.js` | **REWRITE** | Remove registrations for: `vinRoutes`, `registrationRoutes`, `aiRoutes`, `partRoutes`. Add `propertyRoutes` (`/api/properties`). Update route comment block. Security middleware stack stays identical |

---

## Server — Jobs (`src/server/jobs/`)

| File | Action | Notes |
|------|--------|-------|
| `appointmentCompleteJob.js` | **KEEP AS-IS** | Domain-agnostic scheduling logic |

---

## Client — Services (`src/client/src/services/`)

| File | Action | Notes |
|------|--------|-------|
| `api.js` | **KEEP AS-IS** | Shared axios instance |
| `authService.js` | **KEEP AS-IS** | |
| `customerService.js` | **RENAME/RELABEL** | Update property-related methods (replace `getCustomerVehicles`→`getCustomerProperties`) |
| `vehicleService.js` | **REWRITE** → `propertyService.js` | Replace with property-specific methods: create/update/delete/search properties, get service history. Remove VIN check, mileage methods |
| `workOrderService.js` | **REWRITE** | Update field references (vehicle→property, parts→materials). Remove receipt extraction method. Update status constants |
| `appointmentService.js` | **RENAME/RELABEL** | Replace `getVehicleAppointments`→`getPropertyAppointments` |
| `invoiceService.js` | **KEEP AS-IS** | Route paths unchanged |
| `technicianService.js` | **KEEP AS-IS** | |
| `scheduleBlockService.js` | **KEEP AS-IS** | |
| `feedbackService.js` | **KEEP AS-IS** | |
| `customerInteractionService.js` | **KEEP AS-IS** | |
| `workOrderNotesService.js` | **KEEP AS-IS** | |
| `mediaService.js` | **KEEP AS-IS** | |
| `inventoryService.js` | **KEEP AS-IS** | |
| `servicePackageService.js` | **KEEP AS-IS** | |
| `quoteService.js` | **KEEP AS-IS** | Shares workorders endpoint; no change needed |
| `documentService.js` | **KEEP AS-IS** | Wrapper for unified documents; no change needed |
| `followUpService.js` | **RENAME/RELABEL** | Update `vehicle`→`property` in entity type constants if hardcoded |
| `vinService.js` | **DELETE** | No VIN decoding |
| `registrationScanService.js` | **DELETE** | No registration scanning |
| `aiService.js` | **DELETE** | No AI receipt/VIN features |
| `workflowService.js` | **DELETE** | Empty stub in Phoenix; don't carry over |

---

## Client — Pages (`src/client/src/pages/`)

| File/Directory | Action | Notes |
|----------------|--------|-------|
| `Auth/Login.jsx` | **KEEP AS-IS** | Update app name/branding only |
| `Auth/Register.jsx` | **KEEP AS-IS** | Update app name/branding only |
| `Auth/OAuthCallback.jsx` | **KEEP AS-IS** | |
| `Admin/AdminPage.jsx` | **KEEP AS-IS** | |
| `Feedback/FeedbackAdminPage.jsx` | **KEEP AS-IS** | |
| `Customers/CustomerList.jsx` | **KEEP AS-IS** | |
| `Customers/CustomerForm.jsx` | **KEEP AS-IS** | |
| `Customers/CustomerDetail.jsx` | **RENAME/RELABEL** | Replace vehicle references with property (section titles, links, button labels) |
| `Vehicles/VehicleList.jsx` | **REWRITE** → `Properties/PropertyList.jsx` | Replace vehicle columns (year/make/model) with property columns (address, type, stories, last service date). Update search/filter fields |
| `Vehicles/VehicleForm.jsx` | **REWRITE** → `Properties/PropertyForm.jsx` | Replace vehicle fields with property fields. Remove VIN/mileage/license plate. Add address fields, propertyType, stories, estimatedGutterLinearFeet, roofType, lotSize |
| `Vehicles/VehicleDetail.jsx` | **REWRITE** → `Properties/PropertyDetail.jsx` | Replace vehicle info display with property info. Remove mileage history section. Show address, property attributes, service history |
| `WorkOrders/WorkOrderList.jsx` | **REWRITE** | Update status tabs and filters to new status enum. Replace vehicle column with property address. Remove mileage column |
| `WorkOrders/WorkOrderForm.jsx` | **REWRITE** | Replace vehicle field with property selector. Remove VIN/mileage fields. Update service status options |
| `Documents/DocumentForm.jsx` | **REWRITE** | Update status options to new flow. Replace vehicle with property. Remove diagnostics-related fields |
| `Documents/DocumentDetail.jsx` | **REWRITE** | Update status dropdown options. Replace vehicle refs with property. Remove diagnostic checklist, inspection checklist, repair checklist sections. Remove parts receipt AI extraction. Rename parts section → materials/supplies. Remove core charge fields |
| `Appointments/AppointmentList.jsx` | **RENAME/RELABEL** | Replace vehicle column/filter with property address |
| `Appointments/AppointmentForm.jsx` | **RENAME/RELABEL** | Replace vehicle selector with property selector |
| `Appointments/AppointmentDetail.jsx` | **RENAME/RELABEL** | Replace vehicle display with property display |
| `Invoices/InvoiceList.jsx` | **KEEP AS-IS** | |
| `Invoices/InvoiceGenerator.jsx` | **RENAME/RELABEL** | Update item type labels: `Part`→`Supply` in UI |
| `Invoices/InvoiceDetail.jsx` | **RENAME/RELABEL** | Update vehicle→property display; item type label `Part`→`Supply` |
| `Quotes/QuoteList.jsx` | **KEEP AS-IS** | |
| `Quotes/QuoteDetail.jsx` | **RENAME/RELABEL** | Update vehicle→property display; material label changes |
| `Inventory/InventoryList.jsx` | **KEEP AS-IS** | Category values come from Settings; no hardcoded changes |
| `ServicePackages/ServicePackageList.jsx` | **KEEP AS-IS** | Package names come from DB; no hardcoded changes |
| `ScheduleBlocks/ScheduleBlockList.jsx` | **KEEP AS-IS** | |
| `ScheduleBlocks/ScheduleBlockForm.jsx` | **KEEP AS-IS** | |
| `Settings/SettingsPage.jsx` | **REWRITE** | Remove `vendorHostnames` section. Rename "Part Markup" → "Supply Markup". Update category section labels. Update default display values |
| `Technicians/TechniciansPage.jsx` | **KEEP AS-IS** | |
| `Technicians/TechnicianFormModal.jsx` | **KEEP AS-IS** | |
| `TechnicianPortal/TechnicianPortal.jsx` | **REWRITE** | Remove inspection/repair checklist workflow. Simplify to: job details, service notes, materials used, pre/post service photos. Add property info (stories, roof type) display for crew reference |
| `TechnicianPortal/TechnicianChecklist.jsx` | **DELETE** | No multi-step checklist workflow; replaced by simpler job notes |
| `TechnicianPortal/TechnicianWorkOrderDetail.jsx` | **REWRITE** | Remove diagnostic/checklist sections. Show property details (stories, roof type, access notes). Show service packages, materials, pre/post photos |
| `Dashboard/Dashboard.jsx` | **RENAME/RELABEL** | Update "Vehicles" references to "Properties"; update status labels to new flow |
| `Dashboard/TechnicianDashboard.jsx` | **RENAME/RELABEL** | Update status labels; replace vehicle display with property address |
| `Dashboard/ServiceWritersCorner.jsx` | **REWRITE** | Update status column labels and tab names to new workflow. Replace vehicle info with property address. Remove diagnostic/parts-ordering status columns |
| `Intake/IntakePage.jsx` | **REWRITE** | Replace VehicleStep with PropertyStep. Remove VIN scanner, registration scanner, mileage field. Add property address, type, stories, gutter linear feet fields. Update wizard flow |
| `FollowUps/FollowUpList.jsx` | **RENAME/RELABEL** | Update `vehicle`→`property` entity type labels |
| `Parts/PartsList.jsx` | **DELETE** | No automotive parts catalog |
| `Parts/PartsForm.jsx` | **DELETE** | No automotive parts catalog |

---

## Client — Components (`src/client/src/components/`)

| File/Directory | Action | Notes |
|----------------|--------|-------|
| `common/*` (all) | **KEEP AS-IS** | Button, Card, Input, SelectInput, TextArea, FileUpload, ResponsiveTable, FeedbackButton, FileList, GlobalSearch, Modal, DateTimePicker — all domain-agnostic |
| `layout/Navbar.jsx` | **RENAME/RELABEL** | Update app name/branding to "Snyder's Gutters" |
| `layout/Sidebar.jsx` | **REWRITE** | Replace "Vehicles" nav item with "Properties". Remove "Parts" nav item. Update any status references. Update branding |
| `dashboard/SwimmingLaneCalendar.jsx` | **KEEP AS-IS** | |
| `dashboard/DailyView.jsx` | **KEEP AS-IS** | |
| `dashboard/WeeklyView.jsx` | **KEEP AS-IS** | |
| `dashboard/AppointmentCard.jsx` | **RENAME/RELABEL** | Update status color lookups to new status enum values |
| `dashboard/AppointmentCalendar.jsx` | **KEEP AS-IS** | |
| `dashboard/GanttCalendar.jsx` | **KEEP AS-IS** | |
| `dashboard/TechnicianRow.jsx` | **KEEP AS-IS** | |
| `dashboard/TimeAxis.jsx` | **KEEP AS-IS** | |
| `dashboard/HorizontalTimeAxis.jsx` | **KEEP AS-IS** | |
| `dashboard/AppointmentBlock.jsx` | **RENAME/RELABEL** | Update status labels |
| `dashboard/WorkflowSummary.jsx` | **REWRITE** | Update status pipeline display to new status flow. Remove diagnostic/parts-ordering stages |
| `appointments/AvailabilityCalendar.jsx` | **KEEP AS-IS** | |
| `workorders/CustomerInteractions.jsx` | **KEEP AS-IS** | Domain-agnostic |
| `workorder/OnHoldReasonModal.jsx` | **REWRITE** | Update holdReason enum options to: weather-delay, customer-request, access-issue, equipment-issue, other |
| `workorder/SplitWorkOrderModal.jsx` | **KEEP AS-IS** | Splitting a WO into multiple is still valid for multi-day or multi-service jobs |
| `workorder/ChecklistViewModal.jsx` | **DELETE** | No inspection/repair checklists |
| `workorder/InventoryPickerModal.jsx` | **KEEP AS-IS** | Domain-agnostic inventory picking |
| `quotes/ConvertQuoteModal.jsx` | **KEEP AS-IS** | |
| `quotes/QuoteDisplay.jsx` | **RENAME/RELABEL** | Update `Part`→`Supply` item type label; replace vehicle display with property address |
| `wizard/ServiceRequestWizard.jsx` | **KEEP AS-IS** | Orchestrates steps; no domain logic |
| `wizard/StepIndicator.jsx` | **KEEP AS-IS** | |
| `wizard/WizardStep.jsx` | **KEEP AS-IS** | |
| `wizard/CustomerStep.jsx` | **KEEP AS-IS** | |
| `wizard/VehicleStep.jsx` | **REWRITE** → `PropertyStep.jsx` | Replace vehicle form (year/make/model/VIN/mileage) with property form (address, type, stories, gutter linear feet, roof type). Include address duplicate detection |
| `wizard/WorkOrderStep.jsx` | **RENAME/RELABEL** | Update service type options for gutter/PW domain |
| `wizard/AppointmentStep.jsx` | **KEEP AS-IS** | |
| `scheduling/QuickScheduleModal.jsx` | **KEEP AS-IS** | |
| `parts/PartsSelector.jsx` | **DELETE** | No automotive parts catalog; supply picking handled by InventoryPickerModal |
| `vehicles/*` | **REWRITE** → `properties/*` | Any vehicle-specific sub-components rewritten as property equivalents |
| `followups/*` | **KEEP AS-IS** | Domain-agnostic follow-up components |
| `inventory/*` | **KEEP AS-IS** | Domain-agnostic inventory components |
| `invoice/*` | **RENAME/RELABEL** | Update `Part`→`Supply` item type label where displayed |

---

## Client — Utils (`src/client/src/utils/`)

| File | Action | Notes |
|------|--------|-------|
| `formatters.js` | **KEEP AS-IS** | Must stay synchronized with Phoenix |
| `permissions.js` | **KEEP AS-IS** | Role/visibility logic is domain-agnostic |
| `appointmentColors.js` | **REWRITE** | Update color map to new status enum values. Remove colors for: Inspected, Awaiting Approval, Parts Ordered, Parts Received, Repair In Progress, Repair Complete - Awaiting Payment, Ready for Pickup, Completed. Add: In Progress, Complete, Invoiced |
| `pdfUtils.js` | **REWRITE** | Update invoice PDF generation: replace vehicle info with property address; rename "Parts" section→"Supplies/Materials"; remove core charge line items; update company branding to Snyder's Gutters |
| `htmlUtils.js` | **KEEP AS-IS** | |
| `nameUtils.js` | **KEEP AS-IS** | |
| `pwaUtils.js` | **KEEP AS-IS** | |
| `HtmlDecoderTest.jsx` | **DELETE** | Test/debug file; should not be in source tree |

---

## Client — Contexts (`src/client/src/contexts/`)

| File | Action | Notes |
|------|--------|-------|
| `AuthContext.jsx` | **KEEP AS-IS** | Must stay synchronized with Phoenix |

---

## Client — Hooks (`src/client/src/hooks/`)

| File | Action | Notes |
|------|--------|-------|
| `usePersistedState.js` | **KEEP AS-IS** | Domain-agnostic localStorage hook |
| `useDragToReschedule.js` | **KEEP AS-IS** | Domain-agnostic calendar drag hook |

---

## Client — Root (`src/client/src/`)

| File | Action | Notes |
|------|--------|-------|
| `App.jsx` | **REWRITE** | Replace `/vehicles` routes with `/properties`. Remove `/parts` routes. Remove `/admin/vin` if present. Update route guards if needed |

---

## Project Root Files

| File | Action | Notes |
|------|--------|-------|
| `package.json` | **RENAME/RELABEL** | Update `name` to `snyders-gutters-crm`. Remove `openai` dependency |
| `package-lock.json` | **REWRITE** | Regenerate after package.json changes |
| `.env` | **REWRITE** | Remove `OPENAI_API_KEY`. Update app-specific values (DB name, JWT secret, etc.) |
| `.env.example` | **RENAME/RELABEL** | Remove `OPENAI_API_KEY`. Update comments |
| `README.md` | **REWRITE** | Update for new domain and business |
| `jest.config.js` | **KEEP AS-IS** | |
| `.gitignore` | **KEEP AS-IS** | |
| `CLAUDE.md` | **REWRITE** | Replace with `SNYDERS_CLAUDE.md` contents (this migration is the source of that file) |

---

## Summary Counts

| Category | Count |
|----------|-------|
| KEEP AS-IS | ~65 files |
| RENAME/RELABEL | ~25 files |
| REWRITE | ~30 files |
| DELETE | ~15 files |

---

## Migration Priority Order

Recommended order to minimize broken states during migration:

1. **Models** — Property, WorkOrder (status enum), Settings defaults, Invoice/Appointment field renames
2. **Utils** — calculationHelpers, populationHelpers (field renames)
3. **Server app.js** — remove deleted routes, add property routes
4. **Controllers** — propertyController (new), workOrderController (status/field updates), settingsController
5. **Routes** — propertyRoutes, workOrderRoutes (remove receipt endpoints)
6. **Client services** — propertyService (new), workOrderService, vehicleService removal
7. **Client App.jsx** — route table updates
8. **Client pages** — Properties (new), WorkOrders, Documents, TechnicianPortal
9. **Client components** — Sidebar, wizard PropertyStep, OnHoldReasonModal, WorkflowSummary
10. **Client utils** — appointmentColors, pdfUtils
11. **Delete files** — Part model/controller/routes/pages, VIN, registration, AI
