# Shop Supplies Module — Build Spec (Phase 1)

**Status:** Build-of-record.
**Audience:** A fresh Claude Code session with no prior context on this design.

---

## 0. Read This First

### 0.1 What you are building

A new shop-supplies inventory module in a new collection, **beside** the
existing `InventoryItem` — not a migration of it. The old table stays live and
wired to work orders and invoices throughout this phase. Nothing existing is
modified except one shared frontend component (§7).

### 0.2 Provenance

Every file path and line number in the original draft came from a prior
investigation session. **All of them have now been verified** against the
working tree at commit `6944c06` (2026-08-08). Results in §0.4; corrections are
folded inline throughout. Where a reference has since drifted it is marked
**[corrected]**.

### 0.3 Working discipline

- `docs/shop-supplies-backlog.md` is the parking lot. Findings, annoyances, and
  "we should really fix X" go there. Nothing gets fixed inline. This matters
  most at hour six.
- Phase boundaries in §8 are hard. If something feels like it belongs in Phase
  2, it belongs in Phase 2.
- Commit at section boundaries with messages that mark them.

### 0.4 Pre-build verification report

Run against commit `6944c06`, branch `main`.

#### Stack

| | Version |
|---|---|
| Node | `>=18.0.0` (engines) |
| Express | 4.22.2 |
| Mongoose | 7.8.9 |
| mongodb driver | 6.16.0 |
| React | 18.2.0 |
| react-router-dom | 6.30.4 |
| Client build | CRA 5.0.1 via `@craco/craco` 7.1.0, Tailwind 3.3.2 |
| Test | jest 29.5.0 + supertest 6.3.3 |
| Cache | `node-cache` 5.1.2 (already a dependency) |

#### Path existence

| Path | Status |
|---|---|
| `src/server/models/InventoryItem.js` | exists |
| `scripts/backfill-inventory-unit-pricing.js` | exists |
| `src/server/services/cacheService.js` | exists |
| `src/client/src/components/common/SearchableDropdown.jsx` | exists |

#### Test runner

`npm test` → `jest`, configured by `jest.config.js`:

```js
{ testEnvironment: 'node',
  roots: ['<rootDir>/src/server/__tests__'],
  testRegex: '\\.test\\.js$',
  testPathIgnorePatterns: ['node_modules'] }
```

Baseline: **8 suites, 258 tests, all passing**, ~18s. Client tests run
separately via craco and are excluded by `roots`.

**Material finding — no database in the test harness.** Every existing server
test mocks its Mongoose models (`jest.mock('../../models/X', () => createMockModel(...))`
— see `src/server/__tests__/routes/routePermissions.test.js:21-76`). There is
no `mongodb-memory-server` and no live connection. §9 has been rewritten around
this constraint.

`src/server/__tests__/permissions/permissions.test.js` re-implements the client
permission matrix inline and does not import `app.js`, so mounting a new router
cannot break it.

#### Markup **[corrected]**

Lives at `Settings.partMarkupPercentage` — `Number`, `default: 30`, `min: 0`
(`src/server/models/Settings.js:35-39`). It is a **percentage, not a fraction.**
The pricing invariant in §3.3 is restated accordingly. The `/100` form is
already the convention in `InventoryItemForm.jsx:24`,
`inventoryController.js:262`, `aiService.js:237`, and
`backfill-inventory-unit-pricing.js:60`.

#### `InventoryItem` schema, verbatim

```js
// AdjustmentLogSchema
{ adjustedBy: ObjectId ref User (required),
  previousQty: Number (required),
  newQty:      Number (required),
  reason:      String default 'Manual adjustment',
  createdAt:   Date default Date.now }

// InventoryItemSchema — { timestamps: true }
{ name:             String  required, trim
  partNumber:       String  trim
  category:         String  trim, default ''
  price:            Number  min 0, default 0
  cost:             Number  min 0, default 0
  vendor:           String  trim
  brand:            String  trim
  warranty:         String  trim
  url:              String  trim
  quantityOnHand:   Number  default 0, min 0
  unit:             String  default 'each', trim
  unitsPerPurchase: Number  default 1, min 1
  purchaseUnit:     String  trim, default ''
  reorderPoint:     Number  default 1, min 0
  packageTag:       String  trim, default ''
  notes:            String  trim
  isActive:         Boolean default true
  adjustmentLog:    [AdjustmentLogSchema] }

// indexes
{ isActive: 1, category: 1 }
{ isActive: 1, quantityOnHand: 1 }
```

Confirms the §5.2 import list. Two source fields had **no destination** in the
`ShopSupply` schema as originally specified: `vendor` and `warranty`.
**Resolved 2026-08-08 — `vendor` is added to the schema as a vocab ref;
`warranty` is deliberately dropped.** See §1.2 and backlog item 1 for the
reasoning and the cost.

---

## 1. Context

The existing inventory classifies items with a free-text `category` backed by
five Settings values (`Settings.inventoryCategories`: Fluids, PPE, Consumables,
Filters, Hardware). It is too coarse to find anything, has no referential
integrity, and collapses two different questions into one string:

- **"What is this for?"** — a judgment. Only a person can answer it.
- **"What is this?"** — a measurement. Anyone entering the item writes the same value.

The replacement keeps those separate, permanently:

| Construct | Holds | Example |
|---|---|---|
| **Tag tree** | Judgments | `Refinish & Body → Masking → Tape` |
| **Fields** | Measurements | brand, form, viscosity, grit, size |
| **Location** | Physical placement | `B3` |
| **Views** (Phase 2) | Anything a field implies | "flammable aerosols" |

The governing test for any new property: **would another person entering this
item write the same value?** Yes → field. No → tag.

Two hard rules follow, and they are the reason this design exists:

- **Never create a node whose membership a field could decide.** A node named
  "over 48in" or "high VOC" duplicates a computable fact by hand, and the
  hand-maintained copy drifts silently.
- **Never populate a tag with a guess.** A wrongly-tagged item looks finished
  from every angle. An untagged item is visible in the `Untagged (N)` filter.
  Blank beats wrong, every time.

This is also a pilot. The same model is intended for a much larger personal
inventory, so the goal is to surface failure modes at ~200 items.

### 1.1 Why clean-slate rather than migration

An earlier draft migrated in place and produced a design shaped by its
consumers: a redundant `packageTag` vocabulary kept for service-package
compatibility, the brand fix abandoned to protect receipt-import matching, and
item fields shaped by what `commitPart` expects. Tail wagging dog.

The old inventory needs replacing regardless, and building beside it removes
every compatibility compromise at the cost of one deferred wire-in phase.

### 1.2 Decisions locked

| Question | Decision |
|---|---|
| Old table | Untouched. Stays live and wired. |
| Scope | Shop supplies only — stocking and levels. |
| `packageTag` | Absent from the new schema. All 3 service packages will be deleted and rewritten after this ships. |
| `category` | Not carried over in any form. |
| Data load | One-time import from `InventoryItem`, everything untagged on arrival. |
| Shelf codes | Generic. `B3` is just `B3`, no row/column semantics. Bulk re-coding required. |
| Markup | Global shop setting (`Settings.partMarkupPercentage`). `price` stored at write time. |
| Tenancy | Single-tenant per deployment. |
| Browse sidebar | Deferred. Descendant-walking filter covers it. |
| `vendor` | **Carried over**, as a `SupplyVocab` ref (`fieldKey: 'vendor'`), not free text. |
| `warranty` | **Not carried over.** Defaults to "90 days", appears nowhere outside the old form; a parts-side concern that leaked into inventory. |

**Why `vendor` survived the cut.** It is not decorative on the old page: it is a
sortable column (`InventoryList.jsx:785-787`), it renders on the mobile cards
(`:705`, `:1115`), and it annotates every line of the **shopping list export**
(`:430` appends ` - {vendor}`). Since `GET /shopping-list` is in Phase 1 scope,
omitting vendor would ship a shopping list strictly worse than the one it
replaces. Modelling it as a vocab ref rather than the old free-text string keeps
it consistent with brand/form/unit/location — same cached payload, same generic
`ManageVocabModal`, same rename-propagates behaviour, and no
`Valvoline`/`valvoline`/`Valvoline Inc` fragmentation.

---

## 2. Preserved Findings

From prior investigation. **All verified** at commit `6944c06`. These cost
nothing now and matter at wire-in.

**`part.category` is read, not write-only.** Renders as a colored badge per part
row (`DocumentDetail.jsx:1760-1762` — confirmed exact), is a sortable "Cat."
column (`:1675-1676` — confirmed), populates the part edit form (`:835-842` —
confirmed), and sorts invoice line items (`InvoiceGenerator.jsx:157` —
confirmed), backed by `Settings.customCategories` (`Maintenance`, `Repair`,
`Fluid`, `Software/License`). It is a **billing** classification — how a line is
charged — not a description of what the supply is. At wire-in, do not bind it to
the tag tree. Either leave it for the writer to set, or add a settings-backed
tag → billing-category mapping.

**`partNumber` deliberately carries the brand string.** `aiService.js:207`
builds `partNumber: [brand, itemNumber].filter(Boolean).join(' ')`, commented as
matching the format of stored WO/inventory records; `finalizeParts` repeats it
at `:244` (both confirmed exact). `inventoryController.js:329` does the same for
`create_new` prefills. Duplicate detection at `workOrderController.js:2129-2133`
selects only `_id name partNumber` (confirmed) — `brand` is not in the
comparison payload, so the brand string inside `partNumber` is doing the
matching. Note the *inventory* receipt path is different:
`inventoryController.js:228` does select `brand`. The new schema keeps them
separate. At wire-in, any matching against supplies must compose
`[brand, partNumber]` at compare time rather than assuming the stored join.

**Single process.** `"start": "node server.js"` (confirmed) — no PM2, ecosystem
file, Procfile, or Docker. The in-memory tag cache with explicit invalidation is
correct. If cluster mode is ever adopted, workers serve a stale tree after any
mutation and a ~60s TTL becomes mandatory.

**Tenancy.** Single-tenant per deployment is the deliberate decision: each shop
gets its own database, because onboarding involves customization per business
model. Nothing in this schema carries a scope key. The one structural
concession: **keep all `ShopSupply` / `SupplyTag` / `SupplyVocab` queries inside
the service layer**, not inline in controllers, so a scope filter has exactly
one home if a shared-database tier is ever offered.

---

## 3. Data Model

Four new collections. Nothing existing is modified.

### 3.1 `src/server/models/SupplyTag.js`

```js
{
  name:      String,   // required, trim
  slug:      String,   // required, unique, lowercase
  parent:    ObjectId, // ref SupplyTag, null = top-level phase
  sortOrder: Number,   // default 0
  kind:      String,   // 'judgment' | 'derived', default 'judgment'
  notes:     String    // fields this node will contribute in Phase 2
}
// timestamps: true
// index { parent: 1, sortOrder: 1 }; unique index on slug
```

**No `isActive`.** Deactivating a node that has items on it makes those items
invisible in both directions — absent from tree browse, and absent from
`Untagged (N)` because they *do* have tags. Delete-if-childless-and-unused is
the control; a second, weaker one is just a hiding place.

**`kind` exists now so the Phase 2 depth rule needs no schema change.** The
`pre('validate')` walk hard-blocks at **3 tiers of `kind: 'judgment'` nodes,
counting judgment ancestors only.** Phase 2 derived leaves (e.g. Abrasives →
Discs → 80/120/220/320+, computed from a grit field) must stay legal at tier 4.
Phase 1 creates no derived nodes, but the constraint is expressible from day one.

**The check is on the subtree, not the node. [added during §3]** Validating only
the node being saved leaves the ceiling trivially bypassable by reparenting:
move a tier-1 branch that already has two tiers under it beneath a tier-2 node
and the moved node is legal at tier 3 while its leaves land at tier 5.
Reparenting is the tag manager's whole job, so `validateSubtreePlacement` walks
every descendant of the moved node and rejects naming the deepest offender. A
derived node in the chain does not launder depth for judgment nodes below it.

### 3.2 `src/server/models/SupplyVocab.js`

```js
{ fieldKey:  String,   // 'brand' | 'vendor' | 'form' | 'unit' | 'location'
  value:     String,
  label:     String,
  sortOrder: Number,
  isActive:  Boolean }
// unique index { fieldKey: 1, value: 1 }
```

`isActive` **is** kept here — retiring a vocab value is harmless, since items
reference it and stay visible.

Locations live here as `fieldKey: 'location'`, with no row/column meaning. That
is what makes bulk re-coding (prefixing every code with a room number) a plain
document rename.

### 3.3 `src/server/models/ShopSupply.js`

| Field | Type | Notes |
|---|---|---|
| `name` | String | **optional override.** Blank = derive; see below |
| `qualifier` | String | the part of the name that isn't derivable |
| `brand` | ObjectId → SupplyVocab | nullable; properly separate from any part number |
| `vendor` | ObjectId → SupplyVocab | nullable; who we stock it from. Distinct from `brand` — who makes it. |
| `partNumber` | String | manufacturer number only, **no brand prefix** |
| `tags` | [ObjectId] → SupplyTag | all tags, primary included |
| `primaryTag` | ObjectId → SupplyTag | nullable; the canonical home |
| `form` | ObjectId → SupplyVocab | aerosol, liquid, solid, paste, gel, powder |
| `location` | ObjectId → SupplyVocab | generic code, freely overridable |
| `quantityOnHand` | Number | counted in `stockUnit` |
| `stockUnit` | ObjectId → SupplyVocab | |
| `purchaseUnit` | ObjectId → SupplyVocab | nullable |
| `unitsPerPurchase` | Number | default 1 |
| `reorderPoint` | Number | stored; nothing acts on it in Phase 1 |
| `cost` | Number | per purchase unit |
| `price` | Number | per stock unit |
| `priceOverridden` | Boolean | default false; see below |
| `sdsUrl`, `url`, `notes` | String | |
| `isActive` | Boolean | soft delete, house convention |

Indexes: `{ isActive: 1, tags: 1 }`, `{ isActive: 1, location: 1 }`,
`{ isActive: 1, vendor: 1 }`, `{ isActive: 1, name: 1 }` — the old table's
default sort key was unindexed
(confirmed: `InventoryItem` sorts `{ name: 1 }` at `inventoryController.js:48`
but indexes only `category` and `quantityOnHand`).

**Names are derived, not typed. [added 2026-08-09]** "Mobil 1 5W-30 Engine Oil"
is not a name — it is a brand, a measurement and a tag concatenated by hand.
Typing it stores those facts twice, and the typed copy is the one that goes
stale. So `displayName` is composed on read:

```
Brand  PartNumber  Measurements  Noun  (Qualifier)
Mobil 1            5W-30         Engine Oil  (full synthetic, dexos-d)
Bosch  3330                      Oil Filter  (pre-filled with oil)
```

Only measurements from the **primary tag** are used — a secondary tag describes
the item's other door, not its identity. `SupplyTag.noun` carries the standalone
phrase where a leaf name only reads correctly in context (the node under
Filters is called "Oil"; its noun is "Oil Filter").

**Never stored.** A stored copy would need a cascade whenever a brand label or
tag noun changed — exactly the machinery the vocab-as-references design exists
to avoid. The consequences: **search and sort both run in memory** over the
composed name, because the string the user searches for exists in no single
column. That is affordable only because §8 excludes server-side pagination; if
that changes, this needs a denormalized search key and the cascade it implies.

`name` survives as an override for things that genuinely have a name rather than
a description (Shop Towels), and it is what keeps every imported item readable
before anyone has triaged it. A save is refused when an item would have nothing
to call it at all.

**Vocab as references, not strings.** This is the one place worth diverging from
the old design. Renaming a vocab document propagates instantly to every item, so
bulk shelf re-coding needs no cascade machinery, and
`Valvoline` / `valvoline` / `Valvoline Inc` fragmentation becomes structurally
impossible. Serve the whole vocab as one cached payload and join client-side
rather than populating per query.

**Pricing invariant — document this on the schema. [corrected]**

```
markup = Settings.partMarkupPercentage        // a PERCENTAGE, e.g. 30
price  = (cost / unitsPerPurchase) × (1 + markup / 100)
```

`markup` is a **global shop setting**, not a per-item field. `price` is
**written at create/edit time and stored — never recomputed on read.** Changing
the shop markup therefore does **not** retroactively move existing prices; a
repricing pass would be a separate explicit operation. `priceOverridden: true`
means the user typed a price directly and that item is detached from the calc.

Round with `parseFloat(x.toFixed(2))`, matching
`backfill-inventory-unit-pricing.js:77` and `InventoryItemForm.jsx:35`.

### 3.4 `src/server/models/SupplyMovement.js`

The old `adjustmentLog` is an unbounded embedded array with stringly-typed
reasons, no foreign key to the work order, and no record of which unit a
movement was expressed in. Clean slate is the only cheap moment to fix it.

```js
{ supply:       ObjectId,  // ref ShopSupply, indexed
  type:         String,    // 'count' | 'receive' | 'consume' | 'adjust' | 'return' | 'import'
  quantity:     Number,    // signed, expressed in `unit`
  unit:         ObjectId,  // ref SupplyVocab — records what was actually counted
  resultingQoh: Number,
  sourceModel:  String,    // nullable
  sourceId:     ObjectId,  // nullable FK to WorkOrder etc.
  note:         String,
  createdBy:    ObjectId }
```

Movements only. No auto-reorder, no analytics, no rollups. **This is the
designated cut line** — if the build runs long, drop this model and the
`/adjust` endpoint and write quantities directly. Nothing else depends on it.

### 3.5 `src/server/services/supplyTagService.js`

`getTree()`, `getDescendantIds(idOrSlug)`, `invalidate()`. In-memory cache of the
~100-node tree, invalidated on any tag mutation. Follow `cacheService.js`
conventions — it exposes generic `get(key)` / `set(key, value, ttl)` /
`invalidateByPattern(prefix)`, so a `supplytags:` namespace slots in without
touching that file. Single-process — see §2.

Descendant resolution happens **in memory**. No closure table, no recursive
aggregation, no materialized ancestors on items. Query shape is
`find({ tags: { $in: descendantIds } })` against the multikey index. Because
ancestors are never stored on items, nothing can drift when a tag is reparented.

---

## 4. The Tag Tree

Top tier is **job phase** — what the tech is doing — because that is what a
person on the floor navigates by. Each branch is then allowed its **own**
second-tier criterion: substrate under Cleaning, vehicle system under Service
Fluids, coating stage under Refinish. There is no formal principle unifying
those criteria beyond "where would someone look for this." That is an accepted
cost and is more defensible here than elsewhere, because the phases genuinely
differ in what distinguishes their members.

```
Chemicals & Fluids
├── Cleaning & Detailing          [by substrate]
│   ├── Glass
│   ├── Wheel & Tire
│   ├── Interior — Carpet & Upholstery
│   ├── Exterior Wash
│   └── Degreasers & All-Purpose
├── Service Fluids                [by vehicle system]
│   ├── Engine Oil                        notes: viscosity
│   ├── Transmission & Gear Oil           notes: viscosity
│   ├── Brake Fluid                       notes: DOT rating
│   ├── Coolant & Antifreeze              notes: spec/color
│   ├── Power Steering
│   ├── Washer Fluid
│   └── Refrigerant                       notes: refrigerant type
├── Lubricants & Penetrants
│   ├── Grease                            notes: NLGI grade
│   ├── Penetrating Oil
│   ├── Dry & Specialty Lubricants
│   └── Assembly Lube
└── Shop Chemicals
    ├── Solvents & Thinners
    ├── Brake & Parts Cleaner
    ├── Hand Cleaner
    └── Battery & Terminal

Refinish & Body
├── Surface Prep
│   ├── Wax & Grease Remover
│   ├── Adhesion Promoter
│   ├── Etch & Conversion Coating
│   └── Panel Wipe
├── Fillers & Putties
│   ├── Body Filler
│   ├── Glazing Putty
│   └── Fiberglass & Reinforced Filler
├── Abrasives
│   ├── Discs                             notes: grit, diameter
│   ├── Sheets & Rolls                    notes: grit
│   ├── Pads & Scuff                      notes: grit
│   └── Compounds & Polishes
├── Coatings
│   ├── Primer
│   ├── Basecoat
│   ├── Clearcoat
│   ├── Single Stage
│   └── Reducers, Hardeners & Additives   notes: temp range
└── Masking
    ├── Tape                              notes: width
    ├── Paper                             notes: width
    ├── Film & Plastic
    └── Foam & Jamb

Consumable Hardware
├── Fasteners & Clips
│   ├── Trim & Body Clips
│   ├── Threaded Fasteners                notes: thread, length
│   └── Rivets
├── Electrical Consumables
│   ├── Terminals & Connectors            notes: gauge
│   ├── Wire & Loom                       notes: gauge
│   ├── Heat Shrink & Electrical Tape
│   └── Fuses & Relays                    notes: amperage
└── Adhesives & Sealants
    ├── Urethane & Glass
    ├── Seam Sealer
    ├── Threadlocker                      notes: strength
    ├── RTV & Gasket Maker
    └── Structural & Panel Bond

Shop & Safety Consumables
├── PPE
│   ├── Gloves                            notes: size, material
│   ├── Respiratory
│   ├── Eye & Face
│   └── Protective Clothing               notes: size
├── Absorbents & Spill
│   ├── Floor Dry
│   ├── Pads & Socks
│   └── Spill Kits
├── Wipes, Rags & Towels
│   ├── Shop Towels
│   ├── Tack Cloth
│   ├── Microfiber
│   └── Paper Products
├── Mixing & Application
│   ├── Mix Cups & Sticks                 notes: volume
│   ├── Strainers & Filters               notes: mesh
│   ├── Spray Gun Consumables
│   └── Brushes & Applicators
└── Disposal & Waste
    ├── Waste Oil
    ├── Used Filters
    ├── Sharps & Blades
    └── Chemical Waste

Service Parts
├── Filters
│   ├── Oil
│   ├── Air
│   ├── Cabin
│   └── Fuel
├── Wipers                                notes: length
└── Bulbs                                 notes: bulb number
```

~100 nodes across 5 tier-1 branches. **Service Parts** exists because filters
are stocked, counted and reordered — the system treats them as supplies
regardless of how a future parts/interchange module resolves. Its phase is
"replacing a wear item during service."

### 4.1 Tree rules

- **3–12 children per node** is a **warning, not a constraint.** It cannot be
  enforced at save time — you'd never be able to reach three. Surface it as a
  badge in the tag manager.
- **3 judgment tiers is a hard block.** Enforced in `pre('validate')`.
- **Tag at the deepest node you're confident in.** Ancestors are derived by
  walking `parent`. Never tag both a node and its parent.
- **No junk-drawer node.** Something not fitting is a signal the tree needs a
  branch, not a "Misc" bucket.

---

## 5. Seeding and Data Load

Both scripts follow `scripts/backfill-inventory-unit-pricing.js` conventions
(verified): `dotenv.config({ path: '../.env', override: true })` → read
`process.env.MONGODB_URI` and bail if absent → `mongoose.connect` →
**dry-run unless `--execute`** (`!process.argv.includes('--execute')`) → boxed
console header → write a JSON log file → `mongoose.disconnect()` →
`main().catch(err => { console.error(...); process.exit(1); })`.

### 5.1 `scripts/seed-supply-tags.js`

Idempotent upsert by slug of the full tree in §4, wiring `parent` and
`sortOrder` and populating `notes` as annotated. Also seeds `SupplyVocab`:

- `form` — aerosol, liquid, solid, paste, gel, powder
- `location` — the shop's shelf codes
- `unit` — a starting set (each, can, quart, gallon, box, roll, sheet, ft, lb)
- `vendor` — seeded from `Settings.customVendors` filtered to entries whose
  `usedFor` includes `'inventory'`, unioned with `distinct('vendor')` from
  `InventoryItem` so no existing value is lost. **Read-only against `Settings`**
  — §8 forbids modifying it. The two lists are free to drift after seeding; see
  backlog item 1.
- `brand` — seeded from `distinct('brand')` on `InventoryItem` (§5.2)

This script also owns applying the **collection validator** described in §6a
(via `db.command({ collMod: 'shopsupplies', validator: …, validationLevel: 'moderate' })`,
creating the collection first if absent) — it is a DDL concern, not an
application-startup concern.

No backup needed; it only inserts into new collections.

### 5.2 `scripts/import-shop-supplies.js`

One-time load from `InventoryItem`. **Reads only — never writes to the source
collection.**

Carries over: `name`, `partNumber`, `quantityOnHand`, `cost`, `price`,
`unitsPerPurchase`, `unit` → `stockUnit` and `purchaseUnit`, `vendor`
(all resolved to `SupplyVocab` refs, creating missing vocab entries as it goes),
`reorderPoint`, `notes`, `url`, `isActive`.

**`vendor` resolution:** trim and case-fold to match an existing
`fieldKey: 'vendor'` vocab entry; create one on miss, preserving the source
casing as `label`. Report created-on-the-fly vendors in the dry-run output —
a long tail there is the fragmentation this schema exists to stop, and is worth
eyeballing before `--execute`.

**Does not carry over, deliberately:**

- `category` — no mapping table, no guessing. Every item lands
  `tags: []`, `primaryTag: null`, and is triaged through the `Untagged (N)`
  filter in the new UI. A wrongly-mapped tag looks finished; blank does not.
- `packageTag` — absent from the new schema. Service packages are being deleted
  and rewritten.
- `warranty` — no destination field in `ShopSupply`, deliberately. Defaults to
  "90 days" on the old form and is read nowhere else. See §1.2.
- Brand extraction from `partNumber` — see §2. Splitting `"Bosch 0986AB1234"`
  programmatically is guesswork. Seed `SupplyVocab` brands from
  `distinct('brand')` on the source (the field **does** exist on
  `InventoryItem`), map it to a ref where populated, leave `brand` null
  otherwise, and surface a **"brand missing"** badge in the list so it's filled
  during the same triage pass as tagging. Leave `partNumber` byte-identical to
  the source — do not strip a brand prefix out of it.

Writes one `SupplyMovement` per item with `type: 'import'` so quantities have a
provenance record.

Dry-run reports counts by disposition; `--execute` performs the load.

**Re-runnable:** guard on an existing `ShopSupply` with the same source id (or
truncate-and-reload, given the collection is new). Do not create duplicates on a
second run.

---

## 6. API

New router `src/server/routes/supplyRoutes.js` mounted at `/api/supplies`.
Register in `src/server/app.js`: `require` alongside the other routers (the
`inventoryRoutes` require is at `:42`) and `app.use` next to
`app.use('/api/inventory', inventoryRoutes)` at `:173`. `/api/inventory` stays.

Reads open to all authenticated. Item mutations
`restrictTo('admin','management','service-writer')` — `inventoryRoutes.js:10`
names this local const `officeStaff`; reuse the name. Tag and vocab CRUD
`restrictTo('admin','management')`. **Declare specific paths before `/:id`** —
existing convention, see `inventoryRoutes.js:12-17`.

| Route | Notes |
|---|---|
| `GET /api/supplies` | filters: `tag` (slug or id, descendant walk), `untagged`, `brand`, `vendor`, `form`, `location`, `search`, `active` |
| `POST /` · `PATCH /:id` · `DELETE /:id` | CRUD; delete is soft (`isActive: false`) |
| `PATCH /:id/adjust` | quantity movement; writes a `SupplyMovement` |
| `PATCH /bulk` | `{ ids, set: { location?, addTags?, removeTags?, primaryTag? } }` |
| `GET /shopping-list` | `quantityOnHand <= reorderPoint`; returns `vendor` so the export can annotate lines the way `InventoryList.jsx:430` does today |
| `GET /tags` | flat array + parent ids; client builds the tree |
| `POST /tags` · `PATCH /tags/:id` · `DELETE /tags/:id` | create / rename-reparent-sort / **409 unless childless AND unused** |
| `GET /vocab` · `POST /vocab` · `PATCH /vocab/:id` · `DELETE /vocab/:id` | delete refuses if referenced |

Use an explicit field allow-list, but **define it once as a shared constant.**
The old controller duplicates its allow-list across `createItem`
(`inventoryController.js:75-79`) and `updateItem` (`:101-120`) — confirmed
exact — so adding a field means editing two places or having it silently
dropped. Do not repeat that.

Search must use `escapeRegex` and the 100-char cap, matching
`inventoryController.js:36`. Note it can only regex the **string** fields —
`name`, `partNumber`, `notes`. The old `$or` also matched `vendor` and `brand`
(`inventoryController.js:37-43`); those are refs now, so they are reached by
their dropdown filters instead. If free-text over them is wanted later, resolve
the term against the cached vocab client-side and pass the matching ids as
filters — do not `$lookup`.

### 6a. Enforcing the tag invariant

Mongoose `pre('validate')` is **document** middleware — it fires on `.save()`
and `.validate()` only. `runValidators: true` on `findByIdAndUpdate` runs
path-level validators against the paths in the update; it never runs a document
hook or any cross-field check. **Every query-style write bypasses it:**
`PATCH /bulk` (where `removeTags` can strip the current `primaryTag`),
`PATCH /:id` (the likelier path — a user unchecking a tag in the picker), and
any raw-driver `bulkWrite` in `scripts/`.

**Decision: reject with 400. Never auto-promote.** The primary tag is the
canonical home that drives Phase 2's field set and the rollup counts. Promoting
an arbitrary survivor lets array order silently decide it.

Implementation:

- **One shared helper**, `validateTagAssignment(tags, primaryTag)`, returning a
  structured error. Every write path calls it. The `pre('validate')` hook is a
  backstop, never the only defence. Keep it in a plain module with no Mongoose
  import so it is unit-testable without a database.
- `PATCH /:id` resolves the intended final `tags` / `primaryTag`, runs the
  helper, then issues the update — keeping the single-query shape.
- **`PATCH /bulk` preflights the whole batch.** Load the affected items, compute
  each resulting state, and if any would violate, reject the entire operation
  with 400 returning the offending ids and names, so the UI can say "3 items
  would lose their primary tag." Failing on first offender leaves the user
  guessing; partial application is worse. Only after preflight passes does the
  single `bulkWrite` run.
- **Tag delete counts `{ $or: [{ tags: id }, { primaryTag: id }] }`** — checking
  `tags` alone is only sufficient if the invariant already holds, which is
  circular. The count-then-delete TOCTOU race is **accepted** at this user
  count; a follow-up `updateMany` sweep is the control. Revisit only if the
  sweep reports a hit — not worth a transaction and the replica-set commitment
  it implies.

**Two strengths, deliberately:**

- **Collection validator (permissive):** *if* `primaryTag` is set, it must
  appear in `tags`. **Must explicitly allow `primaryTag: null` with
  `tags: []`** — untagged is the normal state for every imported item, and a
  stricter validator would reject the import's own output. Apply with
  `validationLevel: 'moderate'`, from the seed script (§5.1). Given this repo's
  pattern of raw-driver `bulkWrite` in `scripts/`, this is the only layer that
  catches a future ad-hoc script.
- **Application helper (strict):** additionally rejects non-empty `tags` with a
  null `primaryTag` — such an item is invisible to every rollup.

**Status: the collection validator is NOT installed. [found during build]**
Applying it needs the `dbAdmin` role, and the Atlas application user this
deployment connects with does not have it — `collMod` returns
`AtlasError 8000: user is not allowed to do action [collMod]`. The seed script
treats this as non-fatal: it warns, records `SKIPPED — insufficient privileges`
in its log, and seeds the tree anyway.

What that costs is precisely the raw-driver case and nothing else. Every write
that goes through the app calls `validateTagAssignment` in the service layer,
and that is verified end-to-end. What is missing is the backstop against a
future ad-hoc script in `scripts/` writing around the app — which, given this
repo's existing pattern of raw `bulkWrite` in exactly that directory, is a real
if narrow gap. To close it: grant the database user `dbAdmin` and re-run the
seed, which is idempotent.

---

## 7. Frontend

New page at `/supplies`, registered in `App.jsx` next to the
`<Route path="/inventory" …>` at `:170`, and in `Sidebar.jsx` next to the
`Shop Inventory` nav entry at `:98`. The existing `/inventory` page stays
exactly as it is until wire-in; both appear in the nav during the transition.

New, in `src/client/src/components/supplies/`:

**`SupplyList.jsx`** — the page. Learn from `InventoryList.jsx` (**1115 lines**
[corrected from 1180], three inline modals, a hand-rolled table duplicated
against mobile cards) and instead use the shared primitives that page ignores:
`Modal.jsx`, `ResponsiveTable.jsx`, `Button.jsx`, `Input.jsx`. Filters: tag
(descendant walk), `Untagged (N)`, location, brand, vendor, search. Row
checkboxes plus a bulk action bar → `PATCH /bulk`. Columns include Location,
Vendor (sortable, matching `InventoryList.jsx:785-787`) and a
**"brand missing"** badge.

**`SupplyForm.jsx`** — create/edit. Vocab fields use the combobox below; tags
via `TagPicker`. Keep the bidirectional cost↔price calc and the override
checkbox from `InventoryItemForm.jsx:24-55` (confirmed — `handleCostChange`,
`handlePriceChange`, `handleUnitsPerPurchaseChange`, all three gated on
`overridePrice`) — that behavior works and is liked. Wire the override to
`priceOverridden`.

**`TagPicker.jsx`** — modal tree picker; primary vs secondary via a star toggle.
Enforces the strict invariant client-side (any tag requires a primary). Reuse
the removable-chip pattern from `SettingsPage.jsx:1308-1318` [corrected from
1299-1335, which is the enclosing Makes block].

**`ManageTagsModal.jsx`** — admin create/rename/reparent/delete. Surfaces the
3–12 children warning as a badge, hard-blocks judgment depth > 3, shows the
in-use count behind a blocked delete.

**`ManageVocabModal.jsx`** — one generic modal parameterized by `fieldKey`,
serving brand / vendor / form / unit / location. Vendor gets no special
treatment here; it is a vocab like any other. The old form's "Other" free-text
escape (`InventoryItemForm.jsx:185-199`) is replaced by
`SearchableDropdown allowCreate`, which adds the typed value to the vocab
rather than storing an unmanaged string.

**Changed — the only shared-code edit:** `SearchableDropdown.jsx` gains an
`allowCreate` prop. It is currently select-only (confirmed: `choose()` only ever
emits `opt.value` or `null`; the query state is discarded on close) and will not
accept a typed value, which vocab-with-add requires. Extend it rather than
adding a second combobox. Call sites to re-verify: `VehicleForm.jsx`,
`ReceiptImportModal.jsx`, `InventoryReceiptImportModal.jsx` — three files, all
of which must keep working unchanged when `allowCreate` is absent.

### 7.1 Entry ergonomics

~200 items get triaged through this UI, much of it in one sitting. A modal that
closes after every save is a bad afternoon. Build the add/edit flow to keep
focus in the form, default `location` and `primaryTag` to the last used, and
support save-and-next from the keyboard. This is not polish — it's the
difference between the triage pass happening and not happening.

**Deferred:** `SupplyTagTree.jsx`, the browse sidebar with descendant rollup
counts. Heaviest frontend piece, least load-bearing. The cut must not remove
subtree browse — hence the descendant-walking filter above.

---

## 8. Explicitly Out of Scope

- **Wire-in.** Work orders, service packages, invoices, and the AI parts pullers
  all continue to use `InventoryItem`. Connecting them is the follow-on phase,
  informed by §2.
- Deleting or modifying `InventoryItem`, its page, its routes, or `Settings`.
- ~~**Field registry**~~ — **BUILT 2026-08-08**, ahead of schedule. Pulled
  forward because deferring it had a concrete, one-directional cost: every item
  entered before it existed would carry its measurements in the name
  ("Motor Oil 5W-30"), and extracting them later is manual per item. Cheap at
  one item, meaningful at two hundred — so the decision had to be made *before*
  the triage pass, not after.

  As built: `SupplyField` holds global definitions; `SupplyTag.fields`
  references them, so grit on Discs and grit on Sheets & Rolls is one field and
  filters as one. `ShopSupply.attributes` is a Map keyed by field key, with keys
  whitelisted against the registry on every write and every filter. Fields
  inherit **down** the tree (a field on Service Fluids applies to Engine Oil),
  walked at read time and never stored on the item, so re-parenting needs no
  migration. Primary tag's fields are required; secondary tags' are optional —
  tagging an item through a second door must not tax it with new obligations.

  Scope was bounded to the **19 fields already annotated on tag nodes during
  design**, not opened up generally. The seed script fails if a field is defined
  but unused by any tag, which is the mechanical guard against the
  eighty-fields-forty-used-twice failure mode.

  Still Phase 2: an admin UI for adding fields and binding them to nodes. Today
  that is a `FIELDS` edit in `scripts/seed-supply-tags.js` plus a re-run.
- **Derived nodes** — field-computed leaves. When built: evaluated at read time,
  never written to the junction, always terminal, always placed *below* the
  judgment node they subdivide. Phase 2.
- **Value hierarchies** — vocabularies that are themselves trees
  (Metal → Aluminum → 6060). Phase 3.
- Saved views, collections, auto-reorder, consumption analytics.
- Server-side pagination.

---

## 9. Verification **[rewritten]**

Because nothing existing is touched, verification is mostly about the new
surface — a large derisking versus the migration approach.

### 9.1 Harness constraint

The original §9 assumed tests could exercise real query semantics. **They
cannot.** `jest.config.js` runs `testEnvironment: 'node'` over
`src/server/__tests__` with every model `jest.mock`ed; there is no
`mongodb-memory-server` and no live connection. Adding one is a new devDependency
and a Phase-1 scope expansion, so the tests below are split by what the harness
can actually assert. **No new dependencies.**

**Baseline to preserve: 8 suites, 258 tests, all green.** No existing test
should need editing; if one does, something was modified that shouldn't have
been. `SearchableDropdown` is the one shared edit — its three call sites
(§7) are client-side and not covered by the server suite, so they are checked
manually.

### 9.2 Pure unit tests — no DB, no mocks

The load-bearing logic is deliberately extracted into Mongoose-free modules
precisely so it can be tested here.

- `validateTagAssignment(tags, primaryTag)`:
  - `([], null)` → valid (the normal post-import state).
  - `([a, b], a)` → valid.
  - `([a, b], c)` → invalid, primary not in tags.
  - `([a, b], null)` → invalid under the strict helper (§6a).
  - `([], a)` → invalid.
  - Compares by string id, not object identity — pass `ObjectId`s and strings
    mixed and assert both resolve the same.
- Tree walk, against a fixture tree (plain objects, no DB):
  - `getDescendantIds(tier1)` returns the node plus every descendant.
  - `getDescendantIds(leaf)` returns just the leaf.
  - Depth rule: a 4th `kind: 'judgment'` tier rejects; a `kind: 'derived'`
    child at tier 4 is allowed; a derived node under two judgment tiers is
    allowed.
  - Subtree depth: a reparent that keeps the moved node legal but pushes a
    *descendant* past the ceiling rejects, and the error names the offender.
    A judgment node under a derived node still counts its judgment ancestors.
    Promoting a deep branch to top-level stays legal — that's the repair path.
  - Cycle guard: a `parent` chain that loops terminates rather than hanging.
- Pricing: `(cost / unitsPerPurchase) × (1 + markup/100)` rounded to 2dp, with
  `unitsPerPurchase` of 1 and 5, and `priceOverridden` short-circuiting.
- Bulk preflight: given a batch of item states and a `set` payload, returns
  exactly the offending ids — pure function over inputs, no I/O.

### 9.3 Route tests — supertest + mocked models

Following `routePermissions.test.js`. These assert wiring and refusal, not query
semantics.

- Role matrix on every new route: reads allowed for `technician`; item mutations
  403 for `technician`, allowed for `service-writer`; tag/vocab CRUD 403 for
  `service-writer`, allowed for `management`.
- Route ordering: `GET /api/supplies/shopping-list` and `GET /api/supplies/tags`
  hit their handlers and are **not** swallowed by `/:id`.
- `PATCH /bulk` with `removeTags` containing an item's `primaryTag` and no
  replacement → 400, **and `bulkWrite` was never called** (assert on the mock).
- Same call with a valid replacement `primaryTag` → 200, `bulkWrite` called once.
- Mixed batch where only some items would be orphaned → 400 whose body lists
  exactly the offending ids, `bulkWrite` not called.
- `PATCH /:id` clearing `tags` while `primaryTag` is set → 400; clearing both
  together → 200.
- `DELETE /tags/:id` → 409 when the usage count mock returns > 0, including
  when the item references the tag **only** as `primaryTag` (assert the query
  passed to `countDocuments` contains the `$or`).
- `DELETE /tags/:id` → 409 when children exist.
- `DELETE /vocab/:id` → 409 when referenced.

### 9.4 Moved to manual verification

These are real requirements that the mocked harness cannot honestly assert.
They move to the §9.5 checklist rather than being faked:

- Descendant-walk filtering actually returning items tagged on child nodes.
- `untagged=true` returning exactly the untagged set.
- Vocab rename propagating with no cascade.
- The collection validator accepting `{ tags: [], primaryTag: null }` and
  rejecting a set primary absent from `tags`.

### 9.5 Manual, via `npm run dev`

`npm run build` must exit 0 first.

1. Seed the tree; confirm ~100 nodes and correct parenting.
2. Import dry-run → read the report → `--execute`. Every item lands untagged;
   count matches the source. Read the created-on-the-fly vendor list before
   executing — a long tail there is fragmentation worth collapsing first.
3. Filter by a tier-1 tag; confirm descendants appear.
4. Compose tag + brand + vendor + location filters.
5. `Untagged (N)` count equals the imported total, and drops by one per item
   tagged.
6. Tag an item with a primary and a secondary — **brake cleaner is the designed
   test case**, Shop Chemicals primary, Surface Prep secondary — and confirm
   it's reachable through both doors and counted once.
7. Bulk-assign a location.
8. Rename a location vocab value; confirm every item follows with no cascade.
   Repeat for a **vendor** value — same mechanism, but this is the one the old
   free-text field could not do at all, so it's worth seeing work.
9. `GET /shopping-list` returns vendor, and the export annotates lines the way
   the old one did. Compare against `/inventory`'s export for the same items.
10. Against the seeded validator: attempt a raw `db.shopsupplies.updateOne` that
    sets a `primaryTag` not in `tags`; confirm it is rejected. Confirm
    `{ tags: [], primaryTag: null }` inserts fine.
11. `SearchableDropdown` regression: open `VehicleForm`, the WO receipt import,
    and the inventory receipt import; confirm each dropdown still selects
    normally with `allowCreate` unset.
12. Open `/inventory` and a work order; confirm both are **completely
    unaffected**.

---

## 10. Pilot Watch Items

Record to `docs/shop-supplies-backlog.md`. Do not fix inline.

1. **Does the primary/secondary split earn its keep?** Brake cleaner is the
   test. If in practice items get one tag and nobody misses the other door,
   `primaryTag` and secondary tags may be unnecessary complexity for the
   personal inventory that follows.
2. **Does phase-first ordering survive a second technician?** The tree was built
   around "where would *I* look." A multi-user shop is a harder test than the
   personal inventory will ever apply.
3. **Where does 3–12 break first?** Service Fluids (7 and growing) and Coatings
   at the ceiling; Service Parts (3) at the floor — the expectation there is
   growth, not merging upward.
4. **What fields do items want that the schema lacks?** This is the input to the
   Phase 2 field registry, which has a strong pull toward proliferation. Fifteen
   well-chosen fields covering 90% of items is maintainable; eighty fields where
   forty are used twice is abandonware. Note wants, don't add columns.
5. **Service Parts vs. the parts module.** If a separate parts/interchange DB
   later claims filters, this branch either moves or becomes the stocking view
   of items catalogued elsewhere. Note which way it pulls.
6. **How long the two systems coexist.** Two inventory pages in the nav is
   tolerable for weeks, corrosive for months. Completing the triage pass is the
   natural trigger to schedule wire-in.
